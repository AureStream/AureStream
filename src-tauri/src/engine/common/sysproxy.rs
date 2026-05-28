use tauri::AppHandle;

pub const EVENT_TAURI_LOG: &str = "tauri-log";
const PROXY_HOST: &str = "127.0.0.1";

pub(crate) async fn set_system_proxy(app: &AppHandle) -> anyhow::Result<()> {
    log::info!("Start set system proxy: {}:6789", PROXY_HOST);
    Ok(())
}

pub(crate) async fn clear_system_proxy(app: &AppHandle) -> anyhow::Result<()> {
    log::info!("System proxy unset successfully");
    Ok(())
}
