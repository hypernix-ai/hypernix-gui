//! "Pop out": run a command in the system terminal instead of in the app.

use serde::Deserialize;
use tauri::State;

use crate::env::{self, host_command};
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalRequest {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    /// A command template with `{cmd}` where the shell command goes, for a
    /// terminal this does not know about (e.g. `wezterm start -- sh -c {cmd}`).
    pub template: Option<String>,
}

pub fn shell_quote(s: &str) -> String {
    if !s.is_empty()
        && s
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_./=:,+@%".contains(c))
    {
        return s.to_string();
    }
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn applescript_string(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

#[tauri::command]
pub async fn open_in_terminal(
    state: State<'_, AppState>,
    req: TerminalRequest,
) -> Result<String, String> {
    let host = env::current(&state, None);
    let mut argv = host.resolve(&req.program)?;
    argv.extend(req.args.iter().cloned());
    let cwd = req
        .cwd
        .clone()
        .filter(|c| !c.trim().is_empty())
        .unwrap_or_else(|| host.home.clone());
    let joined: Vec<String> = argv.iter().map(|a| shell_quote(a)).collect();
    let script = format!(
        "export PATH={path}; cd {cwd} && {cmd}; printf '\\n\\033[2m[exited with %s, press Enter to close]\\033[0m' \"$?\"; read _",
        path = shell_quote(&host.path),
        cwd = shell_quote(&cwd),
        cmd = joined.join(" "),
    );

    let launch: Vec<String> = if let Some(tpl) = req.template.as_ref().filter(|t| t.contains("{cmd}")) {
        // Split the template on whitespace, then substitute: the command
        // stays one argument however many spaces it has.
        tpl.split_whitespace()
            .map(|w| w.replace("{cmd}", &script))
            .collect()
    } else if host.os == "Darwin" {
        vec![
            "osascript".into(),
            "-e".into(),
            format!("tell application \"Terminal\" to do script {}", applescript_string(&script)),
            "-e".into(),
            "tell application \"Terminal\" to activate".into(),
        ]
    } else {
        let term = host
            .terminals
            .first()
            .ok_or("No terminal emulator was found. Set a terminal command in Settings.")?;
        let sh = vec!["sh".to_string(), "-c".to_string(), script.clone()];
        let mut v = vec![term.clone()];
        match term.as_str() {
            "gnome-terminal" | "kgx" | "ptyxis" => v.push("--".into()),
            "xfce4-terminal" => v.push("-x".into()),
            "wezterm" => {
                v.push("start".into());
                v.push("--".into());
            }
            "kitty" | "foot" => {}
            _ => v.push("-e".into()),
        }
        v.extend(sh);
        v
    };

    let mut child = host_command(&launch, &[("PATH".into(), host.path.clone())], Some(&cwd))
        .spawn()
        .map_err(|e| format!("could not open a terminal ({}): {e}", launch[0]))?;
    // Reap it when it exits so it does not linger as a zombie.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(launch[0].clone())
}
