//! CPU and memory for the dashboard's gauges.

use serde::Serialize;
use sysinfo::System;
use tauri::State;

use crate::AppState;

pub struct Sampler {
    sys: System,
}

impl Sampler {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        Self { sys }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub cpu: f32,
    pub cores: Vec<f32>,
    pub cpu_brand: String,
    pub mem_used: u64,
    pub mem_total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
    pub load: [f64; 3],
    pub uptime: u64,
    pub host: String,
    pub os: String,
    pub kernel: String,
}

#[tauri::command]
pub async fn sys_snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let mut guard = state.sys.lock().unwrap();
    let sys = &mut guard.sys;
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let load = System::load_average();
    Ok(Snapshot {
        cpu: sys.global_cpu_usage(),
        cores: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
        cpu_brand: sys
            .cpus()
            .first()
            .map(|c| c.brand().trim().to_string())
            .unwrap_or_default(),
        mem_used: sys.used_memory(),
        mem_total: sys.total_memory(),
        swap_used: sys.used_swap(),
        swap_total: sys.total_swap(),
        load: [load.one, load.five, load.fifteen],
        uptime: System::uptime(),
        host: System::host_name().unwrap_or_default(),
        os: System::long_os_version().unwrap_or_default(),
        kernel: System::kernel_version().unwrap_or_default(),
    })
}
