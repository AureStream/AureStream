use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use log::{error, info, warn};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::commands::proxy::ProxyState;

const GEODATA_URLS: &[(&str, &str)] = &[
    (
        "geoip.db",
        "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.db",
    ),
    (
        "geoip-lite.db",
        "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip-lite.db",
    ),
    (
        "country.mmdb",
        "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb",
    ),
    (
        "geosite.dat",
        "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    ),
];

/// 预下载 GeoIP/GeoSite 文件到 mihomo 工作目录，避免首次连接时内核阻塞下载。
#[tauri::command]
pub async fn download_geodata(app: AppHandle) -> Result<(), String> {
    let work_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("无法获取本地数据目录: {}", e))?
        .join("mihomo-work");
    tokio::fs::create_dir_all(&work_dir)
        .await
        .map_err(|e| format!("创建工作目录失败: {}", e))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    for (filename, url) in GEODATA_URLS {
        let dest = work_dir.join(filename);
        if dest.exists() {
            continue;
        }
        info!("[geodata] 下载 {} ...", filename);
        match client.get(*url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    warn!("[geodata] 下载 {} 失败: HTTP {}", filename, resp.status());
                    continue;
                }
                let bytes = resp
                    .bytes()
                    .await
                    .map_err(|e| format!("读取 {} 失败: {}", filename, e))?;
                tokio::fs::write(&dest, &bytes)
                    .await
                    .map_err(|e| format!("写入 {} 失败: {}", filename, e))?;
                info!("[geodata] {} 下载完成 ({} bytes)", filename, bytes.len());
            }
            Err(e) => {
                error!("[geodata] 下载 {} 失败: {}", filename, e);
            }
        }
    }

    Ok(())
}

pub struct MihomoKernelState {
    inner: Mutex<Option<MihomoChild>>,
    /// 若为 true，表示上次成功连接时已由本应用开启系统代理，断开时应尝试关闭。
    system_proxy_managed: AtomicBool,
}

struct MihomoChild {
    child: tauri_plugin_shell::process::CommandChild,
}

impl Default for MihomoKernelState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
            system_proxy_managed: AtomicBool::new(false),
        }
    }
}

/// 首次启动含 GEOIP/GEOSITE 时需拉取 geodata，短时内常无法就绪；用墙钟上限避免长期阻塞。
async fn wait_for_controller_ready() -> Result<(), String> {
    // 连接成功后系统代理会指向本机 mixed-port；reqwest 默认会跟系统代理，轮询 9090 可能被错误转发。必须直连本机 API。
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .no_proxy()
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    // 给 sidecar 完成 exec、解析配置的一小段缓冲
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);

    loop {
        if std::time::Instant::now() >= deadline {
            break;
        }
        match client.get("http://127.0.0.1:9090/version").send().await {
            Ok(r) if r.status().is_success() => return Ok(()),
            _ => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
        }
    }

    Err(
        "等待 Mihomo API 就绪超时（已轮询约 30 秒）。常见原因：1）首次 GEOIP/GEOSITE 需下载 geodata，可能超过 30 秒；2）127.0.0.1:9090 被占用；3）内核因配置或订阅 YAML 错误已退出——请查看控制台 [mihomo] 日志。"
            .to_string(),
    )
}

/// 启动（或重启）Mihomo sidecar，使用 `build_aurestream_mihomo_config` 生成的运行时配置路径。
#[tauri::command]
pub async fn start_mihomo_kernel(
    app: AppHandle,
    state: State<'_, MihomoKernelState>,
    proxy_state: State<'_, ProxyState>,
    patched_config_path: String,
) -> Result<(), String> {
    let config = PathBuf::from(&patched_config_path);
    if !config.is_file() {
        return Err("运行配置不存在，请先调用 build_aurestream_mihomo_config".to_string());
    }

    let work_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("无法获取本地数据目录: {}", e))?
        .join("mihomo-work");
    tokio::fs::create_dir_all(&work_dir)
        .await
        .map_err(|e| format!("创建工作目录失败: {}", e))?;
    let providers_cache = work_dir.join("providers");
    tokio::fs::create_dir_all(&providers_cache)
        .await
        .map_err(|e| format!("创建 providers 缓存目录失败: {}", e))?;

    {
        let mut guard = state.inner.lock().await;
        if let Some(MihomoChild { child }) = guard.take() {
            let _ = child.kill();
        }
    }

    let cfg_str = config
        .to_str()
        .ok_or_else(|| "配置路径含非法字符".to_string())?
        .to_string();
    let work_str = work_dir
        .to_str()
        .ok_or_else(|| "工作目录路径含非法字符".to_string())?
        .to_string();

    let sidecar = app
        .shell()
        .sidecar("mihomo")
        .map_err(|e| {
            format!(
                "加载 Mihomo sidecar 失败: {}（开发环境请确认已下载 binaries）",
                e
            )
        })?
        .args(["-f", &cfg_str, "-d", &work_str]);

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("启动 Mihomo 进程失败: {}", e))?;

    // Mihomo 日志写入独立文件
    let mihomo_log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("无法获取日志目录: {}", e))?;
    let _ = tokio::fs::create_dir_all(&mihomo_log_dir).await;
    let mihomo_log_file = mihomo_log_dir.join("mihomo.log");

    tauri::async_runtime::spawn(async move {
        let mut log_file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&mihomo_log_file)
            .await
            .ok();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if let Some(ref mut f) = log_file {
                        let _ = f.write_all(format!("[stderr] {}\n", text).as_bytes()).await;
                    }
                }
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if let Some(ref mut f) = log_file {
                        let _ = f.write_all(format!("[stdout] {}\n", text).as_bytes()).await;
                    }
                }
                CommandEvent::Error(err) => {
                    if let Some(ref mut f) = log_file {
                        let _ = f.write_all(format!("[error] {}\n", err).as_bytes()).await;
                    }
                }
                _ => {}
            }
        }
    });

    {
        let mut guard = state.inner.lock().await;
        *guard = Some(MihomoChild { child });
    }

    if let Err(e) = wait_for_controller_ready().await {
        let mut guard = state.inner.lock().await;
        if let Some(MihomoChild { child }) = guard.take() {
            let _ = child.kill();
        }
        if let Ok(mut status) = proxy_state.status.lock() {
            status.is_running = false;
        }
        return Err(e);
    }

    let proxy_config = proxy_state
        .config
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    match tokio::task::spawn_blocking(move || {
        crate::commands::system_proxy::apply_platform(&proxy_config)
    })
    .await
    {
        Ok(Ok(())) => {
            state.system_proxy_managed.store(true, Ordering::SeqCst);
        }
        Ok(Err(err)) => {
            warn!(
                "[system-proxy] 未能启用系统代理: {}（Mihomo 已运行，可在系统设置中手动配置）",
                err
            );
        }
        Err(join_err) => error!("[system-proxy] 启用任务失败: {:?}", join_err),
    }

    if let Ok(mut status) = proxy_state.status.lock() {
        status.is_running = true;
    }

    Ok(())
}

/// 结束由本进程拉起的 Mihomo sidecar（供 `stop_mihomo_kernel` 命令、`stop_proxy` 与应用退出钩子共用）。
pub(crate) async fn stop_mihomo_sidecar(state: &MihomoKernelState) -> Result<(), String> {
    let kill_result = {
        let mut guard = state.inner.lock().await;
        if let Some(MihomoChild { child }) = guard.take() {
            child
                .kill()
                .map_err(|e| format!("终止 Mihomo 进程失败: {}", e))
        } else {
            Ok(())
        }
    };

    if kill_result.is_ok() && state.system_proxy_managed.load(Ordering::SeqCst) {
        match tokio::task::spawn_blocking(|| crate::commands::system_proxy::clear_platform()).await
        {
            Ok(Ok(())) => {
                state.system_proxy_managed.store(false, Ordering::SeqCst);
            }
            Ok(Err(e)) => warn!(
                "[system-proxy] 关闭系统代理失败: {}（请在系统「网络」设置中手动关闭代理）",
                e
            ),
            Err(e) => error!("[system-proxy] 清除系统代理任务失败: {:?}", e),
        }
    }

    kill_result
}

/// 结束由本进程拉起的 Mihomo sidecar。
#[tauri::command]
pub async fn stop_mihomo_kernel(state: State<'_, MihomoKernelState>) -> Result<(), String> {
    stop_mihomo_sidecar(&state).await
}
