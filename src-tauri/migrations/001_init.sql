-- AureStream v3 — 初始 Schema（与技术设计文档 §5 对齐）

CREATE TABLE IF NOT EXISTS subscriptions (
    id               TEXT PRIMARY KEY NOT NULL,
    name             TEXT NOT NULL,
    sub_type         TEXT NOT NULL DEFAULT 'clash',
    url              TEXT NOT NULL,
    enabled          INTEGER NOT NULL DEFAULT 1,
    auto_update      INTEGER NOT NULL DEFAULT 0,
    update_interval  INTEGER NOT NULL DEFAULT 3600,
    last_updated_at  INTEGER,
    node_count       INTEGER NOT NULL DEFAULT 0,
    health_status    TEXT NOT NULL DEFAULT 'ok',
    health_message   TEXT,
    traffic_upload   INTEGER,
    traffic_download INTEGER,
    traffic_total    INTEGER,
    expire_at        INTEGER,
    last_success_raw BLOB,
    parsed_cache     TEXT,
    last_success_at  INTEGER,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS endpoints (
    id             TEXT PRIMARY KEY NOT NULL,
    source_id      TEXT NOT NULL,
    name           TEXT NOT NULL,
    protocol       TEXT NOT NULL,
    server         TEXT NOT NULL,
    port           INTEGER NOT NULL,
    udp            INTEGER NOT NULL DEFAULT 0,
    tls            INTEGER NOT NULL DEFAULT 0,
    network        TEXT,
    auth_json      TEXT NOT NULL DEFAULT '{}',
    transport_json TEXT NOT NULL DEFAULT '{}',
    metadata_json  TEXT NOT NULL DEFAULT '{}',
    raw_json       TEXT,
    unique_hash    TEXT NOT NULL,
    favorite       INTEGER NOT NULL DEFAULT 0,
    last_used_at   INTEGER,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (source_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_endpoints_source ON endpoints(source_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_protocol ON endpoints(protocol);
CREATE INDEX IF NOT EXISTS idx_endpoints_server_port ON endpoints(server, port);
CREATE INDEX IF NOT EXISTS idx_endpoints_unique_hash ON endpoints(unique_hash);
CREATE INDEX IF NOT EXISTS idx_endpoints_favorite ON endpoints(favorite) WHERE favorite = 1;

CREATE TABLE IF NOT EXISTS app_state (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_state (key, value) VALUES
    ('connection_state', '"disconnected"'),
    ('current_node_id', '""'),
    ('current_subscription_id', '""'),
    ('runtime_policy', '"smart_routing"'),
    ('theme', '"light"'),
    ('auto_start', 'false'),
    ('auto_connect', 'false'),
    ('proxy_bypass_domains', '"localhost,127.*,10.*,172.16.*,192.168.*,<local>"');
