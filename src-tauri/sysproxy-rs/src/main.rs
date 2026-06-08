use clap::{Parser, Subcommand};
use sysproxy_rs::{Autoproxy, Sysproxy};
use std::process::ExitCode;

/// Fixed filename for UWP exemption import/export.
#[cfg(target_os = "windows")]
const UWP_EXEMPTION_FILE: &str = "uwp_exemption.json";

/// Cross-platform system proxy configuration tool.
///
/// Supports setting/getting HTTP proxy and PAC auto-proxy on Windows, macOS and Linux.
/// On Windows, uses WinINet API with RAS connection enumeration for maximum compatibility.
#[derive(Parser)]
#[command(name = "sysproxy", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Query current system proxy settings
    Query,

    /// Set global HTTP proxy
    Global {
        /// Proxy server address (e.g. 127.0.0.1:7890)
        server: String,

        /// Bypass list (platform-specific format).
        /// Windows: semicolon-separated (e.g. "localhost;127.*;10.*").
        /// macOS/Linux: comma-separated (e.g. "localhost,127.0.0.1").
        #[arg(default_value = "")]
        bypass: String,
    },

    /// Set PAC auto-proxy URL
    Pac {
        /// PAC file URL (e.g. http://127.0.0.1:1080/proxy.pac)
        url: String,
    },

    /// Disable system proxy (set to direct connection)
    Off,

    /// Export current UWP loopback proxy exemption list to uwp_exemption.json (Windows only)
    #[cfg(target_os = "windows")]
    UwpGet,

    /// Apply UWP loopback proxy exemption list from uwp_exemption.json (Windows only)
    #[cfg(target_os = "windows")]
    UwpSet,

    /// Low-level set with explicit flags (advanced).
    ///
    /// Flags is a bitwise combination of proxy type flags:
    ///   1 = PROXY_TYPE_DIRECT,
    ///   2 = PROXY_TYPE_PROXY,
    ///   4 = PROXY_TYPE_AUTO_PROXY_URL,
    ///   8 = PROXY_TYPE_AUTO_DETECT.
    ///
    /// Use "-" as placeholder to keep the original value for optional fields.
    Set {
        /// Proxy type flags (1-15)
        flags: u32,

        /// Proxy server address (use "-" to keep current)
        #[arg(default_value = "-")]
        server: String,

        /// Bypass list (use "-" to keep current)
        #[arg(default_value = "-")]
        bypass: String,

        /// PAC URL (use "-" to keep current)
        #[arg(default_value = "-")]
        pac_url: String,
    },
}

fn main() -> ExitCode {
    env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .format(|buf, record| {
            use std::io::Write;
            let now = chrono::Local::now();
            writeln!(
                buf,
                "[{}][{}][{}][{}] {}",
                now.format("%Y-%m-%d"),
                now.format("%H:%M:%S%.3f"),
                record.level(),
                record.target(),
                record.args()
            )
        })
        .init();
    let cli = Cli::parse();

    match run(cli.command) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("Error: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(cmd: Commands) -> sysproxy_rs::Result<()> {
    match cmd {
        Commands::Query => {
            let proxy = Sysproxy::get_system_proxy()?;
            let auto = Autoproxy::get_auto_proxy()?;

            let server_display = if proxy.host.is_empty() {
                String::new()
            } else {
                format!("{}:{}", proxy.host, proxy.port)
            };

            println!("=== System Proxy ===");
            println!("  Enabled : {}", proxy.enable);
            println!("  Server  : {}", server_display);
            println!("  Bypass  : {}", proxy.bypass);
            println!();
            println!("=== Auto Proxy (PAC) ===");
            println!("  Enabled : {}", auto.enable);
            println!("  URL     : {}", auto.url);
        }

        Commands::Global { server, bypass } => {
            let (host, port) = parse_server(&server)?;
            let proxy = Sysproxy {
                enable: true,
                host,
                port,
                bypass,
            };
            proxy.set_system_proxy()?;
            println!("Global proxy set to {server}");
        }

        Commands::Pac { url } => {
            let auto = Autoproxy { enable: true, url };
            auto.set_auto_proxy()?;
            println!("PAC auto-proxy set");
        }

        Commands::Off => {
            let proxy = Sysproxy {
                enable: false,
                ..Default::default()
            };
            proxy.set_system_proxy()?;

            let auto = Autoproxy {
                enable: false,
                ..Default::default()
            };
            auto.set_auto_proxy()?;

            println!("System proxy disabled");
        }

        Commands::Set {
            flags,
            server,
            bypass,
            pac_url,
        } => {
            if !(1..=15).contains(&flags) {
                return Err(sysproxy_rs::Error::ParseStr(format!(
                    "flags must be 1-15, got {flags}"
                )));
            }

            // flags bit 1 = DIRECT, bit 2 = PROXY, bit 4 = PAC, bit 8 = AUTO_DETECT
            let has_proxy = flags & 2 != 0;
            let has_pac = flags & 4 != 0;

            // Read current settings as base for "-" (keep current) placeholders
            let current_proxy = Sysproxy::get_system_proxy().unwrap_or_default();
            let current_auto = Autoproxy::get_auto_proxy().unwrap_or_default();

            // Each branch sets a complete, self-consistent flag state.
            // Calling set_system_proxy and set_auto_proxy sequentially when both
            // are active is not safe: the second call overwrites the flags set by
            // the first. Instead, only call the operation that matches the flags.
            if has_proxy {
                let (host, port) = if server == "-" {
                    (current_proxy.host, current_proxy.port)
                } else {
                    parse_server(&server)?
                };
                let bypass = if bypass == "-" {
                    current_proxy.bypass
                } else {
                    bypass
                };
                let proxy = Sysproxy {
                    enable: true,
                    host,
                    port,
                    bypass,
                };
                proxy.set_system_proxy()?;
                // set_system_proxy uses PROXY_TYPE_PROXY|PROXY_TYPE_DIRECT flags,
                // which already clears PROXY_TYPE_AUTO_PROXY_URL.
                // Only additionally set PAC when explicitly requested.
                if has_pac {
                    let url = if pac_url == "-" {
                        current_auto.url
                    } else {
                        pac_url
                    };
                    let auto = Autoproxy { enable: true, url };
                    auto.set_auto_proxy()?;
                }
            } else if has_pac {
                let url = if pac_url == "-" {
                    current_auto.url
                } else {
                    pac_url
                };
                let auto = Autoproxy { enable: true, url };
                auto.set_auto_proxy()?;
            } else {
                // flags == 1 (DIRECT only): disable everything
                let proxy = Sysproxy {
                    enable: false,
                    ..Default::default()
                };
                proxy.set_system_proxy()?;
            }

            println!("Proxy settings applied (flags={flags})");
        }

        #[cfg(target_os = "windows")]
        Commands::UwpGet => {
            let list = sysproxy_rs::AppContainer::get_exemption()?;
            let json = serde_json::to_string_pretty(&list)
                .map_err(|e| sysproxy_rs::Error::ParseStr(e.to_string()))?;
            std::fs::write(UWP_EXEMPTION_FILE, &json)?;
            println!("Wrote {} entries to {UWP_EXEMPTION_FILE}", list.len());
        }

        #[cfg(target_os = "windows")]
        Commands::UwpSet => {
            let content = std::fs::read_to_string(UWP_EXEMPTION_FILE)?;
            let entries: Vec<sysproxy_rs::AppContainer> = serde_json::from_str(&content)
                .map_err(|e| sysproxy_rs::Error::ParseStr(e.to_string()))?;
            let sids: Vec<String> = entries
                .into_iter()
                .filter(|c| c.exempted)
                .map(|c| c.sid)
                .collect();
            let updated = sysproxy_rs::AppContainer::set_exemption(&sids)?;
            let applied = updated.iter().filter(|c| c.exempted).count();
            println!("Applied {applied} UWP exemptions");
        }
    }

    Ok(())
}

/// Parse "host:port" string into (host, port).
fn parse_server(server: &str) -> sysproxy_rs::Result<(String, u16)> {
    if let Some((host, port_str)) = server.rsplit_once(':') {
        let port: u16 = port_str
            .parse()
            .map_err(|_| sysproxy_rs::Error::ParseStr(server.into()))?;
        Ok((host.to_string(), port))
    } else {
        Err(sysproxy_rs::Error::ParseStr(format!(
            "expected host:port, got '{server}'"
        )))
    }
}
