export type PerfMode = "performance" | "balanced" | "enhanced";

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
  theme: "dark" | "light" | "system";
  accent: "teal" | "sage" | "blue" | "violet" | "amber";
  font: "inter" | "segoe" | "system" | "mono";
  fontSize: number;
  density: "comfortable" | "compact";
  radius: number;
  sidebarCollapsed: boolean;
  animations: boolean;
  transparency: boolean;
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
  { href: "/heatmap", label: "Heat Map", icon: "heatmap" },
  { href: "/applications", label: "Applications", icon: "applications" },
  { href: "/sessions", label: "Sessions", icon: "sessions" },
  { href: "/timeline", label: "Timeline", icon: "timeline" },
  { href: "/achievements", label: "Achievements", icon: "achievements" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;
