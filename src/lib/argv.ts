import type { CommandSpec, Field, Value, Values } from "../catalog/types";

/** Split a free-form argument string the way a POSIX shell would. */
export function shellSplit(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < input.length) cur += input[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === "\\" && i + 1 < input.length) {
      cur += input[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

export function shellQuote(s: string): string {
  if (s !== "" && /^[A-Za-z0-9_\-./=:,+@%]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function shellJoin(argv: string[]): string {
  return argv.map(shellQuote).join(" ");
}

function asList(v: Value): string[] {
  if (Array.isArray(v)) return v.map((x) => x.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  return [];
}

export function fieldVisible(f: Field, values: Values): boolean {
  return !f.showIf || f.showIf(values);
}

export function valueOf(f: Field, values: Values): Value {
  return values[f.key] !== undefined ? values[f.key] : f.default;
}

/** Fields that are required, visible, and empty. */
export function missingRequired(spec: CommandSpec, values: Values): Field[] {
  return spec.fields.filter((f) => {
    if (!f.required || !fieldVisible(f, values)) return false;
    const v = valueOf(f, values);
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === "" || v === false;
  });
}

/**
 * The arguments a form produces, after the program name.
 *
 * Positionals go straight after the subcommand path and options after
 * them: argparse takes either order, and an option with `nargs="*"`
 * (`--quants a b c`) placed before a positional would swallow it. The
 * exception is a parent parser's own options, marked `before`.
 */
export function buildArgs(spec: CommandSpec, values: Values, extra = ""): string[] {
  const before: string[] = [];
  const positionals: string[] = [];
  const after: string[] = [];
  for (const f of spec.fields) {
    if (!fieldVisible(f, values)) continue;
    const v = valueOf(f, values);
    const options = f.before ? before : after;
    switch (f.kind) {
      case "toggle":
        if (v === true) options.push(f.flag);
        break;
      case "tristate":
        if (v === "on") options.push(f.on);
        else if (v === "off") options.push(f.off);
        break;
      case "list": {
        const items = asList(v);
        if (!items.length) break;
        if (f.positional) positionals.push(...items);
        else if (f.mode === "repeat") items.forEach((x) => options.push(f.flag!, x));
        else if (f.mode === "comma") options.push(f.flag!, items.join(","));
        else options.push(f.flag!, ...items);
        break;
      }
      default: {
        const s = typeof v === "string" ? v.trim() : v === true ? "true" : "";
        if (!s) break;
        if (f.positional) positionals.push(s);
        else if (f.flag) options.push(f.flag, s);
      }
    }
  }
  return [...spec.base, ...before, ...positionals, ...after, ...shellSplit(extra)];
}
