import { bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Applications observed in the foreground (identified dynamically from process info). */
export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    identityKey: text("identity_key").notNull(),
    name: text("name").notNull(),
    executableName: text("executable_name").notNull(),
    executablePath: text("executable_path"),
    category: text("category").notNull().default("Other"),
    categoryOverridden: boolean("category_overridden").notNull().default(false),
    detectionStatus: text("detection_status").notNull().default("ok"),
    elevated: boolean("elevated").notNull().default(false),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("applications_identity_key_uq").on(t.identityKey)],
);

/**
 * One row per continuous activity. end_time is advanced by heartbeats while a session is open
 * (is_open = true) so that a crash can never invent activity beyond the last heartbeat.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    durationMs: bigint("duration_ms", { mode: "number" }).notNull().default(0),
    activityType: text("activity_type").notNull(), // app | desktop | idle | locked
    terminationReason: text("termination_reason"),
    windowTitle: text("window_title"),
    source: text("source").notNull().default("agent"), // agent | ui
    isOpen: boolean("is_open").notNull().default(false),
  },
  (t) => [
    index("sessions_start_idx").on(t.startTime),
    index("sessions_end_idx").on(t.endTime),
    index("sessions_app_start_idx").on(t.applicationId, t.startTime),
    index("sessions_open_idx").on(t.isOpen),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const achievements = pgTable("achievements", {
  id: text("id").primaryKey(),
  achievementType: text("achievement_type").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull(),
  xpAwarded: integer("xp_awarded").notNull(),
  seen: boolean("seen").notNull().default(false),
});

export const backupHistory = pgTable("backup_history", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(), // ok | failed
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  kind: text("kind").notNull().default("manual"), // manual | scheduled | pre-import | pre-restore
  message: text("message"),
});
