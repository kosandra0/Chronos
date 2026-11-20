/** Bridge exposed by desktop/preload.cjs (Electron). Undefined when running in a plain browser. */
export type DesktopApi = {
  platform: string;
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onMaximized(cb: (maximized: boolean) => void): () => void;
  resizeStart(dir: string): void;
  resizeEnd(): void;
  showInFolder(path: string): void;
  applyShell(prefs: { launchAtStartup: boolean; startMinimized: boolean; minimizeToTray: boolean; closeToTray: boolean; confirmExit: boolean }): void;
  onDownload(cb: (d: { state: "completed" | "cancelled" | "interrupted"; path: string; name: string }) => void): () => void;
  onNavigate(cb: (path: string) => void): () => void;
  openMain(path?: string): void;
  trayClose(): void;
  quit(): void;
  setLogo(id: string): void;
};

export function getDesktop(): DesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { watchtower?: DesktopApi }).watchtower;
}
