//! The T1 API server: its local config, and its HTTP endpoints.
//!
//! `/health`, `/version` and `/status` need no key (see
//! `hypernix/t1api/routers/health.py`), so the dashboard can say whether
//! a server is up, what it runs and what it protects before anybody has
//! configured a key. Anything else is sent with `Authorization: Bearer`.

use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_millis(2500))
        .timeout(Duration::from_secs(6))
        .user_agent(concat!("hypernix-gui/", env!("CARGO_PKG_VERSION")))
        .build()
}

fn join(base: &str, path: &str) -> String {
    format!("{}/{}", base.trim_end_matches('/'), path.trim_start_matches('/'))
}

fn get_json(base: &str, path: &str, key: Option<&str>) -> Result<Value, String> {
    let mut req = agent().get(&join(base, path));
    if let Some(k) = key.filter(|k| !k.is_empty()) {
        req = req.set("Authorization", &format!("Bearer {k}"));
    }
    match req.call() {
        Ok(resp) => resp.into_json::<Value>().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| v.get("detail").cloned())
                .map(|d| d.as_str().map(str::to_string).unwrap_or_else(|| d.to_string()))
                .unwrap_or(body);
            Err(format!("HTTP {code}: {detail}"))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub online: bool,
    pub latency_ms: Option<u128>,
    pub version: Option<Value>,
    pub status: Option<Value>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn t1_probe(base_url: String) -> Result<Probe, String> {
    let start = Instant::now();
    match get_json(&base_url, "/health", None) {
        Ok(_) => {
            let latency = start.elapsed().as_millis();
            Ok(Probe {
                online: true,
                latency_ms: Some(latency),
                version: get_json(&base_url, "/version", None).ok(),
                status: get_json(&base_url, "/status", None).ok(),
                error: None,
            })
        }
        Err(e) => Ok(Probe {
            online: false,
            latency_ms: None,
            version: None,
            status: None,
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn t1_get(base_url: String, path: String, key: Option<String>) -> Result<Value, String> {
    get_json(&base_url, &path, key.as_deref())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfig {
    pub config_dir: String,
    pub env_file: String,
    pub exists: bool,
    /// KEY=VALUE entries from .env, with secrets masked.
    pub entries: Vec<(String, String)>,
    pub base_url: String,
    pub pid: Option<String>,
    pub log_file: String,
    pub waiter_server: Option<String>,
}

fn is_secret(key: &str) -> bool {
    let k = key.to_ascii_uppercase();
    ["KEY", "SECRET", "TOKEN", "PASSWORD", "PASS", "SALT", "PEPPER"]
        .iter()
        .any(|s| k.contains(s))
}

/// Read `~/.hypernix/t1api/.env` the way `hypernix-t1` does: read, never
/// sourced, `T1_*` and `HYPERNIX_*` keys only, quotes and CR stripped.
#[tauri::command]
pub async fn t1_local_config() -> Result<LocalConfig, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let dir = std::env::var("T1_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home.join(".hypernix").join("t1api"));
    let env_file = dir.join(".env");
    let text = std::fs::read_to_string(&env_file).unwrap_or_default();
    let mut entries = Vec::new();
    let (mut host, mut port) = ("127.0.0.1".to_string(), "8000".to_string());
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else { continue };
        if !(k.starts_with("T1_") || k.starts_with("HYPERNIX_")) {
            continue;
        }
        let v = v.trim_matches('\'').trim_matches('"').to_string();
        match k {
            "T1_HOST" => host = v.clone(),
            "T1_PORT" => port = v.clone(),
            _ => {}
        }
        let shown = if is_secret(k) && !v.is_empty() {
            "••••••••".to_string()
        } else {
            v
        };
        entries.push((k.to_string(), shown));
    }
    // A server bound to every interface is reachable on loopback.
    if host == "0.0.0.0" || host == "::" || host.is_empty() {
        host = "127.0.0.1".into();
    }
    let host_part = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host
    };
    let pid = std::fs::read_to_string(dir.join("server.pid"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    // waiter's saved server, when it is plain JSON (a locked or encrypted
    // config is left alone: it is not ours to unlock).
    let waiter_server = std::fs::read_to_string(home.join(".hypernix/waiter/waiter.config.jsonl"))
        .ok()
        .and_then(|t| {
            t.lines()
                .filter_map(|l| serde_json::from_str::<Value>(l).ok())
                .last()
        })
        .and_then(|v| {
            let server = v.get("server")?.as_str()?.to_string();
            let port = v.get("port").and_then(|p| p.as_u64());
            Some(match port {
                Some(p) if !server.contains("://") && !server.contains(':') => format!("{server}:{p}"),
                _ => server,
            })
        });

    Ok(LocalConfig {
        config_dir: dir.to_string_lossy().into_owned(),
        env_file: env_file.to_string_lossy().into_owned(),
        exists: env_file.exists(),
        entries,
        base_url: format!("http://{host_part}:{port}"),
        pid,
        log_file: dir.join("server.log").to_string_lossy().into_owned(),
        waiter_server,
    })
}
