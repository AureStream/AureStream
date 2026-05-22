use sqlx::{Row, SqlitePool};

use crate::error::AppError;
use crate::models::subscription::{HealthStatus, Subscription, SubscriptionType};

pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Subscription>, AppError> {
    let rows = sqlx::query(
        r#"SELECT id, name, url, sub_type, enabled, auto_update, update_interval, last_updated_at,
                  node_count, health_status, health_message,
                  traffic_upload, traffic_download, traffic_total, expire_at,
                  last_success_at, created_at, updated_at
           FROM subscriptions ORDER BY updated_at DESC"#,
    )
    .fetch_all(pool)
    .await?;
    rows.iter().map(row_to_subscription).collect()
}

pub async fn upsert(pool: &SqlitePool, sub: &Subscription) -> Result<(), AppError> {
    sqlx::query(
        r#"INSERT INTO subscriptions (
            id, name, url, sub_type, enabled, auto_update, update_interval, last_updated_at,
            node_count, health_status, health_message,
            traffic_upload, traffic_download, traffic_total, expire_at,
            last_success_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            url = excluded.url,
            sub_type = excluded.sub_type,
            enabled = excluded.enabled,
            auto_update = excluded.auto_update,
            update_interval = excluded.update_interval,
            last_updated_at = excluded.last_updated_at,
            node_count = excluded.node_count,
            health_status = excluded.health_status,
            health_message = excluded.health_message,
            traffic_upload = excluded.traffic_upload,
            traffic_download = excluded.traffic_download,
            traffic_total = excluded.traffic_total,
            expire_at = excluded.expire_at,
            last_success_at = excluded.last_success_at,
            updated_at = excluded.updated_at"#,
    )
    .bind(&sub.id)
    .bind(&sub.name)
    .bind(&sub.url)
    .bind(sub.sub_type.as_str())
    .bind(sub.enabled as i64)
    .bind(sub.auto_update as i64)
    .bind(sub.update_interval)
    .bind(sub.last_updated_at)
    .bind(sub.node_count)
    .bind(sub.health_status.as_str())
    .bind(&sub.health_message)
    .bind(sub.traffic_upload)
    .bind(sub.traffic_download)
    .bind(sub.traffic_total)
    .bind(sub.expire_at)
    .bind(sub.last_success_at)
    .bind(sub.created_at)
    .bind(sub.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<u64, AppError> {
    let res = sqlx::query("DELETE FROM subscriptions WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected())
}

fn row_to_subscription(row: &sqlx::sqlite::SqliteRow) -> Result<Subscription, AppError> {
    let sub_type_str: String = row.try_get("sub_type")?;
    let health_str: String = row.try_get("health_status")?;
    Ok(Subscription {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        url: row.try_get("url")?,
        sub_type: parse_sub_type(&sub_type_str)?,
        enabled: row.try_get::<i64, _>("enabled")? != 0,
        auto_update: row.try_get::<i64, _>("auto_update")? != 0,
        update_interval: row.try_get("update_interval")?,
        health_status: parse_health(&health_str)?,
        health_message: row.try_get("health_message")?,
        node_count: row.try_get("node_count")?,
        traffic_upload: row.try_get("traffic_upload")?,
        traffic_download: row.try_get("traffic_download")?,
        traffic_total: row.try_get("traffic_total")?,
        expire_at: row.try_get("expire_at")?,
        last_success_at: row.try_get("last_success_at")?,
        last_updated_at: row.try_get("last_updated_at")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn parse_sub_type(s: &str) -> Result<SubscriptionType, AppError> {
    match s {
        "clash" => Ok(SubscriptionType::Clash),
        "v2ray" => Ok(SubscriptionType::V2ray),
        "singbox" => Ok(SubscriptionType::SingBox),
        "surge" => Ok(SubscriptionType::Surge),
        "sip008" => Ok(SubscriptionType::Sip008),
        "auto" => Ok(SubscriptionType::Auto),
        _ => Err(AppError::other(format!("未知订阅类型: {s}"))),
    }
}

fn parse_health(s: &str) -> Result<HealthStatus, AppError> {
    match s {
        "ok" => Ok(HealthStatus::Ok),
        "error" => Ok(HealthStatus::Error),
        "expired" => Ok(HealthStatus::Expired),
        _ => Err(AppError::other(format!("未知健康状态: {s}"))),
    }
}

