//! HyperNix Control: the Rust half.
//!
//! The app never re-implements a HyperNix feature. Every control in the
//! interface ends up as one of the console scripts `pip install hypernix`
//! puts on the machine (`hypernix`, `hypernix-t1`, `waiter`, `gkey`, ...),
//! run in a pseudo-terminal so Rich colour, progress bars and the curses
//! and OpenTUI dashboards all render the way they do in a real terminal.
//!
//! What lives here is the plumbing that a web view cannot do on its own:
//! finding the Python that has HyperNix, spawning and signalling jobs
//! (through `flatpak-spawn --host` when sandboxed), reading the T1
//! server's local config, probing its HTTP endpoints, and sampling CPU and
//! memory for the dashboard.

mod env;
mod jobs;
mod models;
mod secrets;
mod sys;
mod t1;
mod terminal;

use std::sync::Mutex;

pub struct AppState {
    pub env: Mutex<Option<env::HostEnv>>,
    pub jobs: jobs::Jobs,
    pub sys: Mutex<sys::Sampler>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            env: Mutex::new(None),
            jobs: jobs::Jobs::default(),
            sys: Mutex::new(sys::Sampler::new()),
        })
        .invoke_handler(tauri::generate_handler![
            env::env_detect,
            env::env_resolve,
            jobs::job_start,
            jobs::job_write,
            jobs::job_resize,
            jobs::job_signal,
            jobs::run_capture,
            terminal::open_in_terminal,
            t1::t1_probe,
            t1::t1_get,
            t1::t1_local_config,
            sys::sys_snapshot,
            models::scan_models,
            secrets::secret_get,
            secrets::secret_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HyperNix Control");
}
