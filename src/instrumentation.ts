export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initializeDatabase } = await import("./db");
  const { installShutdownHandler } = await import("./lib/shutdown");
  installShutdownHandler();

  try {
    await initializeDatabase();
  } catch (error) {
    // Do not crash the server: /api/health reports the failure so the desktop host can show the
    // real cause and keep the original database files untouched.
    console.error("[chronos] database initialization failed", error);
  }

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
