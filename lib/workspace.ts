import type { Analysis } from "./types";
export type ProtectionMode = "kage" | "kagami";
export interface RecentCheck {
  mode: ProtectionMode;
  tool: string;
  time: string;
  result: Analysis;
}
export function saveReport(
  mode: ProtectionMode,
  tool: string,
  result: Analysis,
) {
  sessionStorage.setItem(`scamurai-${mode}-result`, JSON.stringify(result));
  sessionStorage.setItem(
    `scamurai-${mode}-meta`,
    JSON.stringify({ tool, time: new Date().toISOString() }),
  );
  sessionStorage.setItem("scamurai-last-mode", mode);
  window.dispatchEvent(new Event("scamurai-workspace"));
}
export function readRecent(): RecentCheck[] {
  return (["kage", "kagami"] as ProtectionMode[])
    .flatMap((mode) => {
      try {
        const raw = sessionStorage.getItem(`scamurai-${mode}-result`);
        const meta = JSON.parse(
          sessionStorage.getItem(`scamurai-${mode}-meta`) || "null",
        );
        return raw && meta ? [{ mode, ...meta, result: JSON.parse(raw) }] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.time.localeCompare(a.time));
}
