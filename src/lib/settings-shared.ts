export type PerfMode = "performance" | "balanced" | "enhanced";

export type ThemeId =
  | "dark" | "light" | "system"
  | "ocean" | "forest" | "lavender" | "mocha" | "slate" | "sunset"
  | "sand" | "rose" | "frost" | "mint";

import logoData from "./logos.json";

export type LogoId = "classic" | "lighthouse" | "keep" | "pagoda" | "observer";
export const LOGOS = logoData.map(({ id, label, desc }) => ({ id, label, desc })) as { id: LogoId; label: string; desc: string }[];

export type TitleBarId = "windows" | "mac" | "minimal" | "floating" | "classic";

export const TITLEBARS: { id: TitleBarId; label: string; desc: string }[] = [
  { id: "windows", label: "Windows", desc: "Controls on the right, title on the left" },
  { id: "mac", label: "macOS", desc: "Traffic lights on the left, centred title" },
  { id: "minimal", label: "Minimal", desc: "A slim, quiet bar" },
  { id: "floating", label: "Floating", desc: "No bar - glass controls float in the corner" },
  { id: "classic", label: "Classic", desc: "Centred title with soft rounded buttons" },
];

export const APP_NAME = "WatchTower";

export type FontId = "inter" | "segoe" | "system" | "mono" | "manrope" | "nunito" | "poppins" | "dmsans" | "lora" | "jetbrains";

/** swatch = [background, card, accent] used by the theme picker preview. */
export const THEMES: { id: ThemeId; label: string; mode: "dark" | "light" | "auto"; swatch: [string, string, string] }[] = [
  { id: "dark", label: "Classic Dark", mode: "dark", swatch: ["#101318", "#1c232c", "#4fb3a5"] },
  { id: "light", label: "Classic Light", mode: "light", swatch: ["#f5f7f8", "#ffffff", "#2b8f82"] },
  { id: "ocean", label: "Midnight Ocean", mode: "dark", swatch: ["#0d1b2a", "#152b44", "#6fb7e9"] },
  { id: "forest", label: "Forest Mist", mode: "dark", swatch: ["#0f1a16", "#192b24", "#8fcf9b"] },
  { id: "lavender", label: "Lavender Dusk", mode: "dark", swatch: ["#17141f", "#251f33", "#b8a4ee"] },
  { id: "mocha", label: "Warm Mocha", mode: "dark", swatch: ["#1a1512", "#2a221d", "#d6a77a"] },
  { id: "slate", label: "Slate Stone", mode: "dark", swatch: ["#14171b", "#20252b", "#8fa6bf"] },
  { id: "sunset", label: "Soft Sunset", mode: "dark", swatch: ["#1c1416", "#2d2024", "#f0a07a"] },
  { id: "sand", label: "Desert Sand", mode: "light", swatch: ["#f6f1e9", "#fffdf9", "#b8864f"] },
  { id: "rose", label: "Rose Quartz", mode: "light", swatch: ["#fbf3f4", "#ffffff", "#c76b82"] },
  { id: "frost", label: "Nordic Frost", mode: "light", swatch: ["#eef3f8", "#ffffff", "#4a86c5"] },
  { id: "mint", label: "Fresh Mint", mode: "light", swatch: ["#eef6f1", "#ffffff", "#3f9a76"] },
  { id: "system", label: "Follow System", mode: "auto", swatch: ["#101318", "#f5f7f8", "#4fb3a5"] },
];

export const FONTS: { id: FontId; label: string; sample: string }[] = [
  { id: "inter", label: "Inter", sample: "Inter, sans-serif" },
  { id: "manrope", label: "Manrope", sample: "Manrope, sans-serif" },
  { id: "nunito", label: "Nunito", sample: "Nunito, sans-serif" },
  { id: "poppins", label: "Poppins", sample: "Poppins, sans-serif" },
  { id: "dmsans", label: "DM Sans", sample: "'DM Sans', sans-serif" },
  { id: "lora", label: "Lora (serif)", sample: "Lora, serif" },
  { id: "jetbrains", label: "JetBrains Mono", sample: "'JetBrains Mono', monospace" },
  { id: "segoe", label: "Segoe UI", sample: "'Segoe UI', sans-serif" },
  { id: "system", label: "System UI", sample: "system-ui, sans-serif" },
  { id: "mono", label: "Monospace", sample: "Consolas, monospace" },
];

export type ChronosSettings = {
  // general
  landing: string;
  timezone: string;
  // monitoring
  monitoringEnabled: boolean;
  idleEnabled: boolean;
  idleThresholdMin: number;
  idleInTotal: boolean;
  showIdle: boolean;
  desktopTracking: boolean;
  trackSelf: boolean;
  trackTitles: boolean;
  // appearance
  theme: ThemeId;
  accent: "teal" | "sage" | "blue" | "violet" | "amber";
  font: FontId;
  fontSize: number;
  density: "comfortable" | "compact";
  radius: number;
  sidebarCollapsed: boolean;
  animations: boolean;
  transparency: boolean;
  animSpeed: "calm" | "normal" | "snappy";
  numberRoll: boolean;
  titleBar: TitleBarId;
  logo: LogoId;
  userName: string;
  launchAtStartup: boolean;
  startMinimized: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  confirmExit: boolean;
  shadow: "none" | "soft" | "deep";
  dailyGoalHours: number;
  // performance
  performanceMode: PerfMode;
  // backups
  backupEnabled: boolean;
  backupFrequency: "6h" | "12h" | "daily" | "weekly";
  backupDir: string;
  // notifications
  notifyMonitoring: boolean;
  notifyDaily: boolean;
  notifyWeekly: boolean;
  notifyAchievement: boolean;
  notifyBackupOk: boolean;
  notifyBackupFail: boolean;
  gamificationNotify: boolean;
};

export const DEFAULT_SETTINGS: ChronosSettings = {
  landing: "/",
  timezone: "",
  monitoringEnabled: true,
  idleEnabled: true,
  idleThresholdMin: 5,
  idleInTotal: false,
  showIdle: true,
  desktopTracking: true,
  trackSelf: true,
  trackTitles: false,
  theme: "dark",
  accent: "teal",
  font: "inter",
  fontSize: 14,
  density: "comfortable",
  radius: 14,
  sidebarCollapsed: false,
  animations: true,
  transparency: true,
  animSpeed: "normal",
  numberRoll: true,
  titleBar: "windows",
  logo: "classic",
  userName: "",
  launchAtStartup: false,
  startMinimized: false,
  minimizeToTray: false,
  closeToTray: false,
  confirmExit: false,
  shadow: "soft",
  dailyGoalHours: 6,
  performanceMode: "balanced",
  backupEnabled: true,
  backupFrequency: "daily",
  backupDir: "",
  notifyMonitoring: true,
  notifyDaily: true,
  notifyWeekly: true,
  notifyAchievement: true,
  notifyBackupOk: true,
  notifyBackupFail: true,
  gamificationNotify: true,
};

export const BACKUP_FREQ_MS: Record<ChronosSettings["backupFrequency"], number> = {
  "6h": 6 * 3600_000,
  "12h": 12 * 3600_000,
  daily: 24 * 3600_000,
  weekly: 7 * 24 * 3600_000,
};

export const NAV = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/statistics", label: "Statistics", icon: "statistics" },
  { href: "/applications", label: "Applications", icon: "applications" },
  { href: "/sessions", label: "Sessions", icon: "sessions" },
  { href: "/timeline", label: "Timeline", icon: "timeline" },
  { href: "/achievements", label: "Achievements", icon: "achievements" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;
