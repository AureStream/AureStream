#[cfg(target_os = "windows")]
pub mod dns;
#[cfg(target_os = "windows")]
pub mod scm;
#[cfg(target_os = "windows")]
pub mod service;

#[cfg(target_os = "windows")]
pub const SERVICE_NAME: &str = "AureStreamTunService";
#[cfg(target_os = "windows")]
pub const SERVICE_DISPLAY_NAME: &str = "AureStream TUN Service";
#[cfg(target_os = "windows")]
pub const SERVICE_DESCRIPTION: &str =
    "Runs sing-box in TUN mode on behalf of AureStream. Installed once per machine; started on demand without UAC.";

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "linux")]
pub mod linux;
