use crate::commands::ProxyConfig;
use crate::error::AppError;

/// 系统代理写入（底层仍为 `commands::system_proxy`，后续可迁入 `network/system_proxy/*`）。
pub struct ProxyManager;

impl ProxyManager {
    pub fn enable(&self, cfg: &ProxyConfig) -> Result<(), AppError> {
        crate::commands::system_proxy::apply_platform(cfg).map_err(AppError::other)
    }

    pub fn disable(&self) -> Result<(), AppError> {
        crate::commands::system_proxy::clear_platform().map_err(AppError::other)
    }
}
