import type { IconName } from "../components/Icon";

/** A form value: text, a switch, or a list of strings. */
export type Value = string | boolean | string[] | undefined;
export type Values = Record<string, Value>;

export interface Option {
  value: string;
  label?: string;
}

interface FieldBase {
  key: string;
  label: string;
  /** The flag this field becomes (`--repo-id`). Omitted for positionals. */
  flag?: string;
  positional?: boolean;
  /**
   * An option of the parent parser (`runner --json status`): argparse only
   * accepts it before the subcommand word, so it is emitted first.
   */
  before?: boolean;
  help?: string;
  required?: boolean;
  /** Folded under "More options". */
  advanced?: boolean;
  placeholder?: string;
  default?: Value;
  /** Hidden (and left out of the command) unless this holds. */
  showIf?: (values: Values) => boolean;
  /** Take the full width of the form grid. */
  wide?: boolean;
}

export interface TextField extends FieldBase {
  kind: "text" | "secret" | "textarea";
}
export interface NumberField extends FieldBase {
  kind: "number";
  min?: number;
  max?: number;
  step?: number;
}
export interface SelectField extends FieldBase {
  kind: "select";
  options: Option[];
}
/** Free text with suggestions. */
export interface ComboField extends FieldBase {
  kind: "combo";
  options: Option[];
}
export interface ToggleField extends FieldBase {
  kind: "toggle";
  flag: string;
}
/** A `--x / --no-x` pair: leave it to the tool, force on, or force off. */
export interface TristateField extends FieldBase {
  kind: "tristate";
  on: string;
  off: string;
}
export interface PathField extends FieldBase {
  kind: "path";
  mode: "file" | "dir" | "save";
  extensions?: string[];
}
export interface ListField extends FieldBase {
  kind: "list";
  /** How several values become arguments. */
  mode: "space" | "repeat" | "comma";
  options?: Option[];
  pathMode?: "file" | "dir";
}

export type Field =
  | TextField
  | NumberField
  | SelectField
  | ComboField
  | ToggleField
  | TristateField
  | PathField
  | ListField;

export interface CommandSpec {
  id: string;
  title: string;
  summary: string;
  icon: IconName;
  /** A console script name the backend knows how to resolve. */
  program: string;
  /** Subcommand path in front of the fields (`["train", "run"]`). */
  base: string[];
  fields: Field[];
  /** Full-screen terminal program: give it a taller console. */
  tui?: boolean;
  /** Ask before running, with this explanation. */
  confirm?: string;
  /** Wiki or README anchor for the "Docs" link. */
  doc?: string;
  /** Extra words the command palette matches on. */
  keywords?: string;
}

export interface Section {
  id: string;
  title: string;
  icon: IconName;
  blurb: string;
  groups: { title: string; commands: CommandSpec[] }[];
}
