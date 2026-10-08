import {
  Activity, AlertTriangle, ArrowUpRight, Atom, BadgeCheck, Binary, BookOpen, Bot, Boxes, Brain, Bug, Cable,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleDot, Clock, Combine, Command, CookingPot, Copy, Cpu,
  Database, Download, Eraser, ExternalLink, Fan, File, FileCog, FileText, Filter, Fingerprint, Flame,
  FlaskConical, FolderOpen, Gauge, Gem, Globe, Hammer, HardDrive, Info, KeyRound, Keyboard, Layers, Layers3,
  LayoutDashboard, Library, LineChart, ListChecks, Loader2, Lock, Map, Maximize2, MemoryStick, Merge,
  MessagesSquare, Microscope, Minimize2, Monitor, Moon, Network, OctagonX, Package, PanelBottom, Pause, Play,
  PlugZap, Plus, Power, PowerOff, Rabbit, Radio, RefreshCw, Rocket, RotateCw, Scale, ScanSearch, ScrollText,
  Search, Server, Settings, ShieldCheck, Shuffle, Skull, Smartphone, Snail, Sparkles, Square, SquareTerminal,
  Stethoscope, Sun, Tag, Telescope, Thermometer, Ticket, Timer, Trash2, Undo2, Unlock, Upload, UserPlus,
  Users, Wand2, Wifi, WifiOff, Workflow, Wrench, X, XCircle, Zap, type LucideProps,
} from "lucide-react";

const icons = {
  activity: Activity, alert: AlertTriangle, arrowUpRight: ArrowUpRight, atom: Atom, badge: BadgeCheck,
  binary: Binary, book: BookOpen, bot: Bot, boxes: Boxes, brain: Brain, bug: Bug, cable: Cable, check: Check,
  checkCircle: CheckCircle2, chevronDown: ChevronDown, chevronRight: ChevronRight, dot: CircleDot, clock: Clock,
  combine: Combine, command: Command, cooker: CookingPot, copy: Copy, cpu: Cpu, database: Database,
  download: Download, eraser: Eraser, external: ExternalLink, fan: Fan, file: File, fileCog: FileCog,
  fileText: FileText, filter: Filter, fingerprint: Fingerprint, flame: Flame, flask: FlaskConical,
  folder: FolderOpen, gauge: Gauge, gem: Gem, globe: Globe, hammer: Hammer, disk: HardDrive, info: Info,
  key: KeyRound, keyboard: Keyboard, layers: Layers, layers3: Layers3, dashboard: LayoutDashboard,
  library: Library, chart: LineChart, checklist: ListChecks, spinner: Loader2, lock: Lock, map: Map,
  maximize: Maximize2, memory: MemoryStick, merge: Merge, chat: MessagesSquare, microscope: Microscope,
  minimize: Minimize2, monitor: Monitor, moon: Moon, network: Network, stopHard: OctagonX, package: Package,
  panel: PanelBottom, pause: Pause, play: Play, plug: PlugZap, plus: Plus, power: Power, powerOff: PowerOff,
  rabbit: Rabbit, radio: Radio, refresh: RefreshCw, rocket: Rocket, restart: RotateCw, scale: Scale,
  scan: ScanSearch, scroll: ScrollText, search: Search, server: Server, settings: Settings,
  shield: ShieldCheck, shuffle: Shuffle, skull: Skull, phone: Smartphone, snail: Snail, sparkles: Sparkles,
  stop: Square, terminal: SquareTerminal, stethoscope: Stethoscope, sun: Sun, tag: Tag, telescope: Telescope,
  thermometer: Thermometer, ticket: Ticket, timer: Timer, trash: Trash2, undo: Undo2, unlock: Unlock,
  upload: Upload, userPlus: UserPlus, users: Users, wand: Wand2, wifi: Wifi, wifiOff: WifiOff,
  workflow: Workflow, wrench: Wrench, x: X, xCircle: XCircle, zap: Zap,
};

export type IconName = keyof typeof icons;

export function Icon({ name, size = 16, ...rest }: { name: IconName } & LucideProps) {
  const C = icons[name];
  return <C size={size} strokeWidth={1.75} aria-hidden {...rest} />;
}
