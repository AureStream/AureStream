//! SQLite 持久化：连接池、迁移与 Repository。

pub mod database;
pub mod endpoint_repo;
pub mod subscription_repo;

pub use database::connect_pool;
