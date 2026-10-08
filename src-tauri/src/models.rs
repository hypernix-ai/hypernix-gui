//! The model library: GGUF files and Hugging Face style snapshots on disk.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub path: String,
    pub name: String,
    /// "gguf", "snapshot" (config.json + weights) or "checkpoint" (.pt).
    pub kind: String,
    pub size: u64,
    pub modified: u64,
    pub root: String,
}

const MAX_ENTRIES: usize = 2000;
const MAX_DEPTH: usize = 5;

fn expand(dir: &str, home: &Path) -> PathBuf {
    if let Some(rest) = dir.strip_prefix("~/") {
        home.join(rest)
    } else if dir == "~" {
        home.to_path_buf()
    } else {
        PathBuf::from(dir)
    }
}

fn modified(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn walk(dir: &Path, root: &str, depth: usize, out: &mut Vec<ModelEntry>) {
    if depth > MAX_DEPTH || out.len() >= MAX_ENTRIES {
        return;
    }
    let Ok(read) = std::fs::read_dir(dir) else { return };
    let mut children: Vec<PathBuf> = read.filter_map(|e| e.ok().map(|e| e.path())).collect();
    children.sort();

    // A folder with config.json and weights is one model, not many files.
    let has_config = children.iter().any(|p| p.file_name().is_some_and(|n| n == "config.json"));
    let weights: Vec<&PathBuf> = children
        .iter()
        .filter(|p| {
            p.extension()
                .is_some_and(|e| e == "safetensors" || e == "bin")
        })
        .collect();
    if has_config && !weights.is_empty() {
        let size = weights
            .iter()
            .filter_map(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
            .sum();
        let meta = std::fs::metadata(dir).ok();
        out.push(ModelEntry {
            path: dir.to_string_lossy().into_owned(),
            name: dir
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            kind: "snapshot".into(),
            size,
            modified: meta.as_ref().map(modified).unwrap_or(0),
            root: root.to_string(),
        });
    }

    for p in children {
        if out.len() >= MAX_ENTRIES {
            return;
        }
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if name.starts_with('.') || name == "node_modules" || name == "__pycache__" {
            continue;
        }
        let Ok(meta) = std::fs::metadata(&p) else { continue };
        if meta.is_dir() {
            walk(&p, root, depth + 1, out);
            continue;
        }
        let kind = match p.extension().and_then(|e| e.to_str()) {
            Some("gguf") => "gguf",
            Some("pt") if !has_config => "checkpoint",
            _ => continue,
        };
        out.push(ModelEntry {
            path: p.to_string_lossy().into_owned(),
            name,
            kind: kind.into(),
            size: meta.len(),
            modified: modified(&meta),
            root: root.to_string(),
        });
    }
}

#[tauri::command]
pub async fn scan_models(dirs: Vec<String>) -> Result<Vec<ModelEntry>, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for d in dirs {
        let path = expand(d.trim(), &home);
        let key = std::fs::canonicalize(&path).unwrap_or(path.clone());
        if !seen.insert(key) {
            continue;
        }
        walk(&path, &d, 0, &mut out);
    }
    Ok(out)
}
