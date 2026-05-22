use crate::models::proxy_config::ProxyConfig;
use crate::error::AppError;

#[allow(dead_code)]
pub struct ProxyManager;

#[allow(dead_code)]
impl ProxyManager {
    pub fn enable(&self, cfg: &ProxyConfig) -> Result<(), AppError> {
        crate::network::system_proxy::apply_platform(cfg).map_err(AppError::other)
    }

    pub fn disable(&self) -> Result<(), AppError> {
        crate::network::system_proxy::clear_platform().map_err(AppError::other)
    }
}
