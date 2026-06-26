use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub struct DbConn(pub Mutex<Connection>);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub title: String,
    pub author: Option<String>,
    pub thumbnail_url: Option<String>,
    pub format: String,
    pub file_path: String,
    pub created_at: i64,
}

pub fn open(app_data_dir: &std::path::Path) -> Result<Connection> {
    std::fs::create_dir_all(app_data_dir).ok();
    let path = app_data_dir.join("stroygetter.db");
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS downloads (
            id            TEXT PRIMARY KEY,
            url           TEXT NOT NULL,
            title         TEXT NOT NULL,
            author        TEXT,
            thumbnail_url TEXT,
            format        TEXT NOT NULL,
            file_path     TEXT NOT NULL,
            created_at    INTEGER NOT NULL
        );",
    )?;
    Ok(conn)
}

pub fn insert(conn: &Connection, record: &DownloadRecord) -> Result<()> {
    conn.execute(
        "INSERT INTO downloads (id, url, title, author, thumbnail_url, format, file_path, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            record.id,
            record.url,
            record.title,
            record.author,
            record.thumbnail_url,
            record.format,
            record.file_path,
            record.created_at,
        ],
    )?;
    Ok(())
}

pub fn get_history(conn: &Connection) -> Result<Vec<DownloadRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, url, title, author, thumbnail_url, format, file_path, created_at
         FROM downloads ORDER BY created_at DESC LIMIT 50",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DownloadRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            title: row.get(2)?,
            author: row.get(3)?,
            thumbnail_url: row.get(4)?,
            format: row.get(5)?,
            file_path: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn in_memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS downloads (
                id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL,
                author TEXT, thumbnail_url TEXT, format TEXT NOT NULL,
                file_path TEXT NOT NULL, created_at INTEGER NOT NULL
            );",
        ).unwrap();
        conn
    }

    #[test]
    fn insert_and_retrieve() {
        let conn = in_memory();
        let record = DownloadRecord {
            id: "test-id".to_string(),
            url: "https://youtube.com/watch?v=test".to_string(),
            title: "Test Video".to_string(),
            author: Some("Test Author".to_string()),
            thumbnail_url: None,
            format: "mp4".to_string(),
            file_path: "/tmp/test.mp4".to_string(),
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
        };
        insert(&conn, &record).unwrap();
        let history = get_history(&conn).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].title, "Test Video");
    }
}
