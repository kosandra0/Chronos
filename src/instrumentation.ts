export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeDatabase } = await import("./db");
    await initializeDatabase();
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
