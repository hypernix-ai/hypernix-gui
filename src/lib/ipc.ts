/**
 * The bridge to the Rust side.
 *
 * Inside the app every call goes to a Tauri command. In a plain browser
 * (`npm run dev` without Tauri, or a design review) a small simulation
 * answers instead, so the interface can be worked on and screenshotted
 * without a machine that has HyperNix installed.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface PythonInfo {
  executable: string;
  version: string;
  hypernix: string;
}

export interface HostEnv {
  sandboxed: boolean;
  os: string;
  arch: string;
  home: string;
  path: string;
  shell: string;
  pythons: PythonInfo[];
  python: PythonInfo | null;
  bins: Record<string, string>;
  t1Script: string | null;
  terminals: string[];
  pythonForced: boolean;
}

export interface EnvSettings {
  python?: string;
  binDir?: string;
  extraPath?: string;
}

export interface JobStartReq {
  id: string;
  program: string;
  args: string[];
  cwd?: string;
  env?: [string, string][];
  cols?: number;
  rows?: number;
}

export interface Captured {
  code: number;
  stdout: string;
  stderr: string;
}

export interface T1Probe {
  online: boolean;
  latencyMs: number | null;
  version: Record<string, unknown> | null;
  status: Record<string, unknown> | null;
  error: string | null;
}

export interface T1LocalConfig {
  configDir: string;
  envFile: string;
  exists: boolean;
  entries: [string, string][];
  baseUrl: string;
  pid: string | null;
  logFile: string;
  waiterServer: string | null;
}

export interface SysSnapshot {
  cpu: number;
  cores: number[];
  cpuBrand: string;
  memUsed: number;
  memTotal: number;
  swapUsed: number;
  swapTotal: number;
  load: [number, number, number];
  uptime: number;
  host: string;
  os: string;
  kernel: string;
}

export interface ModelEntry {
  path: string;
  name: string;
  kind: "gguf" | "snapshot" | "checkpoint";
  size: number;
  modified: number;
  root: string;
}

// ---------------------------------------------------------------------------

export const api = {
  envDetect: (settings: EnvSettings) =>
    inTauri ? invoke<HostEnv>("env_detect", { settings }) : mock.envDetect(),
  envResolve: (program: string) =>
    inTauri ? invoke<string[]>("env_resolve", { program }) : Promise.resolve([program]),
  jobStart: (req: JobStartReq) =>
    inTauri
      ? invoke<{ argv: string[]; pid: number | null }>("job_start", { req })
      : mock.jobStart(req),
  jobWrite: (id: string, data: string) =>
    inTauri ? invoke<void>("job_write", { id, data }) : mock.jobWrite(id, data),
  jobResize: (id: string, cols: number, rows: number) =>
    inTauri ? invoke<void>("job_resize", { id, cols, rows }) : Promise.resolve(),
  jobSignal: (id: string, signal: "int" | "term" | "kill" | "hup") =>
    inTauri ? invoke<void>("job_signal", { id, signal }) : mock.jobSignal(id),
  runCapture: (program: string, args: string[], timeoutSecs?: number) =>
    inTauri
      ? invoke<Captured>("run_capture", { program, args, timeoutSecs })
      : mock.runCapture(program, args),
  openInTerminal: (req: { program: string; args: string[]; cwd?: string; template?: string }) =>
    inTauri ? invoke<string>("open_in_terminal", { req }) : Promise.resolve("Terminal"),
  t1Probe: (baseUrl: string) =>
    inTauri ? invoke<T1Probe>("t1_probe", { baseUrl }) : mock.t1Probe(),
  t1Get: (baseUrl: string, path: string, key?: string) =>
    inTauri ? invoke<unknown>("t1_get", { baseUrl, path, key }) : mock.t1Get(path),
  t1LocalConfig: () =>
    inTauri ? invoke<T1LocalConfig>("t1_local_config") : mock.t1LocalConfig(),
  sysSnapshot: () => (inTauri ? invoke<SysSnapshot>("sys_snapshot") : mock.sysSnapshot()),
  scanModels: (dirs: string[]) =>
    inTauri ? invoke<ModelEntry[]>("scan_models", { dirs }) : mock.scanModels(),
  secretGet: (name: string) =>
    inTauri ? invoke<string | null>("secret_get", { name }) : Promise.resolve(localStorage.getItem(`secret:${name}`)),
  secretSet: (name: string, value: string | null) =>
    inTauri
      ? invoke<void>("secret_set", { name, value })
      : Promise.resolve(value ? localStorage.setItem(`secret:${name}`, value) : localStorage.removeItem(`secret:${name}`)),
};

export async function onJobOutput(cb: (id: string, data: string) => void): Promise<UnlistenFn> {
  if (!inTauri) {
    mock.outputListeners.push(cb);
    return () => {};
  }
  return listen<{ id: string; data: string }>("job-output", (e) => cb(e.payload.id, e.payload.data));
}

export async function onJobExit(
  cb: (id: string, code: number | null, success: boolean) => void,
): Promise<UnlistenFn> {
  if (!inTauri) {
    mock.exitListeners.push(cb);
    return () => {};
  }
  return listen<{ id: string; code: number | null; success: boolean }>("job-exit", (e) =>
    cb(e.payload.id, e.payload.code, e.payload.success),
  );
}

export async function pickPath(mode: "file" | "dir" | "save", extensions?: string[]): Promise<string | null> {
  if (!inTauri) return mode === "dir" ? "~/.hypernix/models" : "~/.hypernix/models/model.gguf";
  const dialog = await import("@tauri-apps/plugin-dialog");
  const filters = extensions?.length ? [{ name: extensions.join(", "), extensions }] : undefined;
  if (mode === "save") return (await dialog.save({ filters })) ?? null;
  const picked = await dialog.open({ directory: mode === "dir", multiple: false, filters });
  return typeof picked === "string" ? picked : null;
}

export async function pickPaths(extensions?: string[]): Promise<string[]> {
  if (!inTauri) return ["~/hypernix-gguf/model.q4_k_m.gguf"];
  const dialog = await import("@tauri-apps/plugin-dialog");
  const filters = extensions?.length ? [{ name: extensions.join(", "), extensions }] : undefined;
  const picked = await dialog.open({ multiple: true, filters });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function openUrl(url: string) {
  if (!inTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const opener = await import("@tauri-apps/plugin-opener");
  await opener.openUrl(url);
}

export async function revealPath(path: string) {
  if (!inTauri) return;
  const opener = await import("@tauri-apps/plugin-opener");
  await opener.revealItemInDir(path);
}

// ---------------------------------------------------------------------------
// Browser simulation

const mock = {
  outputListeners: [] as ((id: string, data: string) => void)[],
  exitListeners: [] as ((id: string, code: number | null, success: boolean) => void)[],
  timers: new Map<string, number[]>(),

  envDetect: async (): Promise<HostEnv> => {
    await new Promise((r) => setTimeout(r, 400));
    const py = { executable: "/home/you/.venvs/hnx/bin/python3.12", version: "3.12.7", hypernix: "0.72.7.post1" };
    return {
      sandboxed: false,
      os: "Linux",
      arch: "x86_64",
      home: "/home/you",
      path: "/home/you/.local/bin:/usr/local/bin:/usr/bin:/bin",
      shell: "/bin/zsh",
      pythons: [py, { executable: "/usr/bin/python3", version: "3.13.1", hypernix: "" }],
      python: py,
      bins: Object.fromEntries(
        ["hypernix", "waiter", "gkey", "hyprslug", "steamroller", "hypernix-t1", "tvtop-max", "hyped-pro"].map((n) => [
          n,
          `/home/you/.venvs/hnx/bin/${n}`,
        ]),
      ),
      t1Script: "/home/you/.venvs/hnx/bin/hypernix-t1",
      terminals: ["gnome-terminal"],
      pythonForced: false,
    };
  },

  jobStart: async (req: JobStartReq) => {
    const emit = (d: string) => mock.outputListeners.forEach((l) => l(req.id, d));
    const cmd = [req.program, ...req.args].join(" ");
    const lines = [
      `\x1b[38;5;160m▍\x1b[0m\x1b[1m HyperNix\x1b[0m \x1b[2m0.72.7.post1 · simulated in the browser\x1b[0m\r\n`,
      `\x1b[2m$ ${cmd}\x1b[0m\r\n\r\n`,
      `\x1b[32m  ✓\x1b[0m Python 3.12.7 at /home/you/.venvs/hnx/bin/python3.12\r\n`,
      `\x1b[32m  ✓\x1b[0m torch 2.8.0 (CUDA 12.8) · 1 device usable\r\n`,
      `\x1b[33m  !\x1b[0m llama-quantize not cached yet; it is fetched on first use\r\n`,
      `\r\n\x1b[1mProgress\x1b[0m\r\n`,
    ];
    const timers: number[] = [];
    lines.forEach((l, i) => timers.push(window.setTimeout(() => emit(l), 120 * i)));
    let pct = 0;
    const bar = window.setInterval(() => {
      pct = Math.min(100, pct + 7);
      const filled = Math.round(pct / 4);
      emit(`\r  \x1b[38;5;203m${"━".repeat(filled)}\x1b[38;5;238m${"━".repeat(25 - filled)}\x1b[0m ${String(pct).padStart(3)}%`);
      if (pct >= 100) {
        window.clearInterval(bar);
        emit(`\r\n\r\n\x1b[32m  ✓\x1b[0m Done.\r\n`);
        mock.exitListeners.forEach((l) => l(req.id, 0, true));
      }
    }, 160);
    timers.push(bar);
    mock.timers.set(req.id, timers);
    return { argv: [req.program, ...req.args], pid: 4242 };
  },
  jobWrite: async (id: string, data: string) => {
    mock.outputListeners.forEach((l) => l(id, data.replace(/\r/g, "\r\n")));
  },
  jobSignal: async (id: string) => {
    (mock.timers.get(id) ?? []).forEach((t) => {
      window.clearTimeout(t);
      window.clearInterval(t);
    });
    mock.outputListeners.forEach((l) => l(id, "\r\n\x1b[33m^C interrupted\x1b[0m\r\n"));
    mock.exitListeners.forEach((l) => l(id, 130, false));
  },
  runCapture: async (program: string, args: string[]): Promise<Captured> => {
    if (program === "hypernix" && args[0] === "devices") {
      return {
        code: 0,
        stderr: "",
        stdout: JSON.stringify({
          devices: [
            { name: "cpu", kind: "cpu", label: "CPU · 16 threads", usable: true, reason: "", total_memory: 0, remedy: "" },
            { name: "cuda", kind: "cuda", label: "NVIDIA GeForce GTX 1080", usable: true, reason: "", capability: [6, 1], total_memory: 8589934592, remedy: "" },
            { name: "mps", kind: "mps", label: "Apple Metal", usable: false, reason: "Not a Mac.", total_memory: 0, remedy: "" },
            { name: "vulkan", kind: "vulkan", label: "Vulkan (via llama.cpp)", usable: false, reason: "No build found.", total_memory: 0, remedy: "" },
          ],
        }),
      };
    }
    return { code: 0, stdout: "", stderr: "" };
  },
  t1Probe: async (): Promise<T1Probe> => ({
    online: true,
    latencyMs: 4,
    version: {
      hypernix: "0.72.7.post1",
      hypernix_installed: "0.72.7.post1",
      stale: false,
      t1_api_version: "1.1.26.9.0.0",
      python: "3.12.7",
      uptime_seconds: 86213,
    },
    status: {
      environment: "development",
      server_name: "forge",
      model_count: 7,
      storage_backend: "sqlite",
      tls_enabled: false,
      mtls_mode: "off",
      rate_limit_enabled: true,
      warnings: ["T1_ADMIN_PASSWORD is unset: the admin pane is disabled"],
    },
    error: null,
  }),
  t1Get: async (path: string) => {
    if (path.startsWith("/models"))
      return {
        models: [
          { model_id: "hypernix.3-mini", backend: "llama.cpp", available: true },
          { model_id: "qwen3-8b-q4_k_m", backend: "lmstudio", available: true },
          { model_id: "gemma-4-e4b", backend: "runner", available: false },
        ],
      };
    return {};
  },
  t1LocalConfig: async (): Promise<T1LocalConfig> => ({
    configDir: "/home/you/.hypernix/t1api",
    envFile: "/home/you/.hypernix/t1api/.env",
    exists: true,
    entries: [
      ["T1_HOST", "127.0.0.1"],
      ["T1_PORT", "8000"],
      ["T1_ENVIRONMENT", "development"],
      ["T1_STORAGE_BACKEND", "sqlite"],
      ["T1_MODEL_SYNC", "1"],
      ["T1_ADMIN_KEY", "••••••••"],
    ],
    baseUrl: "http://127.0.0.1:8000",
    pid: "31337",
    logFile: "/home/you/.hypernix/t1api/server.log",
    waiterServer: "http://127.0.0.1:8000",
  }),
  sysSnapshot: async (): Promise<SysSnapshot> => {
    const t = Date.now() / 1000;
    const cores = Array.from({ length: 16 }, (_, i) => 25 + 20 * Math.sin(t / 3 + i) + 10 * Math.random());
    return {
      cpu: cores.reduce((a, b) => a + b, 0) / cores.length,
      cores,
      cpuBrand: "AMD Ryzen 7 5800X 8-Core Processor",
      memUsed: (13.1 + Math.sin(t / 10)) * 2 ** 30,
      memTotal: 32 * 2 ** 30,
      swapUsed: 0.4 * 2 ** 30,
      swapTotal: 8 * 2 ** 30,
      load: [2.1, 1.8, 1.5],
      uptime: 302400,
      host: "forge",
      os: "Linux 24.04 Ubuntu",
      kernel: "6.8.0",
    };
  },
  scanModels: async (): Promise<ModelEntry[]> => [
    { path: "/home/you/.hypernix/models/HyperNix.3-mini", name: "HyperNix.3-mini", kind: "snapshot", size: 1.21e9, modified: 1759800000, root: "~/.hypernix/models" },
    { path: "/home/you/.hypernix/models/hypernix3-mini.q4_k_m.gguf", name: "hypernix3-mini.q4_k_m.gguf", kind: "gguf", size: 4.1e8, modified: 1759700000, root: "~/.hypernix/models" },
    { path: "/home/you/.hypernix/models/hypernix3-mini.IQ0.5_XXXL.gguf", name: "hypernix3-mini.IQ0.5_XXXL.gguf", kind: "gguf", size: 9.6e7, modified: 1759600000, root: "~/.hypernix/models" },
    { path: "/home/you/.hypernix/models/qwen3-8b/Qwen3-8B-Q5_K_M.gguf", name: "Qwen3-8B-Q5_K_M.gguf", kind: "gguf", size: 5.85e9, modified: 1759500000, root: "~/.hypernix/models" },
    { path: "/home/you/brewer_models/mine/model.pt", name: "model.pt", kind: "checkpoint", size: 1.3e8, modified: 1759400000, root: "~/brewer_models" },
  ],
};
