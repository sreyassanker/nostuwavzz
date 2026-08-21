use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
#[cfg(not(mobile))]
use tokio::time::interval;
use tokio::time::sleep;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Station {
    pub stationuuid: String,
    pub name: String,
    pub url: String,
    pub url_resolved: Option<String>,
    pub homepage: Option<String>,
    pub favicon: Option<String>,
    pub tags: Option<String>,
    pub country: Option<String>,
    pub countrycode: Option<String>,
    pub state: Option<String>,
    pub language: Option<String>,
    pub languagecodes: Option<String>,
    pub votes: Option<i64>,
    pub clickcount: Option<i64>,
    pub bitrate: Option<i64>,
    pub codec: Option<String>,
    pub lastcheckok: Option<i64>,
    pub lastchecktime: Option<String>,
    pub clicktimestamp: Option<String>,
    pub geo_lat: Option<f64>,
    pub geo_long: Option<f64>,
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeoCluster {
    pub lat: f64,
    pub lng: f64,
    pub count: i64,
    pub stations: Vec<Station>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncProgress {
    pub fetched: usize,
    pub total: Option<usize>,
    pub phase: String,
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
        .map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS stations (
            stationuuid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            url_resolved TEXT,
            homepage TEXT,
            favicon TEXT,
            tags TEXT,
            country TEXT,
            countrycode TEXT,
            state TEXT,
            language TEXT,
            languagecodes TEXT,
            votes INTEGER DEFAULT 0,
            clickcount INTEGER DEFAULT 0,
            bitrate INTEGER DEFAULT 0,
            codec TEXT,
            lastcheckok INTEGER DEFAULT 1,
            lastchecktime TEXT,
            clicktimestamp TEXT,
            geo_lat REAL,
            geo_long REAL,
            source TEXT DEFAULT 'radio-browser',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_country ON stations(countrycode);
        CREATE INDEX IF NOT EXISTS idx_language ON stations(languagecodes);
        CREATE INDEX IF NOT EXISTS idx_codec ON stations(codec);
        CREATE INDEX IF NOT EXISTS idx_lastcheckok ON stations(lastcheckok);
        CREATE INDEX IF NOT EXISTS idx_geo ON stations(geo_lat, geo_long);
        CREATE INDEX IF NOT EXISTS idx_clickcount ON stations(clickcount DESC);

        CREATE TABLE IF NOT EXISTS favorites (
            stationuuid TEXT PRIMARY KEY REFERENCES stations(stationuuid),
            added_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sync_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );"
    ).map_err(|e| e.to_string())?;

    let has_fts: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='stations_fts'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_fts {
        conn.execute_batch(
            "CREATE VIRTUAL TABLE stations_fts USING fts5(
                name, tags, country, state, language,
                content='stations',
                content_rowid='rowid'
            );
            INSERT INTO stations_fts(stations_fts) VALUES('rebuild');"
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn init_sync_db(_app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().await;
    init_db(&db)?;

    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM stations", [], |row| row.get(0))
        .unwrap_or(0);

    let last_sync: Option<String> = db
        .query_row(
            "SELECT value FROM sync_meta WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(serde_json::json!({
        "station_count": count,
        "last_sync": last_sync,
    })
    .to_string())
}

#[tauri::command]
async fn sync_all_stations(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("NostuWavzz/3.0 (Tauri; +https://github.com/sreyassanker/nostuwavzz)")
        .build()
        .map_err(|e| e.to_string())?;

    let mut all_stations: Vec<Station> = Vec::with_capacity(50_000);
    let batch_size = 1000;
    let max_stations = 50_000;
    let max_consecutive_failures = 6;
    let mut offset = 0;
    let mut failures = 0;

    let mirrors = [
        "https://de1.api.radio-browser.info",
        "https://nl1.api.radio-browser.info",
        "https://fr1.api.radio-browser.info",
        "https://at1.api.radio-browser.info",
    ];

    app.emit("sync-progress", SyncProgress {
        fetched: 0,
        total: None,
        phase: "starting".into(),
    })
    .ok();

    loop {
        let mirror = mirrors[(offset / batch_size) % mirrors.len()];
        let url = format!(
            "{}/json/stations?limit={}&offset={}&hidebroken=true&order=clickcount&reverse=true",
            mirror, batch_size, offset
        );

        match client.get(&url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    failures += 1;
                    if failures >= max_consecutive_failures {
                        break;
                    }
                    sleep(Duration::from_secs(2)).await;
                    continue;
                }
                match resp.json::<Vec<Station>>().await {
                    Ok(batch) => {
                        if batch.is_empty() {
                            break;
                        }
                        let filtered: Vec<Station> = batch
                            .into_iter()
                            .filter(|s| {
                                s.url_resolved.as_deref().map_or(false, |u| {
                                    u.starts_with("https://")
                                }) && !s.name.trim().is_empty()
                                    && s.codec.as_deref() != Some("UNKNOWN")
                            })
                            .collect();

                        all_stations.extend(filtered);
                        offset += batch_size;
                        failures = 0;

                        app.emit("sync-progress", SyncProgress {
                            fetched: all_stations.len(),
                            total: Some(max_stations),
                            phase: "fetching".into(),
                        })
                        .ok();

                        if all_stations.len() >= max_stations {
                            break;
                        }

                        sleep(Duration::from_millis(300)).await;
                    }
                    Err(e) => {
                        eprintln!("JSON parse error at offset {}: {}", offset, e);
                        failures += 1;
                        if failures >= max_consecutive_failures {
                            break;
                        }
                        sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                }
            }
            Err(e) => {
                eprintln!("Fetch error at offset {}: {}", offset, e);
                failures += 1;
                if failures >= max_consecutive_failures {
                    break;
                }
                sleep(Duration::from_secs(3)).await;
                continue;
            }
        }
    }

    app.emit("sync-progress", SyncProgress {
        fetched: all_stations.len(),
        total: Some(all_stations.len()),
        phase: "writing".into(),
    })
    .ok();

    let mut db = state.db.lock().await;

    let tx = db.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM stations WHERE source = 'radio-browser'", [])
        .map_err(|e| e.to_string())?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO stations
                (stationuuid, name, url, url_resolved, homepage, favicon, tags,
                 country, countrycode, state, language, languagecodes, votes,
                 clickcount, bitrate, codec, lastcheckok, lastchecktime,
                 clicktimestamp, geo_lat, geo_long, source)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                        ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, 'radio-browser')",
            )
            .map_err(|e| e.to_string())?;

        for s in &all_stations {
            stmt.execute(params![
                s.stationuuid,
                s.name,
                s.url,
                s.url_resolved,
                s.homepage,
                s.favicon,
                s.tags,
                s.country,
                s.countrycode,
                s.state,
                s.language,
                s.languagecodes,
                s.votes,
                s.clickcount,
                s.bitrate,
                s.codec,
                s.lastcheckok,
                s.lastchecktime,
                s.clicktimestamp,
                s.geo_lat,
                s.geo_long,
            ]).map_err(|e| format!("Failed to insert station {}: {}", s.stationuuid, e))?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    let _ = db.execute(
        "INSERT INTO stations_fts(stations_fts) VALUES('rebuild')",
        [],
    );

    db.execute(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', ?1)",
        params![Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()],
    )
    .map_err(|e| e.to_string())?;

    let count = all_stations.len();

    app.emit("sync-progress", SyncProgress {
        fetched: count,
        total: Some(count),
        phase: "done".into(),
    })
    .ok();

    Ok(format!("Synced {} stations", count))
}

#[tauri::command]
async fn search_stations(
    state: State<'_, AppState>,
    query: String,
    country: Option<String>,
    language: Option<String>,
    tags: Option<String>,
    limit: i64,
    offset: i64,
) -> Result<Vec<Station>, String> {
    let db = state.db.lock().await;

    let mut sql = String::from(
        "SELECT s.stationuuid, s.name, s.url, s.url_resolved, s.homepage,
                s.favicon, s.tags, s.country, s.countrycode, s.state, s.language,
                s.languagecodes, s.votes, s.clickcount, s.bitrate, s.codec,
                s.lastcheckok, s.lastchecktime, s.clicktimestamp,
                s.geo_lat, s.geo_long, s.source
         FROM stations s"
    );

    let mut conditions: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 0;

    if !query.is_empty() && query != "*" {
        param_idx += 1;
        let idx = param_idx;
        conditions.push(format!(
            "EXISTS (SELECT 1 FROM stations_fts fts WHERE s.rowid = fts.rowid AND fts.stations_fts MATCH ?{})",
            idx
        ));
        let tokens: Vec<String> = query
            .split_whitespace()
            .map(|w| {
                w.chars()
                    .filter(|c| c.is_alphanumeric() || ['-'].contains(c))
                    .collect::<String>()
            })
            .filter(|w| !w.is_empty())
            .map(|w| format!("{}*", w))
            .collect();
        if tokens.is_empty() {
            return Ok(Vec::new());
        }
        param_values.push(Box::new(tokens.join(" ")));
    }

    if let Some(ref c) = country {
        if !c.is_empty() && c != "All" {
            param_idx += 1;
            let idx = param_idx;
            conditions.push(format!("s.countrycode = ?{}", idx));
            param_values.push(Box::new(c.clone()));
        }
    }

    if let Some(ref l) = language {
        if !l.is_empty() {
            param_idx += 1;
            let idx = param_idx;
            conditions.push(format!("s.languagecodes LIKE ?{}", idx));
            param_values.push(Box::new(format!("%{}%", l)));
        }
    }

    if let Some(ref t) = tags {
        if !t.is_empty() && t != "All" {
            param_idx += 1;
            let idx = param_idx;
            conditions.push(format!("s.tags LIKE ?{} COLLATE NOCASE", idx));
            param_values.push(Box::new(format!("%{}%", t)));
        }
    }

    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }

    param_idx += 1;
    let lim_idx = param_idx;
    param_idx += 1;
    let off_idx = param_idx;
    sql.push_str(&format!(
        " ORDER BY s.clickcount DESC LIMIT ?{} OFFSET ?{}",
        lim_idx, off_idx
    ));
    param_values.push(Box::new(limit));
    param_values.push(Box::new(offset));

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let stations = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(Station {
                stationuuid: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                url_resolved: row.get(3)?,
                homepage: row.get(4)?,
                favicon: row.get(5)?,
                tags: row.get(6)?,
                country: row.get(7)?,
                countrycode: row.get(8)?,
                state: row.get(9)?,
                language: row.get(10)?,
                languagecodes: row.get(11)?,
                votes: row.get(12)?,
                clickcount: row.get(13)?,
                bitrate: row.get(14)?,
                codec: row.get(15)?,
                lastcheckok: row.get(16)?,
                lastchecktime: row.get(17)?,
                clicktimestamp: row.get(18)?,
                geo_lat: row.get(19)?,
                geo_long: row.get(20)?,
                source: row.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(stations)
}

#[tauri::command]
async fn get_geolocated_stations(
    state: State<'_, AppState>,
) -> Result<Vec<Station>, String> {
    let db = state.db.lock().await;

    let mut stmt = db
        .prepare(
            "SELECT stationuuid, name, url, url_resolved, homepage, favicon, tags,
                    country, countrycode, state, language, languagecodes, votes,
                    clickcount, bitrate, codec, lastcheckok, lastchecktime,
                    clicktimestamp, geo_lat, geo_long, source
             FROM stations
             WHERE geo_lat IS NOT NULL AND geo_long IS NOT NULL
               AND geo_lat != 0 AND geo_long != 0
               AND lastcheckok = 1
             ORDER BY clickcount DESC",
        )
        .map_err(|e| e.to_string())?;

    let stations = stmt
        .query_map([], |row| {
            Ok(Station {
                stationuuid: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                url_resolved: row.get(3)?,
                homepage: row.get(4)?,
                favicon: row.get(5)?,
                tags: row.get(6)?,
                country: row.get(7)?,
                countrycode: row.get(8)?,
                state: row.get(9)?,
                language: row.get(10)?,
                languagecodes: row.get(11)?,
                votes: row.get(12)?,
                clickcount: row.get(13)?,
                bitrate: row.get(14)?,
                codec: row.get(15)?,
                lastcheckok: row.get(16)?,
                lastchecktime: row.get(17)?,
                clicktimestamp: row.get(18)?,
                geo_lat: row.get(19)?,
                geo_long: row.get(20)?,
                source: row.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(stations)
}

#[tauri::command]
async fn get_station_by_uuid(
    state: State<'_, AppState>,
    stationuuid: String,
) -> Result<Option<Station>, String> {
    let db = state.db.lock().await;

    let mut stmt = db
        .prepare(
            "SELECT stationuuid, name, url, url_resolved, homepage, favicon, tags,
                    country, countrycode, state, language, languagecodes, votes,
                    clickcount, bitrate, codec, lastcheckok, lastchecktime,
                    clicktimestamp, geo_lat, geo_long, source
             FROM stations WHERE stationuuid = ?1",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map(params![stationuuid], |row| {
            Ok(Station {
                stationuuid: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                url_resolved: row.get(3)?,
                homepage: row.get(4)?,
                favicon: row.get(5)?,
                tags: row.get(6)?,
                country: row.get(7)?,
                countrycode: row.get(8)?,
                state: row.get(9)?,
                language: row.get(10)?,
                languagecodes: row.get(11)?,
                votes: row.get(12)?,
                clickcount: row.get(13)?,
                bitrate: row.get(14)?,
                codec: row.get(15)?,
                lastcheckok: row.get(16)?,
                lastchecktime: row.get(17)?,
                clicktimestamp: row.get(18)?,
                geo_lat: row.get(19)?,
                geo_long: row.get(20)?,
                source: row.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(Ok(s)) => Ok(Some(s)),
        _ => Ok(None),
    }
}

#[tauri::command]
async fn get_stations_count(state: State<'_, AppState>) -> Result<i64, String> {
    let db = state.db.lock().await;
    db.query_row("SELECT COUNT(*) FROM stations", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_distinct_values(
    state: State<'_, AppState>,
    column: String,
    limit: i64,
) -> Result<Vec<String>, String> {
    let allowed = ["countrycode", "tags", "language", "codec", "country", "state"];
    if !allowed.contains(&column.as_str()) {
        return Err(format!("Invalid column: {}", column));
    }
    let db = state.db.lock().await;
    let sql = format!(
        "SELECT DISTINCT {} FROM stations WHERE {} IS NOT NULL AND {} != '' ORDER BY {} LIMIT ?1",
        column, column, column, column
    );
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let values = stmt
        .query_map(params![limit], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(values)
}

#[tauri::command]
async fn toggle_favorite(
    state: State<'_, AppState>,
    stationuuid: String,
) -> Result<bool, String> {
    let db = state.db.lock().await;
    let exists: bool = db
        .query_row(
            "SELECT COUNT(*) FROM favorites WHERE stationuuid = ?1",
            params![stationuuid],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if exists {
        db.execute(
            "DELETE FROM favorites WHERE stationuuid = ?1",
            params![stationuuid],
        )
        .map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        db.execute(
            "INSERT OR IGNORE INTO favorites (stationuuid, added_at) VALUES (?1, datetime('now'))",
            params![stationuuid],
        )
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
async fn get_favorites(
    state: State<'_, AppState>,
    limit: i64,
    offset: i64,
) -> Result<Vec<Station>, String> {
    let db = state.db.lock().await;

    let mut stmt = db
        .prepare(
            "SELECT s.stationuuid, s.name, s.url, s.url_resolved, s.homepage,
                    s.favicon, s.tags, s.country, s.countrycode, s.state, s.language,
                    s.languagecodes, s.votes, s.clickcount, s.bitrate, s.codec,
                    s.lastcheckok, s.lastchecktime, s.clicktimestamp,
                    s.geo_lat, s.geo_long, s.source
             FROM stations s
             INNER JOIN favorites f ON s.stationuuid = f.stationuuid
             ORDER BY f.added_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let stations = stmt
        .query_map(params![limit, offset], |row| {
            Ok(Station {
                stationuuid: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                url_resolved: row.get(3)?,
                homepage: row.get(4)?,
                favicon: row.get(5)?,
                tags: row.get(6)?,
                country: row.get(7)?,
                countrycode: row.get(8)?,
                state: row.get(9)?,
                language: row.get(10)?,
                languagecodes: row.get(11)?,
                votes: row.get(12)?,
                clickcount: row.get(13)?,
                bitrate: row.get(14)?,
                codec: row.get(15)?,
                lastcheckok: row.get(16)?,
                lastchecktime: row.get(17)?,
                clicktimestamp: row.get(18)?,
                geo_lat: row.get(19)?,
                geo_long: row.get(20)?,
                source: row.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(stations)
}

#[tauri::command]
async fn fetch_image(url: String) -> Result<serde_json::Value, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("unsupported scheme".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(5))
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        )
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("http {}", resp.status().as_u16()));
    }

    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Err("empty body".into());
    }
    if bytes.len() > 512 * 1024 {
        return Err("too large".into());
    }

    Ok(serde_json::json!({
        "mime": mime,
        "data": b64_encode(&bytes),
    }))
}

const B64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64_ALPHABET[(n >> 18 & 63) as usize] as char);
        out.push(B64_ALPHABET[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            B64_ALPHABET[(n >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            B64_ALPHABET[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[tauri::command]
async fn set_last_played(
    state: State<'_, AppState>,
    stationuuid: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_played', ?1)",
        params![stationuuid],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_last_played(state: State<'_, AppState>) -> Result<Option<Station>, String> {
    let db = state.db.lock().await;
    let uuid: Option<String> = db
        .query_row(
            "SELECT value FROM sync_meta WHERE key = 'last_played'",
            [],
            |row| row.get(0),
        )
        .ok();

    match uuid {
        Some(uid) => {
            drop(db);
            get_station_by_uuid(state, uid).await
        }
        None => Ok(None),
    }
}

#[cfg(not(mobile))]
fn setup_background_sync(app: AppHandle) {    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(Duration::from_secs(86400));
        loop {
            ticker.tick().await;
            handle.emit("sync-started", true).ok();
            let db_state = handle.state::<AppState>();
            let db = db_state.db.lock().await;
            let last_sync: Option<String> = db
                .query_row(
                    "SELECT value FROM sync_meta WHERE key = 'last_sync'",
                    [],
                    |row| row.get(0),
                )
                .ok();

            let should_sync = match last_sync {
                None => true,
                Some(date_str) => {
                    if let Ok(parsed) =
                        chrono::NaiveDateTime::parse_from_str(&date_str, "%Y-%m-%d %H:%M:%S")
                    {
                        let elapsed = Utc::now().naive_utc() - parsed;
                        elapsed.num_hours() >= 23
                    } else {
                        true
                    }
                }
            };
            drop(db);

            if should_sync {
                let result = sync_all_stations(handle.clone(), db_state).await;
                match result {
                    Ok(msg) => {
                        handle.emit("sync-completed", msg).ok();
                    }
                    Err(e) => {
                        eprintln!("Background sync failed: {}", e);
                        handle.emit("sync-error", e).ok();
                    }
                }
            }
        }
    });
}

fn open_database(path: &std::path::Path) -> Connection {
    let conn = match Connection::open(path) {
        Ok(c) => c,
        Err(e) => panic!("failed to open database: {}", e),
    };
    match init_db(&conn) {
        Ok(()) => return conn,
        Err(e) => eprintln!("database init failed ({}); rebuilding catalog", e),
    }

    for suffix in ["", "-wal", "-shm", "-journal"] {
        let name = format!("nostu_wavzz.db{}", suffix);
        let _ = std::fs::remove_file(path.with_file_name(name));
    }

    let conn = Connection::open(path).expect("failed to re-open database after recovery");
    init_db(&conn).expect("failed to re-initialize database after recovery");
    conn
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_media_session::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
            let db_path = app_dir.join("nostu_wavzz.db");

            let conn = open_database(&db_path);

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
            });

            #[cfg(not(mobile))]
            setup_background_sync(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_sync_db,
            sync_all_stations,
            search_stations,
            get_geolocated_stations,
            get_station_by_uuid,
            get_stations_count,
            get_distinct_values,
            toggle_favorite,
            get_favorites,
            fetch_image,
            set_last_played,
            get_last_played,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
