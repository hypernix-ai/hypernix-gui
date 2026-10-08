//! Finding HyperNix on the machine.
//!
//! A desktop app does not inherit the PATH a terminal has: on macOS a
//! Finder-launched app gets `/usr/bin:/bin:/usr/sbin:/sbin`, and inside a
//! Flatpak the sandbox's own `/usr` is not the host's at all. So the PATH
//! is read from the user's login shell once, extended with the places pip
//! and the T1 installer put things, and every lookup after that happens on
//! the host through one small POSIX script.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::State;

use crate::AppState;

/// Console scripts the interface can run, and the `module:function` each
/// one is installed as. The function form is the fallback for an install
/// whose scripts are not on PATH: the interpreter that has HyperNix can
/// always run the entry point directly.
pub const PROGRAMS: &[(&str, &str, &str)] = &[
    ("hypernix", "hypernix", ""),
    ("waiter", "hypernix.waiter.cli", "main"),
    ("gkey", "hypernix.security.gkey_cli", "main"),
    ("hyprslug", "hypernix.quant.hyprslug_cli", "cli_main"),
    ("steamroller", "hypernix.quant.steamroller_cli", "cli_main"),
    ("dflash1", "hypernix.quant.dflash1_cli", "cli_main"),
    ("dflash2", "hypernix.quant.dflash2_cli", "cli_main"),
    ("hnx-bundle", "hypernix.quant.multiquant_cli", "cli_main"),
    ("hnx-imatrix", "hypernix.quant.imatrix_cli", "cli_main"),
    ("hyprslug-headers", "hypernix.quant.hyprslug_headers_cli", "cli_main"),
    ("multilama", "hypernix.models.multilama", "cli_main"),
    ("noodle", "hypernix.interfaces.noodle.cli", "cli_main"),
    ("hnx-scriptgen", "hypernix.scriptgen.cli", "cli_main"),
    ("t1-accounts", "hypernix.t1api.accounts_cli", "cli_main"),
    ("hypernix-sync", "hypernix.t1api.modelsync_cli", "cli_main"),
    ("tvtop-max", "hypernix.monitoring.tvtop_max", "cli_main"),
    ("tvtoppro", "hypernix.monitoring.tvtoppro", "cli_main"),
    ("cctvtop", "hypernix.monitoring.cctvtop", "cli_main"),
    ("hnx-map", "hypernix.monitoring.map", "cli_main"),
    ("hyped", "hypernix.interfaces.hyped_basic", "cli_main"),
    ("hyped-agent", "hypernix.interfaces.hyped", "cli_main"),
    ("hyped-pro", "hypernix.interfaces.hyped_pro_otui", "cli_main"),
    ("hyped-plus", "hypernix.interfaces.hyped_pro", "cli_main"),
    ("hyped-pro-gui", "hypernix.interfaces.hyped_pro_gui", "cli_main"),
    ("eth", "hypernix.system.ethanol", "cli_main"),
    ("ups", "hypernix.system.ups", "cli_main"),
    // A bash script (pip's script-files), so it has no Python entry point.
    ("hypernix-t1", "", ""),
];

/// Terminal emulators, in the order they are tried, for "open in terminal".
pub const TERMINALS: &[&str] = &[
    "x-terminal-emulator",
    "ptyxis",
    "kgx",
    "gnome-terminal",
    "konsole",
    "xfce4-terminal",
    "kitty",
    "alacritty",
    "foot",
    "wezterm",
    "xterm",
];

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvSettings {
    /// A Python interpreter to use instead of the detected one.
    pub python: Option<String>,
    /// A folder holding the HyperNix console scripts.
    pub bin_dir: Option<String>,
    /// More PATH entries, colon-separated.
    pub extra_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonInfo {
    pub executable: String,
    pub version: String,
    /// The installed hypernix version, empty when it has none.
    pub hypernix: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEnv {
    pub sandboxed: bool,
    pub os: String,
    pub arch: String,
    pub home: String,
    pub path: String,
    pub shell: String,
    pub pythons: Vec<PythonInfo>,
    /// The interpreter commands run with when a script is not on PATH.
    pub python: Option<PythonInfo>,
    /// Console scripts found on PATH: name -> absolute path.
    pub bins: BTreeMap<String, String>,
    /// `hypernix-t1` beside the chosen interpreter, when it is not on PATH.
    pub t1_script: Option<String>,
    pub terminals: Vec<String>,
    pub python_forced: bool,
}

impl HostEnv {
    /// The argv prefix that runs `name`, or an explanation of why it cannot.
    pub fn resolve(&self, name: &str) -> Result<Vec<String>, String> {
        if name == "python" {
            return self
                .python
                .as_ref()
                .map(|p| vec![p.executable.clone()])
                .ok_or_else(|| "No Python 3.12+ interpreter was found. Set one in Settings.".into());
        }
        if name == "sh" {
            return Ok(vec!["/bin/sh".into()]);
        }
        let entry = PROGRAMS.iter().find(|(n, _, _)| *n == name);
        let Some((_, module, func)) = entry else {
            return Err(format!("Unknown program {name:?}"));
        };
        let python_entry = |py: &PythonInfo| -> Option<Vec<String>> {
            if module.is_empty() || py.hypernix.is_empty() {
                return None;
            }
            if func.is_empty() {
                return Some(vec![py.executable.clone(), "-m".into(), (*module).into()]);
            }
            let code = format!(
                "import sys; sys.argv[0] = {name:?}; from {module} import {func} as _entry; sys.exit(_entry())"
            );
            Some(vec![py.executable.clone(), "-c".into(), code])
        };

        // An interpreter chosen in Settings wins over whatever is on PATH:
        // picking one is how somebody says "this install, not that one".
        if self.python_forced {
            if let Some(py) = &self.python {
                if let Some(argv) = python_entry(py) {
                    return Ok(argv);
                }
                if name == "hypernix-t1" {
                    if let Some(script) = &self.t1_script {
                        return Ok(vec![script.clone()]);
                    }
                }
            }
        }
        if let Some(path) = self.bins.get(name) {
            return Ok(vec![path.clone()]);
        }
        if name == "hypernix-t1" {
            if let Some(script) = &self.t1_script {
                return Ok(vec![script.clone()]);
            }
            return Err("hypernix-t1 was not found. It is installed with `pip install hypernix`; \
                        if it is somewhere unusual, set the scripts folder in Settings."
                .into());
        }
        if let Some(py) = &self.python {
            if let Some(argv) = python_entry(py) {
                return Ok(argv);
            }
        }
        Err(format!(
            "`{name}` was not found and no Python with HyperNix installed was detected. \
             Install it from Settings, or point Settings at the right interpreter."
        ))
    }

    /// Environment every job gets on top of the host's own.
    pub fn job_env(&self) -> Vec<(String, String)> {
        vec![
            ("PATH".into(), self.path.clone()),
            ("TERM".into(), "xterm-256color".into()),
            ("COLORTERM".into(), "truecolor".into()),
            ("PYTHONUNBUFFERED".into(), "1".into()),
            ("PYTHONIOENCODING".into(), "utf-8".into()),
            ("HYPERNIX_GUI".into(), "1".into()),
        ]
    }
}

pub fn is_sandboxed() -> bool {
    std::path::Path::new("/.flatpak-info").exists()
}

/// A `Command` that runs on the host, through `flatpak-spawn --host` when
/// this process is inside a Flatpak.
pub fn host_command(argv: &[String], env: &[(String, String)], cwd: Option<&str>) -> Command {
    if is_sandboxed() {
        let mut cmd = Command::new("flatpak-spawn");
        cmd.arg("--host").arg("--watch-bus");
        for (k, v) in env {
            cmd.arg(format!("--env={k}={v}"));
        }
        if let Some(dir) = cwd {
            cmd.arg(format!("--directory={dir}"));
        }
        cmd.args(argv);
        cmd
    } else {
        let mut cmd = Command::new(&argv[0]);
        cmd.args(&argv[1..]);
        cmd.envs(env.iter().cloned());
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        cmd
    }
}

/// Run a host command to completion, giving up after `timeout`.
pub fn host_output(
    argv: &[String],
    env: &[(String, String)],
    cwd: Option<&str>,
    timeout: Duration,
) -> Result<(i32, String, String), String> {
    let mut child = host_command(argv, env, cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run {}: {e}", argv[0]))?;
    let mut out = child.stdout.take().unwrap();
    let mut err = child.stderr.take().unwrap();
    let out_t = std::thread::spawn(move || {
        let mut s = Vec::new();
        let _ = out.read_to_end(&mut s);
        s
    });
    let err_t = std::thread::spawn(move || {
        let mut s = Vec::new();
        let _ = err.read_to_end(&mut s);
        s
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{} took longer than {}s", argv[0], timeout.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(e) => return Err(e.to_string()),
        }
    };
    let stdout = String::from_utf8_lossy(&out_t.join().unwrap_or_default()).into_owned();
    let stderr = String::from_utf8_lossy(&err_t.join().unwrap_or_default()).into_owned();
    Ok((status.code().unwrap_or(-1), stdout, stderr))
}

fn default_shell() -> &'static str {
    if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "/bin/sh"
    }
}

/// The PATH the user's login shell sets up. `env` is an external program,
/// so this reads the same way under bash, zsh and fish.
fn login_env() -> (String, String, String) {
    let script = format!(
        "s=\"${{SHELL:-{}}}\"; printf 'SHELL=%s\\n' \"$s\"; exec \"$s\" -l -c env",
        default_shell()
    );
    let argv = vec!["/bin/sh".to_string(), "-c".to_string(), script];
    let mut path = String::new();
    let mut home = String::new();
    let mut shell = String::new();
    if let Ok((_, out, _)) = host_output(&argv, &[], None, Duration::from_secs(8)) {
        for line in out.lines() {
            if let Some(v) = line.strip_prefix("PATH=") {
                path = v.to_string();
            } else if let Some(v) = line.strip_prefix("HOME=") {
                home = v.to_string();
            } else if let Some(v) = line.strip_prefix("SHELL=") {
                if shell.is_empty() {
                    shell = v.to_string();
                }
            }
        }
    }
    if home.is_empty() {
        home = dirs::home_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
    }
    if path.is_empty() {
        path = std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into());
    }
    (path, home, shell)
}

fn compose_path(login: &str, home: &str, settings: &EnvSettings) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut push = |p: &str| {
        let p = p.trim();
        if !p.is_empty() && !parts.iter().any(|x| x == p) {
            parts.push(p.to_string());
        }
    };
    if let Some(dir) = &settings.bin_dir {
        push(dir);
    }
    if let Some(py) = &settings.python {
        if let Some(parent) = std::path::Path::new(py).parent() {
            push(&parent.to_string_lossy());
        }
    }
    if let Some(extra) = &settings.extra_path {
        extra.split(':').for_each(&mut push);
    }
    login.split(':').for_each(&mut push);
    for p in [
        format!("{home}/.local/bin"),
        format!("{home}/.hypernix/t1api/venv/bin"),
        format!("{home}/.pyenv/shims"),
        format!("{home}/.bun/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        "/usr/bin".into(),
        "/bin".into(),
    ] {
        push(&p);
    }
    parts.join(":")
}

const PROBE_PY: &str = r#"import sys, platform
try:
    import importlib.metadata as m
    v = m.version("hypernix")
except Exception:
    v = ""
print(sys.executable + "\t" + platform.python_version() + "\t" + v)"#;

fn detection_script() -> String {
    let names: Vec<&str> = PROGRAMS.iter().map(|(n, _, _)| *n).collect();
    format!(
        r#"for s in {names} {terms}; do p=$(command -v "$s" 2>/dev/null) && printf 'BIN\t%s\t%s\n' "$s" "$p"; done
cands="$HNXGUI_PY"
h=$(command -v hypernix 2>/dev/null) && {{ first=$(head -n 1 "$h" 2>/dev/null); case "$first" in '#!'*) cands="$cands ${{first#??}}";; esac; }}
cands="$cands $HOME/.hypernix/t1api/venv/bin/python python3.12 python3.13 python3.14 python3.15 python3 python"
for c in $cands; do
  p=$(command -v "$c" 2>/dev/null) || continue
  r=$("$p" -c "$HNXGUI_PROBE" 2>/dev/null) || continue
  printf 'PY\t%s\n' "$r"
  d=$(dirname "$p"); [ -x "$d/hypernix-t1" ] && printf 'T1\t%s\t%s\n' "$p" "$d/hypernix-t1"
done
printf 'OS\t%s\t%s\n' "$(uname -s)" "$(uname -m)"
"#,
        names = names.join(" "),
        terms = TERMINALS.join(" "),
    )
}

fn version_tuple(v: &str) -> (u32, u32) {
    let mut it = v.split('.').map(|x| x.parse::<u32>().unwrap_or(0));
    (it.next().unwrap_or(0), it.next().unwrap_or(0))
}

pub fn detect(settings: &EnvSettings) -> HostEnv {
    let (login_path, home, shell) = login_env();
    let path = compose_path(&login_path, &home, settings);
    let forced = settings.python.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let env = vec![
        ("PATH".to_string(), path.clone()),
        ("HOME".to_string(), home.clone()),
        ("HNXGUI_PY".to_string(), forced.unwrap_or("").to_string()),
        ("HNXGUI_PROBE".to_string(), PROBE_PY.to_string()),
    ];
    let argv = vec!["/bin/sh".to_string(), "-c".to_string(), detection_script()];
    let out = host_output(&argv, &env, None, Duration::from_secs(30))
        .map(|(_, out, _)| out)
        .unwrap_or_default();

    let mut bins = BTreeMap::new();
    let mut terminals = Vec::new();
    let mut pythons: Vec<PythonInfo> = Vec::new();
    let mut t1_by_python: BTreeMap<String, String> = BTreeMap::new();
    let (mut os, mut arch) = (std::env::consts::OS.to_string(), std::env::consts::ARCH.to_string());
    for line in out.lines() {
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.as_slice() {
            ["BIN", name, p] => {
                if TERMINALS.contains(name) {
                    terminals.push(name.to_string());
                } else {
                    bins.insert(name.to_string(), p.to_string());
                }
            }
            ["PY", exe, ver, hnx] => {
                if !pythons.iter().any(|p| p.executable == *exe) {
                    pythons.push(PythonInfo {
                        executable: exe.to_string(),
                        version: ver.to_string(),
                        hypernix: hnx.to_string(),
                    });
                }
            }
            ["PY", exe, ver] => {
                if !pythons.iter().any(|p| p.executable == *exe) {
                    pythons.push(PythonInfo {
                        executable: exe.to_string(),
                        version: ver.to_string(),
                        hypernix: String::new(),
                    });
                }
            }
            ["T1", py, script] => {
                t1_by_python.insert(py.to_string(), script.to_string());
            }
            ["OS", o, a] => {
                os = o.to_string();
                arch = a.to_string();
            }
            _ => {}
        }
    }

    // Detection order already prefers the interpreter behind `hypernix`
    // on PATH, then the T1 server's private venv, then 3.12 -> 3.15.
    let python_forced = forced.is_some() && !pythons.is_empty();
    let chosen = if python_forced {
        pythons.first().cloned()
    } else {
        pythons
            .iter()
            .find(|p| !p.hypernix.is_empty())
            .or_else(|| pythons.iter().find(|p| version_tuple(&p.version) >= (3, 12)))
            .cloned()
    };
    let t1_script = chosen.as_ref().and_then(|p| {
        t1_by_python
            .iter()
            .find(|(py, _)| {
                std::path::Path::new(py.as_str()).parent()
                    == std::path::Path::new(&p.executable).parent()
            })
            .map(|(_, s)| s.clone())
            .or_else(|| t1_by_python.values().next().cloned())
    });

    HostEnv {
        sandboxed: is_sandboxed(),
        os,
        arch,
        home,
        path,
        shell,
        pythons,
        python: chosen,
        bins,
        t1_script,
        terminals,
        python_forced,
    }
}

/// Make sure an environment has been detected, and hand back a copy.
pub fn current(state: &State<'_, AppState>, settings: Option<&EnvSettings>) -> HostEnv {
    if settings.is_none() {
        if let Some(env) = state.env.lock().unwrap().clone() {
            return env;
        }
    }
    // Detection runs host processes for a few seconds; the lock is not
    // held across it so a job can still be signalled meanwhile.
    let env = detect(settings.unwrap_or(&EnvSettings::default()));
    *state.env.lock().unwrap() = Some(env.clone());
    env
}

#[tauri::command]
pub async fn env_detect(
    state: State<'_, AppState>,
    settings: EnvSettings,
) -> Result<HostEnv, String> {
    Ok(current(&state, Some(&settings)))
}

/// What a program name would run as, for the command preview.
#[tauri::command]
pub async fn env_resolve(state: State<'_, AppState>, program: String) -> Result<Vec<String>, String> {
    current(&state, None).resolve(&program)
}
