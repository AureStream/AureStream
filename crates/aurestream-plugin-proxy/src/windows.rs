//! Windows system proxy implementation using WinINet API with RAS connection enumeration.
//!
//! Key improvements over the original sysproxy-rs:
//! - Uses `InternetQueryOptionW` with `INTERNET_PER_CONN_FLAGS_UI` for querying (Win7+ compatible)
//! - Falls back to `INTERNET_PER_CONN_FLAGS` for older Windows versions
//! - Enumerates all RAS (dial-up/VPN) connections via `RasEnumEntriesW` and applies proxy to each
//! - Three-tier propagation: set options → notify changes → refresh

use crate::{AppContainer, Autoproxy, Result, Sysproxy};
use std::ffi::c_void;
use std::mem::{ManuallyDrop, size_of, zeroed};
use url::Url;
use windows::Win32::Foundation::{HLOCAL, LocalFree, WIN32_ERROR};
use windows::Win32::NetworkManagement::Rras::{RASENTRYNAMEW, RasEnumEntriesW};
use windows::Win32::NetworkManagement::WindowsFirewall::{
    INET_FIREWALL_APP_CONTAINER, NetworkIsolationEnumAppContainers,
    NetworkIsolationFreeAppContainers, NetworkIsolationGetAppContainerConfig,
    NetworkIsolationSetAppContainerConfig,
};
use windows::Win32::Networking::WinInet::{
    INTERNET_OPTION_PER_CONNECTION_OPTION, INTERNET_OPTION_PROXY_SETTINGS_CHANGED,
    INTERNET_OPTION_REFRESH, INTERNET_PER_CONN, INTERNET_PER_CONN_AUTOCONFIG_URL,
    INTERNET_PER_CONN_FLAGS, INTERNET_PER_CONN_FLAGS_UI, INTERNET_PER_CONN_OPTION_LISTW,
    INTERNET_PER_CONN_OPTIONW, INTERNET_PER_CONN_OPTIONW_0, INTERNET_PER_CONN_PROXY_BYPASS,
    INTERNET_PER_CONN_PROXY_SERVER, InternetQueryOptionW, InternetSetOptionW,
    PROXY_TYPE_AUTO_DETECT, PROXY_TYPE_AUTO_PROXY_URL, PROXY_TYPE_DIRECT, PROXY_TYPE_PROXY,
};
use windows::Win32::Security::Authorization::{ConvertSidToStringSidW, ConvertStringSidToSidW};
use windows::Win32::Security::{PSID, SID, SID_AND_ATTRIBUTES};
use windows::core::{PCWSTR, PWSTR};

/// Win32 ERROR_BUFFER_TOO_SMALL (122)
const ERROR_BUFFER_TOO_SMALL: u32 = 122;

/// Encode a Rust string as a null-terminated UTF-16 Vec.
fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Decode a PWSTR to a Rust String.
///
/// # Safety
/// The PWSTR must point to a valid null-terminated wide string or be null.
unsafe fn from_wide(p: PWSTR) -> String {
    if p.is_null() {
        return String::new();
    }
    unsafe { p.to_string() }.unwrap_or_default()
}

/// Apply proxy settings to a specific connection.
///
/// `connection` is `None` for the LAN connection, or `Some(name)` for a RAS connection.
fn apply_connect(
    options: &INTERNET_PER_CONN_OPTION_LISTW,
    connection: Option<&mut Vec<u16>>,
) -> Result<()> {
    // Build a copy with the desired pszConnection
    let opts = INTERNET_PER_CONN_OPTION_LISTW {
        dwSize: options.dwSize,
        pszConnection: match connection {
            Some(name) => PWSTR::from_raw(name.as_mut_ptr()),
            None => PWSTR::null(),
        },
        dwOptionCount: options.dwOptionCount,
        dwOptionError: options.dwOptionError,
        pOptions: options.pOptions,
    };

    unsafe {
        // Set proxy options
        InternetSetOptionW(
            None,
            INTERNET_OPTION_PER_CONNECTION_OPTION,
            Some(&opts as *const _ as *const c_void),
            size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32,
        )?;
        // Notify system of proxy settings change
        InternetSetOptionW(None, INTERNET_OPTION_PROXY_SETTINGS_CHANGED, None, 0)?;
        // Refresh settings
        InternetSetOptionW(None, INTERNET_OPTION_REFRESH, None, 0)?;
    }

    Ok(())
}

/// Apply proxy settings to LAN and all RAS connections.
fn apply(options: &INTERNET_PER_CONN_OPTION_LISTW) -> Result<()> {
    // Apply to LAN first
    apply_connect(options, None)?;

    // Enumerate RAS connections
    let mut cb: u32 = 0;
    let mut entries: u32 = 0;

    // First call to get required buffer size
    let ret = unsafe { RasEnumEntriesW(None, None, None, &mut cb, &mut entries) };

    if ret == ERROR_BUFFER_TOO_SMALL {
        let count = cb as usize / size_of::<RASENTRYNAMEW>();
        let mut ras_entries: Vec<RASENTRYNAMEW> = Vec::with_capacity(count);
        for _ in 0..count {
            let mut entry: RASENTRYNAMEW = unsafe { zeroed() };
            entry.dwSize = size_of::<RASENTRYNAMEW>() as u32;
            ras_entries.push(entry);
        }

        let ret = unsafe {
            RasEnumEntriesW(
                None,
                None,
                Some(ras_entries.as_mut_ptr()),
                &mut cb,
                &mut entries,
            )
        };

        if ret != 0 {
            log::warn!("RasEnumEntriesW failed with code: {}", ret);
            // Non-fatal: LAN proxy was already set successfully
            return Ok(());
        }

        for entry in ras_entries.iter().take(entries as usize) {
            let name = &entry.szEntryName;
            let len = name.iter().position(|&c| c == 0).unwrap_or(name.len());
            let mut wide_name: Vec<u16> = name[..len].to_vec();
            wide_name.push(0);
            apply_connect(options, Some(&mut wide_name))?;
        }
    }
    // If ret == 0 and entries == 0, there are no RAS connections — that's fine.

    Ok(())
}

/// Query current proxy settings using WinINet API.
///
/// Uses `INTERNET_PER_CONN_FLAGS_UI` first (Win7+), falls back to `INTERNET_PER_CONN_FLAGS`.
fn query_options() -> Result<(u32, String, String, String)> {
    let mut p_opts: [INTERNET_PER_CONN_OPTIONW; 4] = unsafe { zeroed() };

    // Try FLAGS_UI first (recommended for Windows 7+ / IE8+)
    p_opts[0].dwOption = INTERNET_PER_CONN(INTERNET_PER_CONN_FLAGS_UI);
    p_opts[1].dwOption = INTERNET_PER_CONN_PROXY_SERVER;
    p_opts[2].dwOption = INTERNET_PER_CONN_PROXY_BYPASS;
    p_opts[3].dwOption = INTERNET_PER_CONN_AUTOCONFIG_URL;

    let mut opts = INTERNET_PER_CONN_OPTION_LISTW {
        dwSize: size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32,
        pszConnection: PWSTR::null(),
        dwOptionCount: 4,
        dwOptionError: 0,
        pOptions: p_opts.as_mut_ptr(),
    };

    let mut buf_size = size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32;

    let query_result = unsafe {
        InternetQueryOptionW(
            None,
            INTERNET_OPTION_PER_CONNECTION_OPTION,
            Some(&mut opts as *mut _ as *mut c_void),
            &mut buf_size,
        )
    };

    if query_result.is_err() {
        // Fallback to FLAGS for older Windows versions
        p_opts[0].dwOption = INTERNET_PER_CONN_FLAGS;
        buf_size = size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32;

        unsafe {
            InternetQueryOptionW(
                None,
                INTERNET_OPTION_PER_CONNECTION_OPTION,
                Some(&mut opts as *mut _ as *mut c_void),
                &mut buf_size,
            )?;
        }
    }

    let flags = unsafe { p_opts[0].Value.dwValue };
    let server = unsafe { from_wide(p_opts[1].Value.pszValue) };
    let bypass = unsafe { from_wide(p_opts[2].Value.pszValue) };
    let pac_url = unsafe { from_wide(p_opts[3].Value.pszValue) };

    // Free WinINet-allocated strings.
    // GlobalFree returns NULL on success (not on failure), so we ignore the
    // windows-rs Result which incorrectly treats a NULL return as an error.
    unsafe {
        for opt in p_opts[1..].iter() {
            let ptr = opt.Value.pszValue;
            if !ptr.is_null() {
                let _ = windows::Win32::Foundation::GlobalFree(Some(
                    windows::Win32::Foundation::HGLOBAL(ptr.as_ptr() as *mut c_void),
                ));
            }
        }
    }

    Ok((flags, server, bypass, pac_url))
}

/// Set proxy flags to DIRECT only (disabling all proxies).
fn unset_proxy() -> Result<()> {
    let mut p_opts = ManuallyDrop::new(vec![INTERNET_PER_CONN_OPTIONW {
        dwOption: INTERNET_PER_CONN_FLAGS,
        Value: INTERNET_PER_CONN_OPTIONW_0 {
            dwValue: PROXY_TYPE_DIRECT,
        },
    }]);

    let opts = INTERNET_PER_CONN_OPTION_LISTW {
        dwSize: size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32,
        pszConnection: PWSTR::null(),
        dwOptionCount: 1,
        dwOptionError: 0,
        pOptions: p_opts.as_mut_ptr(),
    };

    let res = apply(&opts);
    unsafe { ManuallyDrop::drop(&mut p_opts) };
    res
}

/// Set auto-proxy (PAC URL) configuration.
fn set_auto_proxy_inner(url: String) -> Result<()> {
    let mut url_wide = ManuallyDrop::new(to_wide(&url));

    let mut p_opts = ManuallyDrop::new(vec![
        INTERNET_PER_CONN_OPTIONW {
            dwOption: INTERNET_PER_CONN_FLAGS,
            Value: INTERNET_PER_CONN_OPTIONW_0 {
                dwValue: PROXY_TYPE_AUTO_DETECT | PROXY_TYPE_AUTO_PROXY_URL | PROXY_TYPE_DIRECT,
            },
        },
        INTERNET_PER_CONN_OPTIONW {
            dwOption: INTERNET_PER_CONN_AUTOCONFIG_URL,
            Value: INTERNET_PER_CONN_OPTIONW_0 {
                pszValue: PWSTR::from_raw(url_wide.as_mut_ptr()),
            },
        },
    ]);

    let opts = INTERNET_PER_CONN_OPTION_LISTW {
        dwSize: size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32,
        pszConnection: PWSTR::null(),
        dwOptionCount: 2,
        dwOptionError: 0,
        pOptions: p_opts.as_mut_ptr(),
    };

    let res = apply(&opts);
    unsafe {
        ManuallyDrop::drop(&mut url_wide);
        ManuallyDrop::drop(&mut p_opts);
    }
    res
}

/// Set global proxy (server + bypass list) configuration.
fn set_global_proxy(server: String, bypass: String) -> Result<()> {
    let mut server_wide = ManuallyDrop::new(to_wide(&server));
    let mut bypass_wide = ManuallyDrop::new(to_wide(&bypass));

    let mut p_opts = ManuallyDrop::new(vec![
        INTERNET_PER_CONN_OPTIONW {
            dwOption: INTERNET_PER_CONN_FLAGS,
            Value: INTERNET_PER_CONN_OPTIONW_0 {
                dwValue: PROXY_TYPE_PROXY | PROXY_TYPE_DIRECT,
            },
        },
        INTERNET_PER_CONN_OPTIONW {
            dwOption: INTERNET_PER_CONN_PROXY_SERVER,
            Value: INTERNET_PER_CONN_OPTIONW_0 {
                pszValue: PWSTR::from_raw(server_wide.as_mut_ptr()),
            },
        },
        INTERNET_PER_CONN_OPTIONW {
            dwOption: INTERNET_PER_CONN_PROXY_BYPASS,
            Value: INTERNET_PER_CONN_OPTIONW_0 {
                pszValue: PWSTR::from_raw(bypass_wide.as_mut_ptr()),
            },
        },
    ]);

    let opts = INTERNET_PER_CONN_OPTION_LISTW {
        dwSize: size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32,
        pszConnection: PWSTR::null(),
        dwOptionCount: 3,
        dwOptionError: 0,
        pOptions: p_opts.as_mut_ptr(),
    };

    let res = apply(&opts);
    unsafe {
        ManuallyDrop::drop(&mut server_wide);
        ManuallyDrop::drop(&mut bypass_wide);
        ManuallyDrop::drop(&mut p_opts);
    }
    res
}

/// Parse a proxy server string like "host:port" or "http=host:port;https=host:port".
fn parse_proxy_server(server: &str) -> (String, u16) {
    if server.is_empty() {
        return (String::new(), 0);
    }

    // Multi-protocol format: http=host:port;https=host:port
    if server.contains('=') {
        let parts: Vec<&str> = server.split(';').collect();
        // Prefer http proxy
        let http_proxy = parts
            .iter()
            .find(|p| p.trim().to_lowercase().starts_with("http="))
            .or_else(|| parts.first());

        if let Some(proxy) = http_proxy {
            let value = proxy.split('=').nth(1).unwrap_or("");
            return parse_host_port(value);
        }
    }

    // Single format: host:port
    parse_host_port(server)
}

/// Parse "host:port" into (host, port).
fn parse_host_port(address: &str) -> (String, u16) {
    // Try URL parsing first
    if let Ok(url) = Url::parse(&format!("http://{}", address)) {
        let host = url.host_str().unwrap_or("").to_string();
        let port = url.port().unwrap_or(0);
        if !host.is_empty() {
            return (host, port);
        }
    }

    // Fallback to manual splitting
    if let Some((h, p)) = address.rsplit_once(':')
        && let Ok(port) = p.parse::<u16>()
    {
        return (h.to_string(), port);
    }

    (address.to_string(), 0)
}

impl Sysproxy {
    /// Gets the current system proxy settings via WinINet API.
    pub fn get_system_proxy() -> Result<Sysproxy> {
        let (flags, server, bypass, _pac_url) = query_options()?;

        let enable = (flags & PROXY_TYPE_PROXY) != 0;
        let (host, port) = parse_proxy_server(&server);

        Ok(Sysproxy {
            enable,
            host,
            port,
            bypass,
        })
    }

    /// Sets the system proxy.
    pub fn set_system_proxy(&self) -> Result<()> {
        if self.enable {
            set_global_proxy(format!("{}:{}", self.host, self.port), self.bypass.clone())
        } else {
            unset_proxy()
        }
    }
}

impl Autoproxy {
    /// Gets the current auto-proxy (PAC) settings via WinINet API.
    pub fn get_auto_proxy() -> Result<Autoproxy> {
        let (flags, _server, _bypass, pac_url) = query_options()?;

        let enable = (flags & PROXY_TYPE_AUTO_PROXY_URL) != 0;

        Ok(Autoproxy {
            enable,
            url: pac_url,
        })
    }

    /// Sets the auto-proxy (PAC) configuration.
    pub fn set_auto_proxy(&self) -> Result<()> {
        if self.enable {
            set_auto_proxy_inner(self.url.clone())
        } else {
            unset_proxy()
        }
    }
}

// ── UWP loopback proxy exemption ─────────────────────────────────────────────

/// Convert a `*mut SID` to its `S-1-…` string representation.
///
/// The string buffer is allocated by `ConvertSidToStringSidW` and freed here.
///
/// # Safety
/// `sid` must be a valid SID pointer or null.
unsafe fn sid_to_string(sid: *mut SID) -> Option<String> {
    if sid.is_null() {
        return None;
    }
    let mut pwstr = PWSTR::null();
    unsafe { ConvertSidToStringSidW(PSID(sid as *mut c_void), &mut pwstr) }.ok()?;
    if pwstr.is_null() {
        return None;
    }
    let s = unsafe { from_wide(pwstr) };
    let _ = unsafe { LocalFree(Some(HLOCAL(pwstr.as_ptr() as *mut c_void))) };
    if s.is_empty() { None } else { Some(s) }
}

/// Parse a SID string into an allocated `PSID`.
///
/// # Safety
/// The caller must free the returned pointer with `LocalFree`.
unsafe fn string_to_psid(s: &str) -> Option<PSID> {
    let wide: Vec<u16> = s.encode_utf16().chain(std::iter::once(0)).collect();
    let mut psid = PSID::default();
    unsafe { ConvertStringSidToSidW(PCWSTR::from_raw(wide.as_ptr()), &mut psid) }.ok()?;
    if psid.0.is_null() { None } else { Some(psid) }
}

/// Returns all installed UWP app containers with their current exemption status.
pub(crate) fn get_uwp_exemption() -> Result<Vec<AppContainer>> {
    unsafe {
        // Collect currently-exempted SIDs into a set for O(1) lookup.
        let mut ex_count: u32 = 0;
        let mut sids_ptr: *mut SID_AND_ATTRIBUTES = std::ptr::null_mut();

        WIN32_ERROR(NetworkIsolationGetAppContainerConfig(
            &mut ex_count,
            &mut sids_ptr,
        ))
        .ok()?;

        let mut exempted: std::collections::HashSet<String> =
            std::collections::HashSet::with_capacity(ex_count as usize);

        if ex_count > 0 && !sids_ptr.is_null() {
            let sids = std::slice::from_raw_parts(sids_ptr, ex_count as usize);
            for sa in sids {
                if let Some(s) = sid_to_string(sa.Sid.0 as *mut SID) {
                    exempted.insert(s);
                }
            }
            let _ = LocalFree(Some(HLOCAL(sids_ptr as *mut c_void)));
        }

        // Enumerate all containers and annotate with exemption status.
        let mut count: u32 = 0;
        let mut ptr: *mut INET_FIREWALL_APP_CONTAINER = std::ptr::null_mut();

        let ret = NetworkIsolationEnumAppContainers(0, &mut count, &mut ptr);
        if WIN32_ERROR(ret).is_err() || ptr.is_null() || count == 0 {
            return Ok(Vec::new());
        }

        let containers = std::slice::from_raw_parts(ptr, count as usize);
        let mut result = Vec::with_capacity(count as usize);

        for c in containers {
            let Some(sid) = sid_to_string(c.appContainerSid) else {
                continue;
            };
            let exempted = exempted.contains(&sid);
            result.push(AppContainer {
                exempted,
                sid,
                name: from_wide(c.appContainerName),
                display_name: from_wide(c.displayName),
            });
        }

        NetworkIsolationFreeAppContainers(ptr);
        Ok(result)
    }
}

/// Replaces the UWP loopback proxy exemption list and returns the updated list.
pub(crate) fn set_uwp_exemption(sids: &[String]) -> Result<Vec<AppContainer>> {
    unsafe {
        let psids: Vec<PSID> = sids.iter().filter_map(|s| string_to_psid(s)).collect();
        let sa_list: Vec<SID_AND_ATTRIBUTES> = psids
            .iter()
            .map(|&sid| SID_AND_ATTRIBUTES {
                Sid: sid,
                Attributes: 0,
            })
            .collect();

        let set_result = WIN32_ERROR(NetworkIsolationSetAppContainerConfig(&sa_list)).ok();

        // Free PSIDs allocated by ConvertStringSidToSidW
        for psid in &psids {
            let _ = LocalFree(Some(HLOCAL(psid.0)));
        }

        set_result?;
        get_uwp_exemption()
    }
}
