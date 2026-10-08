import type {
  ComboField, Field, ListField, NumberField, Option, PathField, SelectField, TextField, ToggleField, TristateField, Values,
} from "./types";

type Extra<T> = Partial<Omit<T, "kind" | "key" | "label">>;

export const text = (key: string, flag: string | undefined, label: string, x: Extra<TextField> = {}): TextField => ({
  kind: "text", key, flag, label, ...x,
});
export const secret = (key: string, flag: string, label: string, x: Extra<TextField> = {}): TextField => ({
  kind: "secret", key, flag, label, ...x,
});
export const area = (key: string, flag: string | undefined, label: string, x: Extra<TextField> = {}): TextField => ({
  kind: "textarea", key, flag, label, wide: true, ...x,
});
export const num = (key: string, flag: string | undefined, label: string, x: Extra<NumberField> = {}): NumberField => ({
  kind: "number", key, flag, label, ...x,
});
export const pick = (key: string, flag: string | undefined, label: string, options: (string | Option)[], x: Extra<SelectField> = {}): SelectField => ({
  kind: "select", key, flag, label, options: options.map(opt), ...x,
});
export const combo = (key: string, flag: string | undefined, label: string, options: (string | Option)[], x: Extra<ComboField> = {}): ComboField => ({
  kind: "combo", key, flag, label, options: options.map(opt), ...x,
});
export const toggle = (key: string, flag: string, label: string, x: Extra<ToggleField> = {}): ToggleField => ({
  kind: "toggle", key, flag, label, ...x,
});
export const tri = (key: string, on: string, off: string, label: string, x: Extra<TristateField> = {}): TristateField => ({
  kind: "tristate", key, on, off, label, default: "default", ...x,
});
export const path = (key: string, flag: string | undefined, label: string, mode: PathField["mode"], x: Extra<PathField> = {}): PathField => ({
  kind: "path", key, flag, label, mode, ...x,
});
export const list = (key: string, flag: string | undefined, label: string, mode: ListField["mode"], x: Extra<ListField> = {}): ListField => ({
  kind: "list", key, flag, label, mode, ...x,
});

/** A positional that is the first word after the subcommand. */
export const action = (options: (string | Option)[], label = "Action", x: Extra<SelectField> = {}): SelectField =>
  pick("action", undefined, label, options, { positional: true, required: true, default: opt(options[0]).value, ...x });

export function opt(o: string | Option): Option {
  return typeof o === "string" ? { value: o } : o;
}

export const is = (key: string, ...values: string[]) => (v: Values) => values.includes(String(v[key] ?? ""));
export const on = (key: string) => (v: Values) => v[key] === true;

// ---------------------------------------------------------------------------
// Option lists, taken from the tools' own --help and --list-tiers output.

/** `hypernix all --quants` / `hypernix quantize --type`. */
export const QUANT_ALIASES = ["fp32", "fp16", "f32", "f16", "q4_k_m", "q4km", "q5_k_m", "q5km", "q6", "q6_k", "q8", "q8_0"];

export const LLAMA_TIERS = [
  "Q8_0", "Q6_K", "Q5_K_M", "Q5_K_S", "Q5_1", "Q5_0", "Q4_K_M", "Q4_K_S", "Q4_1", "Q4_0",
  "Q3_K_L", "Q3_K_M", "Q3_K_S", "Q2_K", "Q2_K_S", "FP16", "BF16", "FP32",
];
export const HNX_HYBRIDS = ["Q8_K", "hnx_Q6_H_k", "hnx_Q6_H_4", "hnx_Q6_H_2", "q6h", "q6h4", "q6h2"];
export const HNX_TIERS = [
  "INT8", "FP8", "INT4", "INT3", "INT2", "FP2", "HNX_1375BIT", "INT1", "IQ0.9_L", "IQ0.75_M", "IQ0.5_XXXL", "IQ0.25_UXL",
];
export const ALL_TIERS: Option[] = [
  ...LLAMA_TIERS.map((value) => ({ value, label: `${value} · llama.cpp` })),
  ...HNX_HYBRIDS.map((value) => ({ value, label: `${value} · HyperNix hybrid` })),
  ...HNX_TIERS.map((value) => ({ value, label: `${value} · HyperNix tier` })),
];
export const STEAMROLLER_TIERS = [
  "Q8_0", "Q3_K_L", "IQ1_M", "IQ0.9_L", "IQ0.75_M", "IQ0.5_XXXL", "IQ0.25_UXL", "INT1", "HNX_1375BIT", "FP2", "INT4", "INT8", "INT2", "INT3", "FP8",
];

export const DTYPES = ["float32", "float16", "bfloat16"];
export const HNX_DEVICES = ["auto", "cpu", "cuda", "cuda:1", "mps", "xpu"];
export const DEFAULT_REPO = "ray0rf1re/hyper-nix.1";

export const KNOWN_MODELS = [
  "hyper-nix.1", "hypernix", "nano-nano-v4", "nano-mini-6.99-v2", "nano-nano-927-v3",
  "nix", "nix2.5", "nix2.6", "nix2.7", "llama-3.1-8b-instruct", "llama-3.2-1b", "llama-3.2-3b",
  "qwen3-0.6b", "qwen3-8b", "qwen3.5-0.8b", "qwen3.5-2b", "qwen3.5-4b", "qwen3.5-9b", "qwen3.6-35b-a3b",
  "gemma-3-1b", "gemma-3-4b", "gemma-4-e2b", "gemma-4-e4b", "phi-3.5-mini", "phi-4",
  "deepseek-r1-distill-qwen-7b", "glm-4-9b-chat", "mistral-7b-instruct", "gpt-oss-20b",
  "ray0rf1re/HyperNix.3-mini", "ray0rf1re/hyper-Nix.2",
];

export const ARCHES = [
  "hypernix", "llama", "llama3", "llama3.1", "llama3.2", "llama3.3", "llama4", "qwen2", "qwen2.5", "qwen3", "qwen3.5",
  "qwen3.6", "gemma", "gemma2", "gemma3", "gemma4", "mistral", "phi3", "phi4", "glm4", "glm5", "glm5.1", "deepseek",
  "deepseek-r1", "nemotron", "gpt-oss", "nix", "nix2",
];

/** Sampling fields shared by chat, generate and oven. */
export function samplingFields(defaults: { maxNew: string; temperature: string; topK: string }): Field[] {
  return [
    num("maxNew", "--max-new-tokens", "Max new tokens", { placeholder: defaults.maxNew, min: 1 }),
    num("temperature", "--temperature", "Temperature", { placeholder: defaults.temperature, min: 0, max: 2, step: 0.05 }),
    num("topK", "--top-k", "Top-k", { placeholder: defaults.topK, min: 0, advanced: true }),
    num("topP", "--top-p", "Top-p", { placeholder: "0.95", min: 0, max: 1, step: 0.01, advanced: true }),
    num("seed", "--seed", "Seed", { advanced: true }),
  ];
}

/** The -I/-K/-P overrides every `waiter` subcommand accepts. */
export const WAITER_OVERRIDES: Field[] = [
  text("server", "-I", "Server", { advanced: true, placeholder: "saved config", help: "IP, Tailscale IP or URL, for this call only." }),
  secret("key", "-K", "Key", { advanced: true, placeholder: "saved config" }),
  num("port", "-P", "Port", { advanced: true }),
  path("configFile", "-F", "Config file", "file", { advanced: true }),
  toggle("json", "--json", "Raw JSON", { advanced: true }),
];
