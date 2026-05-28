use crate::{Autoproxy, Error, Result, Sysproxy};
use log::debug;
use std::net::{SocketAddr, UdpSocket};
use std::{process::Command, str::from_utf8};

impl Sysproxy {
    /// Gets the current system proxy settings.
    pub fn get_system_proxy() -> Result<Sysproxy> {
        let service = default_network_service().or_else(|e| {
            debug!("Failed to get network service: {:?}", e);
            default_network_service_by_ns()
        })?;
        let service = service.as_str();

        let mut socks = Sysproxy::get_socks(service)?;
        debug!("Getting SOCKS proxy: {:?}", socks);

        let http = Sysproxy::get_http(service)?;
        debug!("Getting HTTP proxy: {:?}", http);

        let https = Sysproxy::get_https(service)?;
        debug!("Getting HTTPS proxy: {:?}", https);

        let bypass = Sysproxy::get_bypass(service)?;
        debug!("Getting bypass domains: {:?}", bypass);

        socks.bypass = bypass;

        if !socks.enable {
            if http.enable {
                socks.enable = true;
                socks.host = http.host;
                socks.port = http.port;
            }
            if https.enable {
                socks.enable = true;
                socks.host = https.host;
                socks.port = https.port;
            }
        }

        Ok(socks)
    }

    /// Sets the system proxy.
    pub fn set_system_proxy(&self) -> Result<()> {
        let service = default_network_service().or_else(|e| {
            debug!("Failed to get network service: {:?}", e);
            default_network_service_by_ns()
        })?;
        let service = service.as_str();

        debug!("Use network service: {}", service);

        debug!("Setting SOCKS proxy");
        self.set_socks(service)?;

        debug!("Setting HTTP proxy");
        self.set_https(service)?;

        debug!("Setting HTTPS proxy");
        self.set_http(service)?;

        debug!("Setting bypass domains");
        self.set_bypass(service)?;
        Ok(())
    }

    pub fn get_http(service: &str) -> Result<Sysproxy> {
        get_proxy(ProxyType::Http, service)
    }

    pub fn get_https(service: &str) -> Result<Sysproxy> {
        get_proxy(ProxyType::Https, service)
    }

    pub fn get_socks(service: &str) -> Result<Sysproxy> {
        get_proxy(ProxyType::Socks, service)
    }

    pub fn get_bypass(service: &str) -> Result<String> {
        let bypass_output = Command::new("networksetup")
            .args(["-getproxybypassdomains", service])
            .output()?;

        let bypass = from_utf8(&bypass_output.stdout)
            .or(Err(Error::ParseStr("bypass".into())))?
            .split('\n')
            .filter(|s| !s.is_empty())
            .collect::<Vec<&str>>()
            .join(",");

        Ok(bypass)
    }

    pub fn set_http(&self, service: &str) -> Result<()> {
        set_proxy(self, ProxyType::Http, service)
    }

    pub fn set_https(&self, service: &str) -> Result<()> {
        set_proxy(self, ProxyType::Https, service)
    }

    pub fn set_socks(&self, service: &str) -> Result<()> {
        set_proxy(self, ProxyType::Socks, service)
    }

    pub fn set_bypass(&self, service: &str) -> Result<()> {
        let domains = self.bypass.split(",").collect::<Vec<_>>();
        networksetup()
            .args([["-setproxybypassdomains", service].to_vec(), domains].concat())
            .status()?;
        Ok(())
    }
}

impl Autoproxy {
    /// Gets the current auto-proxy (PAC) settings.
    pub fn get_auto_proxy() -> Result<Autoproxy> {
        let service = default_network_service().or_else(|e| {
            debug!("Failed to get network service: {:?}", e);
            default_network_service_by_ns()
        })?;
        let service = service.as_str();

        let auto_output = networksetup()
            .args(["-getautoproxyurl", service])
            .output()?;
        let auto = from_utf8(&auto_output.stdout)
            .or(Err(Error::ParseStr("auto".into())))?
            .trim()
            .split_once('\n')
            .ok_or(Error::ParseStr("auto".into()))?;
        let url = strip_str(auto.0.strip_prefix("URL: ").unwrap_or(""));
        // macOS networksetup returns "(null)" when no PAC URL is configured
        let url = if url == "(null)" { "" } else { url };
        let enable = auto.1 == "Enabled: Yes";

        Ok(Autoproxy {
            enable,
            url: url.to_string(),
        })
    }

    /// Sets the auto-proxy (PAC) configuration.
    pub fn set_auto_proxy(&self) -> Result<()> {
        let service = default_network_service().or_else(|e| {
            debug!("Failed to get network service: {:?}", e);
            default_network_service_by_ns()
        })?;
        let service = service.as_str();

        let enable = if self.enable { "on" } else { "off" };
        let url = if self.url.is_empty() {
            "\"\""
        } else {
            &self.url
        };
        networksetup()
            .args(["-setautoproxyurl", service, url])
            .status()?;
        networksetup()
            .args(["-setautoproxystate", service, enable])
            .status()?;

        Ok(())
    }
}

#[derive(Debug)]
enum ProxyType {
    Http,
    Https,
    Socks,
}

impl ProxyType {
    fn to_target(&self) -> &'static str {
        match self {
            ProxyType::Http => "webproxy",
            ProxyType::Https => "securewebproxy",
            ProxyType::Socks => "socksfirewallproxy",
        }
    }
}

fn networksetup() -> Command {
    Command::new("networksetup")
}

fn set_proxy(proxy: &Sysproxy, proxy_type: ProxyType, service: &str) -> Result<()> {
    let target = format!("-set{}", proxy_type.to_target());
    let port = format!("{}", proxy.port);

    networksetup()
        .args([target.as_str(), service, proxy.host.as_str(), port.as_str()])
        .status()?;

    let target_state = format!("-set{}state", proxy_type.to_target());
    let enable = if proxy.enable { "on" } else { "off" };

    networksetup()
        .args([target_state.as_str(), service, enable])
        .status()?;

    Ok(())
}

fn get_proxy(proxy_type: ProxyType, service: &str) -> Result<Sysproxy> {
    let target = format!("-get{}", proxy_type.to_target());

    let output = networksetup().args([target.as_str(), service]).output()?;

    let stdout = from_utf8(&output.stdout).or(Err(Error::ParseStr("output".into())))?;
    let enable = parse(stdout, "Enabled:");
    let enable = enable == "Yes";

    let host = parse(stdout, "Server:").to_string();

    let port = parse(stdout, "Port:");
    let port = port.parse().or(Err(Error::ParseStr("port".into())))?;

    Ok(Sysproxy {
        enable,
        host,
        port,
        bypass: String::new(),
    })
}

fn parse<'a>(target: &'a str, key: &'a str) -> &'a str {
    match target.find(key) {
        Some(idx) => {
            let idx = idx + key.len();
            let value = &target[idx..];
            let value = match value.find("\n") {
                Some(end) => &value[..end],
                None => value,
            };
            value.trim()
        }
        None => "",
    }
}

fn strip_str(text: &str) -> &str {
    text.strip_prefix('"')
        .unwrap_or(text)
        .strip_suffix('"')
        .unwrap_or(text)
}

fn default_network_service() -> Result<String> {
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.connect("1.1.1.1:80")?;
    let ip = socket.local_addr()?.ip();
    let addr = SocketAddr::new(ip, 0);

    let interfaces = interfaces::Interface::get_all().or(Err(Error::NetworkInterface))?;
    let interface = interfaces
        .into_iter()
        .find(|i| i.addresses.iter().any(|a| a.addr == Some(addr)))
        .map(|i| i.name.to_owned());

    match interface {
        Some(interface) => {
            let service = get_service_by_order(interface)?;
            Ok(service)
        }
        None => Err(Error::NetworkInterface),
    }
}

fn default_network_service_by_ns() -> Result<String> {
    let output = networksetup().arg("-listallnetworkservices").output()?;
    let stdout = from_utf8(&output.stdout).or(Err(Error::ParseStr("output".into())))?;
    let mut lines = stdout.split('\n');
    lines.next(); // ignore the tips

    match lines.next() {
        Some(line) => Ok(line.into()),
        None => Err(Error::NetworkInterface),
    }
}

fn get_service_by_order(device: String) -> Result<String> {
    let services = listnetworkserviceorder()?;
    let service = services
        .into_iter()
        .find(|(_, _, d)| d == &device)
        .map(|(s, _, _)| s);
    match service {
        Some(service) => Ok(service),
        None => Err(Error::NetworkInterface),
    }
}

fn listnetworkserviceorder() -> Result<Vec<(String, String, String)>> {
    let output = networksetup().arg("-listnetworkserviceorder").output()?;
    let stdout = from_utf8(&output.stdout).or(Err(Error::ParseStr("output".into())))?;

    let mut lines = stdout.split('\n');
    lines.next(); // ignore the tips

    let mut services = Vec::new();
    let mut pending: Option<(String, String, String)> = None;

    for line in lines {
        if !line.starts_with("(") {
            continue;
        }

        if pending.is_none() {
            let ri = line.find(")");
            if ri.is_none() {
                continue;
            }
            let ri = ri.unwrap();
            let service = line[ri + 1..].trim();
            pending = Some((service.into(), String::new(), String::new()));
        } else {
            let line = &line[1..line.len() - 1];
            let pi = line.find("Port:");
            let di = line.find(", Device:");
            if pi.is_none() || di.is_none() {
                continue;
            }
            let pi = pi.unwrap();
            let di = di.unwrap();
            let port = line[pi + 5..di].trim();
            let device = line[di + 9..].trim();
            let (service, _, _) = pending.as_ref().unwrap();
            let entry = (service.clone(), port.into(), device.into());
            services.push(entry);
            pending = None;
        }
    }

    Ok(services)
}
