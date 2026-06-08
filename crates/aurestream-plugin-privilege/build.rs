fn main() {
    #[cfg(target_os = "macos")]
    {
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
            cc::Build::new()
                .file("src/macos/helper.m")
                .flag("-fobjc-arc")
                .flag("-fmodules")
                .compile("aurestream_helper_client");
            println!("cargo:rustc-link-lib=framework=Foundation");
            println!("cargo:rustc-link-lib=framework=ServiceManagement");
            println!("cargo:rustc-link-lib=framework=Security");
            println!("cargo:rerun-if-changed=src/macos/helper.m");
        }
    }
}
