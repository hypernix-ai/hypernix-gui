//! Jobs: HyperNix commands running in pseudo-terminals.
//!
//! Every command gets a real PTY rather than a pipe. HyperNix's output is
//! written for a terminal (Rich tables, tqdm bars, the curses `waiter tui`,
//! OpenTUI's `tvtop-max` and `hyped-pro`), and a pipe makes most of it
//! either plain or broken. The frontend draws the stream with xterm.js.

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::env::{self, is_sandboxed};
use crate::AppState;

struct Job {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    pid: Option<u32>,
}

#[derive(Default)]
pub struct Jobs {
    inner: Mutex<HashMap<String, Job>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStart {
    pub id: String,
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStarted {
    pub argv: Vec<String>,
    pub pid: Option<u32>,
}

#[derive(Clone, Serialize)]
struct OutputEvent<'a> {
    id: &'a str,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    id: String,
    code: Option<u32>,
    success: bool,
}

fn command_for(argv: &[String], env: &[(String, String)], cwd: &str) -> CommandBuilder {
    if is_sandboxed() {
        let mut cmd = CommandBuilder::new("flatpak-spawn");
        cmd.arg("--host");
        cmd.arg("--watch-bus");
        for (k, v) in env {
            cmd.arg(format!("--env={k}={v}"));
        }
        cmd.arg(format!("--directory={cwd}"));
        for a in argv {
            cmd.arg(a);
        }
        cmd
    } else {
        let mut cmd = CommandBuilder::new(&argv[0]);
        for a in &argv[1..] {
            cmd.arg(a);
        }
        for (k, v) in env {
            cmd.env(k, v);
        }
        cmd.cwd(cwd);
        cmd
    }
}

#[tauri::command]
pub async fn job_start(
    app: AppHandle,
    state: State<'_, AppState>,
    req: JobStart,
) -> Result<JobStarted, String> {
    let host = env::current(&state, None);
    let mut argv = host.resolve(&req.program)?;
    argv.extend(req.args.iter().cloned());

    let mut job_env = host.job_env();
    job_env.extend(req.env.iter().cloned());
    let cwd = req
        .cwd
        .clone()
        .filter(|c| !c.trim().is_empty())
        .unwrap_or_else(|| host.home.clone());

    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: req.rows.unwrap_or(30),
            cols: req.cols.unwrap_or(110),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("could not open a terminal: {e}"))?;
    let mut child = pair
        .slave
        .spawn_command(command_for(&argv, &job_env, &cwd))
        .map_err(|e| format!("could not start {}: {e}", argv[0]))?;
    // The slave end belongs to the child now. Holding it here would keep
    // the reader from ever seeing end-of-file.
    drop(pair.slave);

    let pid = child.process_id();
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let killer = child.clone_killer();

    state.jobs.inner.lock().unwrap().insert(
        req.id.clone(),
        Job {
            writer,
            master: pair.master,
            killer,
            pid,
        },
    );

    let (done_tx, done_rx) = mpsc::channel::<()>();
    let id = req.id.clone();
    let app_out = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    // Emit only whole UTF-8 sequences; a box-drawing
                    // character split across two reads would otherwise
                    // arrive as two replacement characters.
                    let valid = match std::str::from_utf8(&pending) {
                        Ok(_) => pending.len(),
                        Err(e) if e.error_len().is_none() => e.valid_up_to(),
                        Err(_) => pending.len(),
                    };
                    if valid == 0 {
                        continue;
                    }
                    let data = String::from_utf8_lossy(&pending[..valid]).into_owned();
                    pending.drain(..valid);
                    let _ = app_out.emit("job-output", OutputEvent { id: &id, data });
                }
            }
        }
        let _ = done_tx.send(());
    });

    let id = req.id.clone();
    let app_exit = app.clone();
    std::thread::spawn(move || {
        let status = child.wait();
        // Let the reader drain what the process wrote before it exited.
        let _ = done_rx.recv_timeout(Duration::from_secs(2));
        let (code, success) = match status {
            Ok(s) => (Some(s.exit_code()), s.success()),
            Err(_) => (None, false),
        };
        let state = app_exit.state::<AppState>();
        state.jobs.inner.lock().unwrap().remove(&id);
        let _ = app_exit.emit("job-exit", ExitEvent { id, code, success });
    });

    Ok(JobStarted { argv, pid })
}

#[tauri::command]
pub fn job_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    let mut jobs = state.jobs.inner.lock().unwrap();
    let job = jobs.get_mut(&id).ok_or("that job has finished")?;
    job.writer
        .write_all(data.as_bytes())
        .and_then(|_| job.writer.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn job_resize(state: State<'_, AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let jobs = state.jobs.inner.lock().unwrap();
    if let Some(job) = jobs.get(&id) {
        job.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Signal a job. The PTY made the child a session leader, so its process
/// group is its pid, and signalling the group reaches the Python it
/// started as well (and, in a Flatpak, `flatpak-spawn` relays it to the
/// host process).
#[tauri::command]
pub fn job_signal(state: State<'_, AppState>, id: String, signal: String) -> Result<(), String> {
    let mut jobs = state.jobs.inner.lock().unwrap();
    let job = jobs.get_mut(&id).ok_or("that job has finished")?;
    let sig = match signal.as_str() {
        "int" => libc::SIGINT,
        "term" => libc::SIGTERM,
        "hup" => libc::SIGHUP,
        "kill" => libc::SIGKILL,
        other => return Err(format!("unknown signal {other}")),
    };
    if let Some(pid) = job.pid {
        let pid = pid as libc::pid_t;
        // SAFETY: kill(2) with a pid we started; failure is reported, not UB.
        let rc = unsafe { libc::kill(-pid, sig) };
        if rc == 0 {
            return Ok(());
        }
        let rc = unsafe { libc::kill(pid, sig) };
        if rc == 0 {
            return Ok(());
        }
    }
    if sig == libc::SIGKILL || sig == libc::SIGTERM {
        return job.killer.kill().map_err(|e| e.to_string());
    }
    Err("could not signal the process".into())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Captured {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Run a short command without a terminal and return what it printed:
/// for `--json` output the interface parses (devices, status, versions).
#[tauri::command]
pub async fn run_capture(
    state: State<'_, AppState>,
    program: String,
    args: Vec<String>,
    timeout_secs: Option<u64>,
) -> Result<Captured, String> {
    let host = env::current(&state, None);
    let mut argv = host.resolve(&program)?;
    argv.extend(args);
    let mut job_env = host.job_env();
    job_env.retain(|(k, _)| k != "TERM" && k != "COLORTERM");
    job_env.push(("NO_COLOR".into(), "1".into()));
    job_env.push(("TERM".into(), "dumb".into()));
    let (code, stdout, stderr) = env::host_output(
        &argv,
        &job_env,
        Some(&host.home),
        Duration::from_secs(timeout_secs.unwrap_or(60)),
    )?;
    Ok(Captured { code, stdout, stderr })
}
