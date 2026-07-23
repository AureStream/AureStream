//! Platform-safe default system proxy bypass list.

#[cfg(target_os = "windows")]
pub const DEFAULT_BYPASS: &str = "localhost;127.*;192.168.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;<local>";

#[cfg(target_os = "macos")]
pub const DEFAULT_BYPASS: &str = "127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,172.29.0.0/16,localhost,*.local,*.crashlytics.com,<local>";

#[cfg(target_os = "linux")]
pub const DEFAULT_BYPASS: &str =
    "localhost,127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,172.29.0.0/16,::1";

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
pub const DEFAULT_BYPASS: &str = "localhost,127.0.0.1";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_bypass_is_not_empty() {
        assert!(!DEFAULT_BYPASS.is_empty());
    }
}
