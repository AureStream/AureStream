use sqlx::{Row, SqlitePool};

use crate::error::AppError;
use crate::models::endpoint::{
    AuthInfo, Endpoint, EndpointMetadata, Protocol, TransportInfo, TransportNetwork,
};

pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Endpoint>, AppError> {
    let rows = sqlx::query(
        r#"SELECT id, source_id, name, protocol, server, port, udp, tls, network,
                  auth_json, transport_json, metadata_json, raw_json, unique_hash
           FROM endpoints ORDER BY source_id, name"#,
    )
    .fetch_all(pool)
    .await?;
    rows.iter().map(row_to_endpoint).collect()
}

pub async fn list_by_source(pool: &SqlitePool, source_id: &str) -> Result<Vec<Endpoint>, AppError> {
    let rows = sqlx::query(
        r#"SELECT id, source_id, name, protocol, server, port, udp, tls, network,
                  auth_json, transport_json, metadata_json, raw_json, unique_hash
           FROM endpoints WHERE source_id = ?1 ORDER BY name"#,
    )
    .bind(source_id)
    .fetch_all(pool)
    .await?;
    rows.iter().map(row_to_endpoint).collect()
}

pub async fn count_by_source(pool: &SqlitePool, source_id: &str) -> Result<i32, AppError> {
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM endpoints WHERE source_id = ?1")
        .bind(source_id)
        .fetch_one(pool)
        .await?;
    Ok(i32::try_from(n).unwrap_or(i32::MAX))
}

/// 替换某订阅下的全部节点（事务）。
pub async fn replace_for_source(pool: &SqlitePool, source_id: &str, eps: &[Endpoint]) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM endpoints WHERE source_id = ?1")
        .bind(source_id)
        .execute(&mut *tx)
        .await?;
    insert_many_tx(&mut tx, eps).await?;
    tx.commit().await?;
    Ok(())
}

async fn insert_many_tx(tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>, eps: &[Endpoint]) -> Result<(), AppError> {
    for ep in eps {
        upsert_with_executor(&mut **tx, ep).await?;
    }
    Ok(())
}

async fn upsert_with_executor<'e, E>(executor: E, ep: &Endpoint) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let auth_json = serde_json::to_string(&ep.auth)?;
    let transport_json = serde_json::to_string(&ep.transport)?;
    let metadata_json = serde_json::to_string(&ep.metadata)?;
    let raw_json = ep
        .raw
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let network = ep.network.as_ref().map(|n| n.as_str());

    sqlx::query(
        r#"INSERT INTO endpoints (
            id, source_id, name, protocol, server, port, udp, tls, network,
            auth_json, transport_json, metadata_json, raw_json, unique_hash,
            favorite, last_used_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, NULL)
        ON CONFLICT(id) DO UPDATE SET
            source_id = excluded.source_id,
            name = excluded.name,
            protocol = excluded.protocol,
            server = excluded.server,
            port = excluded.port,
            udp = excluded.udp,
            tls = excluded.tls,
            network = excluded.network,
            auth_json = excluded.auth_json,
            transport_json = excluded.transport_json,
            metadata_json = excluded.metadata_json,
            raw_json = excluded.raw_json,
            unique_hash = excluded.unique_hash"#,
    )
    .bind(&ep.id)
    .bind(&ep.source_id)
    .bind(&ep.name)
    .bind(ep.protocol.as_str())
    .bind(&ep.server)
    .bind(i64::from(ep.port))
    .bind(ep.udp as i64)
    .bind(ep.tls as i64)
    .bind(network)
    .bind(auth_json)
    .bind(transport_json)
    .bind(metadata_json)
    .bind(raw_json)
    .bind(&ep.unique_hash)
    .execute(executor)
    .await?;
    Ok(())
}

fn row_to_endpoint(row: &sqlx::sqlite::SqliteRow) -> Result<Endpoint, AppError> {
    let protocol_str: String = row.try_get("protocol")?;
    let protocol = parse_protocol(&protocol_str)?;
    let udp: i64 = row.try_get("udp")?;
    let tls: i64 = row.try_get("tls")?;
    let network: Option<String> = row.try_get("network")?;
    let auth_json: String = row.try_get("auth_json")?;
    let transport_json: String = row.try_get("transport_json")?;
    let metadata_json: String = row.try_get("metadata_json")?;
    let raw_json: Option<String> = row.try_get("raw_json")?;

    let auth: AuthInfo = serde_json::from_str(&auth_json)?;
    let transport: TransportInfo = serde_json::from_str(&transport_json)?;
    let metadata: EndpointMetadata = serde_json::from_str(&metadata_json)?;
    let raw = raw_json
        .filter(|s| !s.is_empty())
        .map(|s| serde_json::from_str(&s))
        .transpose()?;

    let port: i64 = row.try_get("port")?;
    let port = u16::try_from(port).map_err(|_| AppError::other(format!("非法端口: {port}")))?;

    Ok(Endpoint {
        id: row.try_get("id")?,
        source_id: row.try_get("source_id")?,
        name: row.try_get("name")?,
        protocol,
        server: row.try_get("server")?,
        port,
        udp: udp != 0,
        tls: tls != 0,
        network: network.and_then(|s| parse_network(&s)),
        auth,
        transport,
        metadata,
        unique_hash: row.try_get("unique_hash")?,
        raw,
    })
}

fn parse_protocol(s: &str) -> Result<Protocol, AppError> {
    Protocol::parse(s).ok_or_else(|| AppError::protocol(s, "未知协议"))
}

fn parse_network(s: &str) -> Option<TransportNetwork> {
    match s {
        "tcp" => Some(TransportNetwork::Tcp),
        "ws" => Some(TransportNetwork::Ws),
        "grpc" => Some(TransportNetwork::Grpc),
        "http2" => Some(TransportNetwork::Http2),
        "quic" => Some(TransportNetwork::Quic),
        _ => None,
    }
}
