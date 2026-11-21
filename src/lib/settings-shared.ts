export type PerfMode = "performance" | "balanced" | "enhanced";

export type ThemeId =
  | "dark" | "light" | "system"
  | "ocean" | "forest" | "lavender" | "mocha" | "slate" | "sunset"
  | "sand" | "rose" | "frost" | "mint"
  | "custom"
  | (string & {}); // the twenty extra dark themes (themes.json) and any future ones

import logoData from "./logos.json";
import extraThemes from "./themes.json";

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

export type FontId =
  | "inter" | "segoe" | "system" | "mono" | "manrope" | "nunito" | "poppins" | "dmsans" | "lora" | "jetbrains"
  | "times" | "georgia" | "cambria" | "palatino" | "garamond" | "book" | "calibri" | "arial" | "verdana" | "tahoma" | "trebuchet" | "cascadia"
  | "plex" | "merriweather" | "sourceserif" | "playfair";

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
  ...(extraThemes as { id: ThemeId; label: string; mode: "dark"; swatch: [string, string, string] }[]),
  { id: "system", label: "Follow System", mode: "auto", swatch: ["#101318", "#f5f7f8", "#4fb3a5"] },
];

/** The user-made gradient theme (id "custom"). */
export const CUSTOM_THEME_SWATCH: [string, string, string] = ["#1b2a41", "#324a5f", "#7fd1ae"];
export const GRADIENT_PRESETS: { label: string; c1: string; c2: string; c3: string; three: boolean; angle: number; accent: string }[] = [
  { label: "Deep Sea", c1: "#0b1f2e", c2: "#14455a", c3: "#1d6b73", three: false, angle: 150, accent: "#7fd1c4" },
  { label: "Twilight", c1: "#1a1433", c2: "#3a2a63", c3: "#6b3f7a", three: true, angle: 140, accent: "#c4a8f0" },
  { label: "Ember Glow", c1: "#1d1210", c2: "#3a1f1a", c3: "#5c2e22", three: false, angle: 160, accent: "#f0a27c" },
  { label: "Pine Dawn", c1: "#0c1a14", c2: "#16352a", c3: "#2d5a45", three: true, angle: 135, accent: "#9be0b0" },
  { label: "Aurora", c1: "#0a1a2a", c2: "#173a52", c3: "#2f6a5a", three: true, angle: 120, accent: "#7fe0c0" },
  { label: "Rose Dusk", c1: "#1c1219", c2: "#3b2133", c3: "#5a2f45", three: false, angle: 145, accent: "#f0a0be" },
  { label: "Slate Mist", c1: "#12161b", c2: "#26303b", c3: "#3a4a5c", three: false, angle: 170, accent: "#9bb6d3" },
  { label: "Soft Daylight", c1: "#eef3f8", c2: "#dfe9f5", c3: "#cfe0f2", three: false, angle: 135, accent: "#3f7bbf" },
];

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex) ?? /^#([0-9a-f]{6})$/i.exec("#808080");
  const n = parseInt(m![1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}
function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Turns the user's gradient settings into CSS variables for the "custom" theme. Surfaces are derived from the
 * gradient's average colour and text switches between light and dark by contrast, so any choice stays readable.
 */
export function customThemeVars(s: Pick<ChronosSettings, "customColor1" | "customColor2" | "customColor3" | "customThree" | "customAngle" | "customAccent">): Record<string, string> {
  const stops = s.customThree ? [s.customColor1, s.customColor2, s.customColor3] : [s.customColor1, s.customColor2];
  const avg = stops.reduce((acc, c) => { const [r, g, b] = hexToRgb(c); return [acc[0] + r / stops.length, acc[1] + g / stops.length, acc[2] + b / stops.length]; }, [0, 0, 0]);
  const base = rgbToHex(avg[0], avg[1], avg[2]);
  const light = luminance(base) > 0.42;
  const fg = light ? "#10161d" : "#f4f6f9";
  const accent = s.customAccent;
  const accentInk = luminance(accent) > 0.5 ? "#101418" : "#ffffff";
  return {
    "--bg": mix(base, light ? "#ffffff" : "#000000", light ? 0.35 : 0.3),
    "--bg2": base,
    "--card": light ? mix(base, "#ffffff", 0.55) : mix(base, "#ffffff", 0.07),
    "--elev": light ? mix(base, "#ffffff", 0.3) : mix(base, "#ffffff", 0.12),
    "--text": fg,
    "--text2": mix(fg, base, 0.38),
    "--text3": mix(fg, base, 0.58),
    "--accent": accent,
    "--accent-ink": accentInk,
    "--border": light ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.08)",
    "--border-strong": light ? "rgba(0,0,0,0.17)" : "rgba(255,255,255,0.16)",
    "--shadow": light ? "0 1px 2px rgba(40,40,40,0.05), 0 10px 26px -16px rgba(40,40,40,0.25)" : "0 1px 0 rgba(255,255,255,0.03) inset, 0 10px 28px -14px rgba(0,0,0,0.6)",
    "--glass": light ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.25)",
    "--hover": light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
    "--heat0": light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
    "--custom-gradient": `linear-gradient(${Math.round(s.customAngle)}deg, ${stops.join(", ")})`,
    "--scheme": light ? "light" : "dark",
  };
}

export const FONTS: { id: FontId; label: string; sample: string }[] = [
  { id: "times", label: "Times New Roman", sample: "'Times New Roman', Times, serif" },
  { id: "georgia", label: "Georgia", sample: "Georgia, 'Times New Roman', serif" },
  { id: "cambria", label: "Cambria", sample: "Cambria, Georgia, serif" },
  { id: "palatino", label: "Palatino Linotype", sample: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { id: "garamond", label: "Garamond", sample: "Garamond, 'Times New Roman', serif" },
  { id: "book", label: "Book Antiqua", sample: "'Book Antiqua', Palatino, serif" },
  { id: "merriweather", label: "Merriweather", sample: "Merriweather, Georgia, serif" },
  { id: "sourceserif", label: "Source Serif", sample: "'Source Serif 4', Georgia, serif" },
  { id: "playfair", label: "Playfair Display", sample: "'Playfair Display', Georgia, serif" },
  { id: "calibri", label: "Calibri", sample: "Calibri, 'Segoe UI', sans-serif" },
  { id: "arial", label: "Arial", sample: "Arial, Helvetica, sans-serif" },
  { id: "verdana", label: "Verdana", sample: "Verdana, Geneva, sans-serif" },
  { id: "tahoma", label: "Tahoma", sample: "Tahoma, 'Segoe UI', sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", sample: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { id: "plex", label: "IBM Plex Sans", sample: "'IBM Plex Sans', 'Segoe UI', sans-serif" },
  { id: "cascadia", label: "Cascadia Code", sample: "'Cascadia Code', Consolas, monospace" },
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
  customColor1: string;
  customColor2: string;
  customColor3: string;
  customThree: boolean;
  customAngle: number;
  customAccent: string;
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
  // 2.0: limits, reports, productivity, scheduling, updates
  limitNotifications: boolean;
  weeklyReportEnabled: boolean;
  weeklyReportDay: number; // 0 = Sunday .. 6 = Saturday
  weeklyReportTime: string; // HH:MM local
  productivityGoalHours: number;
  currency: string;
  themeScheduleEnabled: boolean;
  themeDay: string;
  themeNight: string;
  themeDayStart: string;
  themeNightStart: string;
  updateAutoCheck: boolean;
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
  customColor1: "#12202f",
  customColor2: "#2c4a5e",
  customColor3: "#3f6f6a",
  customThree: false,
  customAngle: 140,
  customAccent: "#7fd1ae",
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
  limitNotifications: true,
  weeklyReportEnabled: true,
  weeklyReportDay: 1,
  weeklyReportTime: "09:00",
  productivityGoalHours: 4,
  currency: "USD",
  themeScheduleEnabled: false,
  themeDay: "light",
  themeNight: "obsidian",
  themeDayStart: "07:00",
  themeNightStart: "19:00",
  updateAutoCheck: true,
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
  { href: "/focus", label: "Focus", icon: "focus" },
  { href: "/limits", label: "Limits", icon: "limits" },
  { href: "/productivity", label: "Productivity", icon: "productivity" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/achievements", label: "Achievements", icon: "achievements" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;
