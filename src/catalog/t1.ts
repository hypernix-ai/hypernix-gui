import type { CommandSpec, Section } from "./types";
import { action, area, is, list, num, path, pick, secret, text, toggle } from "./shared";

const T1 = "hypernix-t1";
const simple = (id: string, title: string, summary: string, icon: CommandSpec["icon"], extra: Partial<CommandSpec> = {}): CommandSpec => ({
  id: `t1-${id}`,
  title,
  summary,
  icon,
  program: T1,
  base: [id],
  fields: [],
  ...extra,
});

const BACKENDS = ["", "auto", "cuda", "vulkan", "cpu", "hnx-cuda", "hnx-cpu"];
const runnerModel = is("action", "start", "load", "plan");

/** Lifecycle buttons on the T1 page, in the order they are shown. */
export const T1_LIFECYCLE: CommandSpec[] = [
  simple("start", "Start", "Start the server in the background.", "power"),
  simple("stop", "Stop", "Ask it to stop, and wait.", "powerOff"),
  simple("restart", "Restart", "Stop (or kill) then start.", "restart"),
  simple("status", "Status", "Is it running, where, and what version.", "activity"),
  simple("test", "Test", "Health, status, and a real end-to-end probe.", "stethoscope"),
  simple("version", "Version", "HyperNix, T1 API and Python the server runs on.", "info"),
  simple("kill", "Kill", "Force it to stop, losing in-flight requests.", "skull", {
    confirm: "Kill the T1 server? Requests in flight are lost.",
  }),
];

export const t1Section: Section = {
  id: "t1",
  title: "T1 server",
  icon: "server",
  blurb: "Run and manage a T1 API server on this machine: lifecycle, built-in runner, models, training jobs and accounts.",
  groups: [
    { title: "Lifecycle", commands: T1_LIFECYCLE },
    {
      title: "Maintenance",
      commands: [
        simple("logs", "Logs", "The last N lines of the server log, or follow it.", "scroll", {
          fields: [
            num("lines", undefined, "Lines", { positional: true, placeholder: "60", showIf: (v) => v.follow !== true }),
            toggle("follow", "-f", "Follow"),
          ],
        }),
        simple("upgrade", "Upgrade", "Upgrade HyperNix in the Python the server runs on, then restart it.", "rocket", {
          fields: [
            toggle("main", "--main", "Newest code from GitHub"),
            text("spec", undefined, "Version spec", { positional: true, placeholder: "hypernix==0.72.7.post1", showIf: (v) => v.main !== true }),
          ],
        }),
        simple("create", "Create server", "Set up a new server (runs the guided installer when available).", "plus", {
          fields: [
            text("host", "--host", "Host", { placeholder: "127.0.0.1" }),
            num("port", "--port", "Port", { placeholder: "8000" }),
            toggle("force", "--force", "Overwrite existing config"),
          ],
          tui: true,
        }),
        simple("configure", "Edit configuration", "Open the server's .env in $EDITOR.", "fileCog", { tui: true }),
        simple("autostart", "Autostart", "Start at login via a systemd user service.", "zap", {
          fields: [
            action(["status", "on", "off"]),
            toggle("writeOnly", "--write-only", "Write the unit only", { showIf: is("action", "on"), advanced: true }),
          ],
        }),
        simple("key", "Server key store", "Run gkey against this server's key store.", "key", {
          fields: [list("args", undefined, "gkey arguments", "space", { positional: true, placeholder: "list", wide: true })],
        }),
        simple("remove", "Remove server", "Stop, disable, and delete the config (keys are kept).", "trash", {
          confirm: "Remove this T1 server's configuration? Keys are kept.",
        }),
      ],
    },
    {
      title: "Models",
      commands: [
        simple("built-in-runner", "Built-in runner", "Serve a model from this server's own llama.cpp instead of forwarding to LM Studio.", "cpu", {
          keywords: "runner serve load llama.cpp",
          fields: [
            action(["status", "start", "auto", "plan", "load", "unload", "stop"]),
            text("model", undefined, "Model id", { positional: true, placeholder: "HyperNix.3-mini", showIf: runnerModel, required: false }),
            num("gpuLayers", "--gpu-layers", "GPU layers", { showIf: runnerModel }),
            num("ctx", "--context-length", "Context length", { showIf: runnerModel }),
            pick("backend", "--backend", "Backend", BACKENDS, { showIf: runnerModel }),
            num("totalLayers", "--total-layers", "Total layers", { showIf: runnerModel, advanced: true }),
            toggle("restart", "--restart", "Reload if already serving", { showIf: is("action", "start", "load"), advanced: true }),
            toggle("mostUsed", "--most-used", "Most-used model, not the last", { showIf: is("action", "auto") }),
            toggle("dryRun", "--dry-run", "Dry run", { showIf: is("action", "auto") }),
            text("url", "--url", "Server URL", { before: true, advanced: true }),
            secret("key", "--key", "Admin key", { before: true, advanced: true, placeholder: "T1_ADMIN_KEY / .env" }),
            toggle("json", "--json", "Raw JSON", { before: true, advanced: true }),
          ],
        }),
        simple("sync", "Sync models", "Mirror ~/.hypernix/models into the server's models folder as symlinks.", "refresh", {
          fields: [
            toggle("dryRun", "--dry-run", "Dry run"),
            toggle("index", "--index", "Then write the registry"),
            num("watch", "--watch", "Keep syncing every N s", { advanced: true }),
          ],
        }),
        simple("index", "Index models", "Read every .gguf in a folder and write the model registry from what the files say.", "database", {
          fields: [
            path("dir", "--dir", "Models folder", "dir"),
            path("output", "-o", "Registry", "save", { extensions: ["json"] }),
            toggle("refresh", "--refresh", "Re-read measured fields"),
            toggle("dryRun", "--dry-run", "Dry run"),
            toggle("estimate", "--estimate-prices", "Estimate prices", { advanced: true }),
            text("plan", "--plan", "Minimum plan", { placeholder: "free", advanced: true }),
            num("inPrice", "--input-price", "Input price /1k", { advanced: true, step: 0.0001 }),
            num("outPrice", "--output-price", "Output price /1k", { advanced: true, step: 0.0001 }),
            text("currency", "--currency", "Currency", { advanced: true }),
            pick("availability", "--availability", "Availability", ["", "public", "private", "internal", "beta"], { advanced: true }),
            num("priority", "--priority", "Routing priority", { advanced: true }),
            toggle("json", "--json", "JSON output", { advanced: true }),
          ],
        }),
        simple("override", "LM Studio models folder", "Point LM Studio's models folder at HyperNix's, or undo it.", "plug", {
          base: ["override", "lms"],
          fields: [
            action(["move-dir", "revert"]),
            path("folder", undefined, "Folder", "dir", { positional: true, placeholder: "~/.hypernix/models", showIf: is("action", "move-dir") }),
            toggle("moveFiles", "--move-files", "Move existing files", { showIf: is("action", "move-dir") }),
          ],
        }),
        {
          id: "hypernix-sync",
          title: "hypernix-sync",
          summary: "The standalone model mirror, with custom source and target folders.",
          icon: "refresh",
          program: "hypernix-sync",
          base: [],
          fields: [
            path("source", "--source", "Source", "dir", { placeholder: "~/.hypernix/models" }),
            path("target", "--target", "Target", "dir", { placeholder: "~/.hypernix/t1api/models" }),
            toggle("dryRun", "-n", "Dry run"),
            toggle("noPrune", "--no-prune", "Keep links whose file has gone"),
            toggle("index", "--index", "Then write the registry"),
            num("watch", "--watch", "Keep syncing every N s", { advanced: true }),
            toggle("verbose", "-v", "List every file", { advanced: true }),
          ],
        },
      ],
    },
    {
      title: "Chat & jobs",
      commands: [
        simple("chat", "Chat", "Send a message to the served model and print the reply.", "chat", {
          fields: [
            area("message", undefined, "Message", { positional: true, required: true, placeholder: "Hello from HyperNix Control" }),
            text("system", "-s", "System prompt"),
            text("model", "-m", "Model"),
            toggle("new", "--new", "Start a new chat"),
            text("session", "--session", "Chat id", { advanced: true }),
            toggle("quiet", "-q", "Reply only", { advanced: true }),
            text("url", "--url", "Server URL", { advanced: true }),
            secret("key", "--key", "Key", { advanced: true }),
          ],
        }),
        simple("training", "Training runs", "What training is doing on this machine: show, pause, resume and stop runs.", "chart", {
          fields: [
            pick("op", undefined, "Show", [
              { value: "", label: "Every run" },
              { value: "--active", label: "Active runs" },
              { value: "--show", label: "One run in full" },
              { value: "--logs", label: "A run's log" },
              { value: "--pause", label: "Pause a run" },
              { value: "--resume", label: "Resume a run" },
              { value: "--stop", label: "Stop a run (SIGTERM)" },
              { value: "--resources", label: "GPU, CPU and RAM now" },
            ], { positional: true }),
            text("run", undefined, "Run id or name", { positional: true, required: true, showIf: is("op", "--show", "--logs", "--pause", "--resume", "--stop") }),
            num("tail", "--tail", "Log lines", { placeholder: "50", showIf: is("op", "--logs") }),
            path("root", "--root", "Runs folder", "dir", { advanced: true }),
            toggle("json", "--json", "JSON output", { advanced: true }),
          ],
        }),
        simple("launch-script", "Launch script", "Run a script so it survives an SSH disconnect; supervised, with logs kept.", "rocket", {
          keywords: "detach nohup job supervise",
          fields: [
            pick("mode", undefined, "Do", [
              { value: "", label: "Run a script" },
              { value: "-1", label: "Run a shell command" },
              { value: "--list", label: "List jobs" },
              { value: "--status", label: "Job status" },
              { value: "--logs", label: "Job logs" },
              { value: "--stop", label: "Stop a job" },
              { value: "--restart", label: "Restart a job" },
            ], { positional: true }),
            text("job", undefined, "Job", { positional: true, required: true, showIf: is("mode", "--logs", "--stop", "--restart") }),
            text("statusJob", undefined, "Job (blank for all)", { positional: true, showIf: is("mode", "--status") }),
            area("cmd", undefined, "Shell command", { positional: true, required: true, placeholder: "make -j8 && ./train", showIf: is("mode", "-1") }),
            path("script", undefined, "Script", "file", { positional: true, required: true, showIf: is("mode", "") }),
            text("name", "--name", "Job name", { showIf: is("mode", "", "-1") }),
            path("cwd", "--cwd", "Working folder", "dir", { showIf: is("mode", "", "-1") }),
            text("gpu", "--gpu", "GPU(s)", { placeholder: "0", showIf: is("mode", "", "-1") }),
            list("env", "--env", "Environment", "repeat", { placeholder: "NAME=VALUE", showIf: is("mode", "", "-1"), advanced: true }),
            pick("shell", "--shell", "Shell", ["", "auto", "bash", "fish", "zsh", "sh"], { showIf: is("mode", "-1"), advanced: true }),
            num("timeout", "--timeout", "Timeout s", { showIf: is("mode", "", "-1"), advanced: true }),
            path("logFile", "--log-file", "Log file", "save", { showIf: is("mode", "", "-1"), advanced: true }),
            num("priority", "--priority", "nice", { showIf: is("mode", "", "-1"), advanced: true }),
            text("cpu", "--cpu", "CPU affinity", { placeholder: "0-3", showIf: is("mode", "", "-1"), advanced: true }),
            num("tail", "--tail", "Log lines", { showIf: is("mode", "--logs") }),
            secret("key", "-k", "Key", { advanced: true }),
            toggle("json", "--json", "JSON output", { advanced: true }),
          ],
        }),
      ],
    },
    {
      title: "Accounts",
      commands: [
        {
          id: "t1-accounts",
          title: "Web accounts",
          summary: "Accounts that let somebody get their first T1 key. Passwords are prompted for in the console.",
          icon: "users",
          program: "t1-accounts",
          base: [],
          fields: [
            action(["list", "create", "reset", "disable", "enable", "unlock", "sessions", "purge", "modes"]),
            text("username", undefined, "Username", { positional: true, required: true, showIf: is("action", "create", "reset", "disable", "enable", "unlock", "sessions") }),
            text("displayName", "--display-name", "Display name", { showIf: is("action", "create") }),
            text("email", "--email", "Email", { showIf: is("action", "create") }),
            toggle("admin", "--admin", "Admin", { showIf: is("action", "create") }),
            toggle("revoke", "--revoke", "End all sessions", { showIf: is("action", "sessions") }),
            path("db", "--db", "Database", "file", { before: true, advanced: true }),
            toggle("json", "--json", "JSON output", { before: true, advanced: true }),
          ],
        },
      ],
    },
  ],
};
