use std::path::Path;

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::SqlitePool;

use crate::error::AppError;

/// 创建连接池并执行迁移（`migrations/` 相对 `src-tauri` crate 根目录）。
pub async fn connect_pool(db_path: impl AsRef<Path>) -> Result<SqlitePool, AppError> {
    let opts = SqliteConnectOptions::new()
        .filename(db_path.as_ref())
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePool::connect_with(opts).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
