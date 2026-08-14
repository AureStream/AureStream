//! Pick a physical outbound interface; never bind proxy dials to leftover TUN.

/// True when `name` is a TUN / Xray virtual NIC (must not be used as the physical egress).
pub fn is_virtual_tun_iface(name: &str) -> bool {
    let n = name.trim();
    if n.is_empty() {
        return false;
    }
    let lower = n.to_ascii_lowercase();
    lower.starts_with("utun")
        || lower.starts_with("tun")
        || lower == "xray0"
        || lower.starts_with("wg")
}

/// Extract `dev` tokens from `ip route` / `ip -o route show default` text, in order.
pub fn parse_route_devs(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in text.lines() {
        let mut words = line.split_whitespace();
        while let Some(word) = words.next() {
            if word == "dev" {
                if let Some(dev) = words.next() {
                    if !dev.is_empty() && !out.iter().any(|existing| existing == dev) {
                        out.push(dev.to_string());
                    }
                }
            }
        }
    }
    out
}

/// First non-virtual device, if any.
pub fn pick_physical_dev(devs: &[String]) -> Option<String> {
    devs.iter()
        .map(|s| s.trim())
        .find(|s| !s.is_empty() && !is_virtual_tun_iface(s))
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_xray_and_wireguard_as_virtual() {
        assert!(is_virtual_tun_iface("utun233"));
        assert!(is_virtual_tun_iface("tun0"));
        assert!(is_virtual_tun_iface("TUN1"));
        assert!(is_virtual_tun_iface("wg0"));
        assert!(!is_virtual_tun_iface("ens160"));
        assert!(!is_virtual_tun_iface("eth0"));
        assert!(!is_virtual_tun_iface("wlan0"));
        assert!(!is_virtual_tun_iface("enp3s0"));
    }

    #[test]
    fn prefers_physical_when_tun_is_default() {
        let text = "\
default dev utun233 scope link metric 0
default via 192.168.1.1 dev ens160 proto dhcp metric 100
";
        let devs = parse_route_devs(text);
        assert_eq!(devs, vec!["utun233", "ens160"]);
        assert_eq!(pick_physical_dev(&devs).as_deref(), Some("ens160"));
    }

    #[test]
    fn parses_ip_route_get_line() {
        let text = "1.1.1.1 via 192.168.1.1 dev ens160 src 192.168.1.10 uid 1000\n";
        assert_eq!(parse_route_devs(text), vec!["ens160"]);
        assert_eq!(
            pick_physical_dev(&parse_route_devs(text)).as_deref(),
            Some("ens160")
        );
    }

    #[test]
    fn none_when_only_virtual_routes() {
        let devs = parse_route_devs("default dev utun233\n");
        assert_eq!(pick_physical_dev(&devs), None);
    }
}
