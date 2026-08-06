//! Pure helpers shared by platform backends (unit-testable without OS side effects).

/// Format a WinINET / URL-style proxy address `host:port`.
pub fn format_proxy_addr(host: &str, port: u16) -> String {
    format!("{host}:{port}")
}

/// Default bypass list for the current target OS.
///
/// Windows uses `;`; macOS/Linux use `,`.
/// Includes `*evoc*` / `*9n1m*` so vendor/local tooling hosts skip the system proxy.
pub fn default_bypass() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "localhost;127.*;192.168.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;<local>;*evoc*;*9n1m*"
    }
    #[cfg(target_os = "macos")]
    {
        "127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,localhost,*.local,<local>,*evoc*,*9n1m*"
    }
    #[cfg(target_os = "linux")]
    {
        "localhost,127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,::1,*evoc*,*9n1m*"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "localhost,127.0.0.1,*evoc*,*9n1m*"
    }
}

/// Reject empty / whitespace-only hosts before touching the OS.
pub fn require_host(host: &str) -> Result<&str, crate::ProxyError> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        Err(crate::ProxyError::EmptyHost)
    } else {
        Ok(trimmed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_proxy_addr_joins_host_and_port() {
        assert_eq!(format_proxy_addr("127.0.0.1", 7890), "127.0.0.1:7890");
        assert_eq!(format_proxy_addr("localhost", 1080), "localhost:1080");
    }

    #[test]
    fn default_bypass_is_non_empty() {
        assert!(!default_bypass().is_empty());
    }

    #[test]
    fn default_bypass_mentions_localhost() {
        assert!(default_bypass().contains("localhost"));
    }

    #[test]
    fn default_bypass_skips_evoc_and_9n1m() {
        let b = default_bypass();
        assert!(b.contains("*evoc*"), "bypass missing *evoc*: {b}");
        assert!(b.contains("*9n1m*"), "bypass missing *9n1m*: {b}");
    }

    #[test]
    fn require_host_rejects_empty() {
        assert!(matches!(
            require_host(""),
            Err(crate::ProxyError::EmptyHost)
        ));
        assert!(matches!(
            require_host("   "),
            Err(crate::ProxyError::EmptyHost)
        ));
    }

    #[test]
    fn require_host_trims() {
        assert_eq!(require_host(" 127.0.0.1 ").unwrap(), "127.0.0.1");
    }
}
