//! `app_state` KV 表的 CRUD 操作。
//!
//! 值以 JSON 字符串存储，读取时直接返回 String，
//! 调用方自行 serde_json::from_str 反序列化。

use sqlx::{Row, SqlitePool};

use crate::error::AppError;

/// 读取 KV 值，不存在返回 None。
pub async fn get(pool: &SqlitePool, key: &str) -> Result<Option<String>, AppError> {
    let row = sqlx::query("SELECT value FROM app_state WHERE key = ?1")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|r| r.try_get::<String, _>("value").ok()))
}

/// 写入 KV 值（INSERT OR REPLACE）。
pub async fn set(pool: &SqlitePool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO app_state (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

/// 删除 KV 值。
pub async fn delete(pool: &SqlitePool, key: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM app_state WHERE key = ?1")
        .bind(key)
        .execute(pool)
        .await?;
    Ok(())
}

/// 读取并反序列化为指定类型。
pub async fn get_as<T: serde::de::DeserializeOwned>(
    pool: &SqlitePool,
    key: &str,
) -> Result<Option<T>, AppError> {
    let Some(raw) = get(pool, key).await? else {
        return Ok(None);
    };
    let val: T = serde_json::from_str(&raw)?;
    Ok(Some(val))
}

/// 序列化并写入。
pub async fn set_as<T: serde::Serialize>(
    pool: &SqlitePool,
    key: &str,
    value: &T,
) -> Result<(), AppError> {
    let json = serde_json::to_string(value)?;
    set(pool, key, &json).await
}

/// 读取所有 KV 对。
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<(String, String)>, AppError> {
    let rows = sqlx::query("SELECT key, value FROM app_state")
        .fetch_all(pool)
        .await?;
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let key: String = r.try_get("key")?;
        let value: String = r.try_get("value")?;
        out.push((key, value));
    }
    Ok(out)
}
