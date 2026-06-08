//! Proxy bypass list from settings, normalized into each platform's native format.

pub const PROXY_BYPASS_STORE_KEY: &str = "proxy_bypass_key";

#[cfg(target_os = "windows")]
pub const DEFAULT_BYPASS: &str = "localhost;127.*;192.168.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;<local>";

#[cfg(target_os = "macos")]
pub const DEFAULT_BYPASS: &str = "127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,172.29.0.0/16,localhost,*.local,*.crashlytics.com,<local>";

#[cfg(target_os = "linux")]
pub const DEFAULT_BYPASS: &str =
    "localhost,127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,172.29.0.0/16,::1";

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
pub const DEFAULT_BYPASS: &str = "localhost,127.0.0.1";

fn normalize_tokens(raw: &str) -> Vec<String> {
    raw.split(|c: char| c == ',' || c == ';' || c == '，' || c == '；' || c == '\n')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

/// Convert IPv4 CIDR notation to Windows WinINet wildcard bypass entries.
/// Windows does not support CIDR in the proxy bypass list.
#[cfg(target_os = "windows")]
fn cidr_to_windows_bypass_tokens(token: &str) -> Vec<String> {
    if token.contains('*') || token == "<local>" || !token.contains('/') {
        return vec![token.to_string()];
    }

    let Some((ip_part, prefix_len_str)) = token.split_once('/') else {
        return vec![token.to_string()];
    };

    let prefix_len: u8 = match prefix_len_str.parse() {
        Ok(n) if n <= 32 => n,
        _ => return vec![token.to_string()],
    };

    let octets: Vec<u8> = match ip_part
        .split('.')
        .map(|o| o.parse::<u8>())
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(v) if v.len() == 4 => v,
        _ => return vec![token.to_string()],
    };

    if prefix_len == 32 {
        return vec![ip_part.to_string()];
    }

    let full_octets = (prefix_len / 8) as usize;
    let remainder_bits = prefix_len % 8;

    if remainder_bits == 0 {
        let mut parts = octets
            .iter()
            .take(full_octets)
            .map(u8::to_string)
            .collect::<Vec<_>>();
        if full_octets < 4 {
            parts.push("*".to_string());
        }
        return vec![parts.join(".")];
    }

    let variable_index = full_octets;
    let block_size = 1u16 << (8 - remainder_bits);
    let mask = 0xffu8 << (8 - remainder_bits);
    let start = (octets[variable_index] & mask) as u16;

    (start..start + block_size)
        .map(|value| {
            let mut parts = octets
                .iter()
                .take(full_octets)
                .map(u8::to_string)
                .collect::<Vec<_>>();
            parts.push(value.to_string());
            if variable_index < 3 {
                parts.push("*".to_string());
            }
            parts.join(".")
        })
        .collect()
}

#[cfg(target_os = "windows")]
pub fn format_bypass_for_platform(raw: &str) -> String {
    let tokens = normalize_tokens(raw);
    if tokens.is_empty() {
        return DEFAULT_BYPASS.to_string();
    }
    tokens
        .into_iter()
        .flat_map(|t| cidr_to_windows_bypass_tokens(&t))
        .collect::<Vec<_>>()
        .join(";")
}

#[cfg(not(target_os = "windows"))]
pub fn format_bypass_for_platform(raw: &str) -> String {
    let tokens = normalize_tokens(raw);
    if tokens.is_empty() {
        return DEFAULT_BYPASS.to_string();
    }
    tokens.join(",")
}

pub fn bypass_from_store_value(raw: Option<String>) -> String {
    match raw {
        Some(s) if !s.trim().is_empty() => format_bypass_for_platform(&s),
        _ => DEFAULT_BYPASS.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_common_separators() {
        let tokens = normalize_tokens("localhost; 127.*，192.168.*\n10.*；<local>");
        assert_eq!(
            tokens,
            vec!["localhost", "127.*", "192.168.*", "10.*", "<local>"]
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_formats_bypass_for_wininet() {
        let formatted = format_bypass_for_platform(
            "localhost; 10.0.0.0/8, 172.16.0.0/12\n192.168.0.0/16; <local>",
        );

        assert_eq!(
            formatted,
            "localhost;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>"
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn unix_keeps_cidr_and_uses_commas() {
        let formatted =
            format_bypass_for_platform("localhost; 10.0.0.0/8, 172.16.0.0/12\n192.168.0.0/16");

        assert_eq!(
            formatted,
            "localhost,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
        );
    }
}
