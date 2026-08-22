//! On-disk JSON contract for every file the shell persists.
//!
//! App data outlives the build that wrote it. Every reader in this crate goes
//! through this module so a schema change cannot brick an install.
//!
//! ## Rules
//!
//! 1. **Every field is optional on read.** Callers use `#[serde(default)]` and
//!    never `deny_unknown_fields`. An older file is missing fields; a newer
//!    file has unknown ones. Both must load.
//! 2. **An unreadable file is never fatal.** [`read_json_opt`] quarantines it
//!    (`*.corrupt-<ts>`) and returns `None`. Setup continues with defaults.
//! 3. **Writes are atomic.** [`write_json`] writes a sibling temp file and
//!    renames, so a crash or a full disk cannot leave a truncated file.
//! 4. **Identity is additive.** A stored key's *meaning* is never reused.
//!    New identity formats get a new prefix and keep the old builder in
//!    `node_key`; a successful resolve is rewritten in the current form.
//!
//! `schemaVersion` is documentation, not a migration engine. Adding a field
//! does not require bumping it. Never change what an existing field means —
//! add a new field and keep reading the old one.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Read persisted JSON, treating a missing or unreadable file as "no state".
pub fn read_json_opt<T: for<'de> Deserialize<'de>>(
    path: &PathBuf,
) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(e) => {
            log::warn!("read {}: {e} — continuing without it", path.display());
            return Ok(None);
        }
    };
    match serde_json::from_str(&raw) {
        Ok(value) => Ok(Some(value)),
        Err(e) => {
            log::warn!(
                "parse {}: {e} — quarantining and using defaults",
                path.display()
            );
            quarantine(path);
            Ok(None)
        }
    }
}

/// Atomic replace. The previous file stays intact if this fails mid-write.
pub fn write_json<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(value)
        .map_err(|e| format!("serialize {}: {e}", path.display()))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }

    let mut tmp = path.clone();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "state.json".into());
    tmp.set_file_name(format!("{name}.tmp"));
    fs::write(&tmp, raw).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    set_owner_only(&tmp)?;
    fs::rename(&tmp, path).map_err(|e| format!("replace {}: {e}", path.display()))?;
    set_owner_only(path)?;

    Ok(())
}

/// Move an unreadable file aside so the next write starts clean.
pub fn quarantine(path: &PathBuf) {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut target = path.clone();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "state.json".into());
    target.set_file_name(format!("{name}.corrupt-{stamp}"));
    if let Err(e) = fs::rename(path, &target) {
        log::warn!("quarantine {}: {e}", path.display());
    } else {
        log::warn!("quarantined {} -> {}", path.display(), target.display());
    }
}

fn set_owner_only(path: &PathBuf) -> Result<(), String> {
    #[cfg(not(unix))]
    let _ = path;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("chmod {}: {e}", path.display()))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::collections::HashMap;

    #[derive(Debug, Deserialize, Default)]
    #[serde(rename_all = "camelCase", default)]
    struct LooseDoc {
        schema_version: u32,
        name: String,
        extra_kept_default: String,
    }

    #[test]
    fn missing_file_is_none() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("missing.json");
        let loaded: Option<LooseDoc> = read_json_opt(&path).unwrap();
        assert!(loaded.is_none());
    }

    #[test]
    fn corrupt_file_is_quarantined_and_yields_none() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        fs::write(&path, "{ not json").unwrap();

        let loaded: Option<LooseDoc> = read_json_opt(&path).unwrap();
        assert!(loaded.is_none());
        assert!(!path.exists());
        assert!(fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|e| e.file_name().to_string_lossy().contains(".corrupt-")));
    }

    /// 1.0.0-shaped file: no schemaVersion, subset of fields.
    #[test]
    fn older_file_loads_with_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("old.json");
        fs::write(&path, r#"{"name":"from-1.0.0"}"#).unwrap();

        let loaded: LooseDoc = read_json_opt(&path).unwrap().unwrap();
        assert_eq!(loaded.schema_version, 0);
        assert_eq!(loaded.name, "from-1.0.0");
        assert!(loaded.extra_kept_default.is_empty());
    }

    /// A newer build wrote fields this build has never heard of.
    #[test]
    fn newer_file_with_unknown_fields_still_loads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("future.json");
        fs::write(
            &path,
            r#"{"schemaVersion":99,"name":"from-future","brandNew":{"x":1},"alsoNew":[1,2]}"#,
        )
        .unwrap();

        let loaded: LooseDoc = read_json_opt(&path).unwrap().unwrap();
        assert_eq!(loaded.schema_version, 99);
        assert_eq!(loaded.name, "from-future");
    }

    #[test]
    fn write_is_atomic_and_readable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.json");
        let mut value = HashMap::new();
        value.insert("hello", "world");
        write_json(&path, &value).unwrap();

        let loaded: HashMap<String, String> = read_json_opt(&path).unwrap().unwrap();
        assert_eq!(loaded.get("hello").map(String::as_str), Some("world"));
        assert!(!dir.path().join("out.json.tmp").exists());
    }
}
