use tauri_plugin_sql::{Migration, MigrationKind};

const SQL_1: &str = r#"
CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL UNIQUE,
    name TEXT,
    used_traffic INTEGER DEFAULT 0,
    total_traffic INTEGER DEFAULT 1,
    subscription_url TEXT,
    official_website TEXT,
    expire_time INTEGER DEFAULT (strftime('%s', 'now', '+30 days')),
    last_update_time INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE subscription_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    config_content TEXT,
    FOREIGN KEY (identifier) REFERENCES subscriptions(identifier) ON DELETE CASCADE
);

PRAGMA foreign_keys = ON;
"#;

const SQL_2: &str = r#"
CREATE TABLE node_latencies (
    tag TEXT PRIMARY KEY,
    latency INTEGER NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
"#;

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: SQL_1,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_node_latencies_table",
            sql: SQL_2,
            kind: MigrationKind::Up,
        },
    ]
}
