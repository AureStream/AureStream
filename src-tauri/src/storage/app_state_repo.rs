use sqlx::SqlitePool;

use crate::error::AppError;

pub async fn get_raw(pool: &SqlitePool, key: &str) -> Result<Option<String>, AppError> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_state WHERE key = ?1")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.0))
}

pub async fn set_raw(pool: &SqlitePool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO app_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_json<T>(pool: &SqlitePool, key: &str) -> Result<Option<T>, AppError>
where
    T: serde::de::DeserializeOwned,
{
    let Some(raw) = get_raw(pool, key).await? else {
        return Ok(None);
    };
    Ok(Some(serde_json::from_str(&raw)?))
}

pub async fn set_json<T: serde::Serialize>(pool: &SqlitePool, key: &str, value: &T) -> Result<(), AppError> {
    let raw = serde_json::to_string(value)?;
    set_raw(pool, key, &raw).await
}
