import { closeDatabase } from "@/db";

type ParentPort = {
  on(event: "message", listener: (message: { data?: unknown }) => void): void;
};

/**
 * The desktop host asks the server to stop so PGlite is closed (flushed) before the process exits.
 * Electron utility processes receive the request over the parent port; a plain Node parent (tests)
 * over its IPC channel. Node server runtime only.
 */
export function installShutdownHandler(): void {
  const stopGracefully = (data: unknown) => {
    if ((data as { type?: string } | undefined)?.type !== "shutdown") return;
    void (async () => {
      try {
        await closeDatabase();
        console.log("[chronos] database closed; server shutting down");
      } catch (error) {
        console.error("[chronos] database close failed", error);
      } finally {
        process.exit(0);
      }
    })();
  };
  const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
  if (parentPort) parentPort.on("message", (message) => stopGracefully(message?.data));
  else if (typeof process.send === "function") process.on("message", stopGracefully);
}
