//! Secrets the interface remembers (a T1 key, a Hugging Face token).
//!
//! Kept out of the web view's localStorage, in a file only this user can
//! read. This is not a keychain; it is the same protection `~/.netrc` and
//! `~/.cache/huggingface/token` get, which is what HyperNix itself relies on.

use serde_json::{Map, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("secrets.json"))
}

fn load(app: &AppHandle) -> Map<String, Value> {
    store_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

#[tauri::command]
pub fn secret_get(app: AppHandle, name: String) -> Option<String> {
    load(&app).get(&name).and_then(|v| v.as_str()).map(str::to_string)
}

#[tauri::command]
pub fn secret_set(app: AppHandle, name: String, value: Option<String>) -> Result<(), String> {
    let mut map = load(&app);
    match value.filter(|v| !v.is_empty()) {
        Some(v) => {
            map.insert(name, Value::String(v));
        }
        None => {
            map.remove(&name);
        }
    }
    let path = store_path(&app)?;
    let text = serde_json::to_string_pretty(&Value::Object(map)).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    {
        use std::io::Write;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&tmp).map_err(|e| e.to_string())?;
        f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
