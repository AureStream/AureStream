use std::fmt;

/// Errors from system proxy set/clear.
#[derive(Debug)]
pub enum ProxyError {
    /// Host string was empty or whitespace-only.
    EmptyHost,
    /// Current OS / desktop environment is not supported.
    Unsupported(&'static str),
    /// Underlying I/O failure (e.g. spawning `gsettings` / `networksetup`).
    Io(std::io::Error),
    /// Platform-specific failure message.
    Platform(String),
}

impl fmt::Display for ProxyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyHost => write!(f, "proxy host must not be empty"),
            Self::Unsupported(why) => write!(f, "system proxy unsupported: {why}"),
            Self::Io(err) => write!(f, "system proxy I/O error: {err}"),
            Self::Platform(msg) => write!(f, "system proxy error: {msg}"),
        }
    }
}

impl std::error::Error for ProxyError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(err) => Some(err),
            _ => None,
        }
    }
}

impl From<std::io::Error> for ProxyError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

#[cfg(target_os = "windows")]
impl From<windows::core::Error> for ProxyError {
    fn from(value: windows::core::Error) -> Self {
        Self::Platform(value.to_string())
    }
}
