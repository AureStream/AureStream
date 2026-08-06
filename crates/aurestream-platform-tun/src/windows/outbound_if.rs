//! Resolve the Windows default IPv4 outbound interface (friendly name).
//!
//! Xray's `autoOutboundsInterface: "auto"` fails on some machines (especially
//! with Hyper-V/WSL vSwitch + Chinese NIC names) with
//! `Failed to find matching adapter name (0x490)`. We instead bind TUN
//! outbounds to the interface that owns the default route toward the public
//! Internet (via `GetBestInterface`).


use std::net::Ipv4Addr;

use windows::Win32::NetworkManagement::IpHelper::{
    GetAdaptersAddresses, GetBestInterface, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER,
    GAA_FLAG_SKIP_MULTICAST, IF_TYPE_SOFTWARE_LOOPBACK, IP_ADAPTER_ADDRESSES_LH,
};
use windows::Win32::Networking::WinSock::AF_INET;

/// Public anycast used only to ask Windows which NIC would carry Internet traffic.
const PROBE_DEST: Ipv4Addr = Ipv4Addr::new(1, 1, 1, 1);

pub fn is_virtual_or_tun_alias(name: &str) -> bool {
    let lc = name.to_ascii_lowercase();
    lc.contains("loopback")
        || lc.contains("vethernet")
        || lc.contains("hyper-v")
        || lc.contains("wsl")
        || lc.contains("virtualbox")
        || lc.contains("vmware")
        || lc.contains("docker")
        || lc.contains("wintun")
        || lc.contains("tun")
        || lc.contains("tap")
        || lc.contains("aurestream")
        || lc.contains("sing-box")
        || lc.contains("xray")
        || lc.contains("wireguard")
        || lc.contains("vpn")
}

/// Friendly name of the NIC Windows would use to reach the public Internet
/// (e.g. `"以太网"`, `"Ethernet"`, `"Wi-Fi"`).
pub fn resolve_default_outbound_interface() -> Result<String, String> {
    // GetBestInterface expects the destination in network byte order.
    let dest = u32::from_be_bytes(PROBE_DEST.octets());
    let mut if_index: u32 = 0;
    let status = unsafe { GetBestInterface(dest, &mut if_index) };
    if status != 0 {
        return Err(format!(
            "GetBestInterface({}) failed: win32={}",
            PROBE_DEST, status
        ));
    }
    if if_index == 0 {
        return Err("GetBestInterface returned ifIndex=0".into());
    }

    let name = friendly_name_for_if_index(if_index)?;
    if is_virtual_or_tun_alias(&name) {
        return Err(format!(
            "default route points at virtual/TUN adapter '{}'(ifIndex={})",
            name, if_index
        ));
    }
    Ok(name)
}

fn friendly_name_for_if_index(want_index: u32) -> Result<String, String> {
    let flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;

    // First call: query required buffer size.
    let mut size: u32 = 0;
    let err = unsafe { GetAdaptersAddresses(AF_INET.0 as u32, flags, None, None, &mut size) };
    // ERROR_BUFFER_OVERFLOW = 111
    if err != 111 && size == 0 {
        return Err(format!(
            "GetAdaptersAddresses size query failed: win32={}",
            err
        ));
    }

    let mut buf = vec![0u8; size as usize];
    let head = buf.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH;
    let err =
        unsafe { GetAdaptersAddresses(AF_INET.0 as u32, flags, None, Some(head), &mut size) };
    if err != 0 {
        return Err(format!("GetAdaptersAddresses failed: win32={}", err));
    }

    let mut cur = head;
    while !cur.is_null() {
        let adapter = unsafe { &*cur };
        let idx = unsafe { adapter.Anonymous1.Anonymous.IfIndex };
        if idx == want_index && adapter.IfType != IF_TYPE_SOFTWARE_LOOPBACK {
            let friendly = unsafe {
                if adapter.FriendlyName.is_null() {
                    String::new()
                } else {
                    adapter.FriendlyName.to_string().unwrap_or_default()
                }
            };
            let friendly = friendly.trim().to_string();
            if !friendly.is_empty() {
                return Ok(friendly);
            }
        }
        cur = adapter.Next;
    }

    Err(format!(
        "no adapter friendly name for ifIndex={}",
        want_index
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn virtual_alias_heuristic() {
        assert!(is_virtual_or_tun_alias("vEthernet (WSL (Hyper-V firewall))"));
        assert!(is_virtual_or_tun_alias("Wintun"));
        assert!(is_virtual_or_tun_alias("AureStream TUN"));
        assert!(!is_virtual_or_tun_alias("以太网"));
        assert!(!is_virtual_or_tun_alias("Ethernet"));
        assert!(!is_virtual_or_tun_alias("Wi-Fi"));
    }
}
