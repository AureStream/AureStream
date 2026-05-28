fn main() {
    #[cfg(target_os = "macos")]
    {
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
            cc::Build::new()
                .file("src/engine/macos/helper.m")
                .flag("-fobjc-arc")
                .flag("-fmodules")
                .compile("aurestream_helper_client");
            cc::Build::new()
                .file("src/macos_theme.m")
                .flag("-fobjc-arc")
                .flag("-fmodules")
                .compile("aurestream_macos_theme");
            println!("cargo:rustc-link-lib=framework=Foundation");
            println!("cargo:rustc-link-lib=framework=ServiceManagement");
            println!("cargo:rustc-link-lib=framework=Security");
            println!("cargo:rerun-if-changed=src/engine/macos/helper.m");
            println!("cargo:rerun-if-changed=src/macos_theme.m");
        }
    }

    tauri_build::build()
}
