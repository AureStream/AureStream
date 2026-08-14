//! Linux TUN helper binary installed to `/usr/lib/AureStream/aurestream-tun-helper`.

fn main() {
    let args: Vec<String> = std::env::args().collect();
    #[cfg(target_os = "linux")]
    {
        let code = aurestream_platform_tun::linux_helper_main(&args);
        std::process::exit(code);
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = args;
        eprintln!("aurestream-tun-helper is Linux-only");
        std::process::exit(1);
    }
}
