/** Fire a one-time achievement event (deduplicated per browser profile; the server ignores repeats). */
export function fireEvent(name: string) {
  try {
    const key = `wt.ev.${name}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    fetch("/api/achievements", { method: "POST", body: JSON.stringify({ event: name }) }).catch(() => {});
  } catch {
    /* non-critical */
  }
}
