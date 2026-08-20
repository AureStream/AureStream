//! Windows system proxy via WinINET (LAN + RAS connections).
//!
//! Minimal extraction from legacy `aurestream-plugin-proxy` — no UWP / PAC / TUN.

use std::ffi::c_void;
use std::mem::{size_of, ManuallyDrop, zeroed};

use windows::core::PWSTR;
use windows::Win32::NetworkManagement::Rras::{RasEnumEntriesW, RASENTRYNAMEW};
use windows::Win32::Networking::WinInet::{
    InternetSetOptionW, INTERNET_OPTION_PER_CONNECTION_OPTION,
    INTERNET_OPTION_PROXY_SETTINGS_CHANGED, INTERNET_OPTION_REFRESH, INTERNET_PER_CONN_FLAGS,
    INTERNET_PER_CONN_OPTIONW, INTERNET_PER_CONN_OPTIONW_0, INTERNET_PER_CONN_OPTION_LISTW,
    INTERNET_PER_CONN_PROXY_BYPASS, INTERNET_PER_CONN_PROXY_SERVER, PROXY_TYPE_DIRECT,
    PROXY_TYPE_PROXY,
};

use crate::helpers::{default_bypass, format_windows_proxy_server, require_host};
use crate::ProxyError;

const ERROR_BUFFER_TOO_SMALL: u32 = 122;

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn apply_connect(
    options: &INTERNET_PER_CONN_OPTION_LISTW,
    connection: Option<&mut Vec<u16>>,
) -> Result<(), ProxyError> {
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
        InternetSetOptionW(
            None,
            INTERNET_OPTION_PER_CONNECTION_OPTION,
            Some(&opts as *const _ as *const c_void),
            size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32,
        )?;
        InternetSetOptionW(None, INTERNET_OPTION_PROXY_SETTINGS_CHANGED, None, 0)?;
        InternetSetOptionW(None, INTERNET_OPTION_REFRESH, None, 0)?;
    }
    Ok(())
}

fn apply(options: &INTERNET_PER_CONN_OPTION_LISTW) -> Result<(), ProxyError> {
    apply_connect(options, None)?;

    let mut cb: u32 = 0;
    let mut entries: u32 = 0;
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
            // LAN already applied; RAS failures are non-fatal for MVP.
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

    Ok(())
}

fn set_global_proxy(server: &str, bypass: &str) -> Result<(), ProxyError> {
    let mut server_wide = ManuallyDrop::new(to_wide(server));
    let mut bypass_wide = ManuallyDrop::new(to_wide(bypass));

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

fn unset_proxy() -> Result<(), ProxyError> {
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

pub fn set_system_proxy(host: &str, port: u16) -> Result<(), ProxyError> {
    let host = require_host(host)?;
    // Bare `host:port` applies to all WinINET protocols and is the only form
    // the Windows 10/11 Settings UI can split into address + port.
    let server = format_windows_proxy_server(host, port);
    set_global_proxy(&server, default_bypass())
}

pub fn clear_system_proxy() -> Result<(), ProxyError> {
    unset_proxy()
}
