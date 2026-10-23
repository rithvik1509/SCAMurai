import { statusLabels, type Investigation } from "./types";
import { validateInvestigation } from "./api";
export interface HistoryItem {
  id: string;
  targetUrl: string;
  demo: boolean;
  status: Investigation["status"];
  openedAt: string;
}
const historyKey = "scamurai-yokai-history";
export function readHistory(): HistoryItem[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(historyKey) || "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (item) =>
              item &&
              typeof item.id === "string" &&
              typeof item.targetUrl === "string" &&
              typeof item.demo === "boolean" &&
              Object.hasOwn(statusLabels, item.status) &&
              typeof item.openedAt === "string" &&
              Number.isFinite(Date.parse(item.openedAt)),
          )
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
export function storeInvestigation(job: Investigation) {
  const history = readHistory();
  const previous = history.find((item) => item.id === job.id);
  const next = [
    {
      id: job.id,
      targetUrl: job.targetUrl,
      demo: job.demo,
      status: job.status,
      openedAt: previous?.openedAt || new Date().toISOString(),
    },
    ...history.filter((item) => item.id !== job.id),
  ].slice(0, 8);
  sessionStorage.setItem(`scamurai-yokai-job-${job.id}`, JSON.stringify(job));
  sessionStorage.setItem(historyKey, JSON.stringify(next));
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("scamurai-workspace"));
  history
    .filter((item) => !next.some((n) => n.id === item.id))
    .forEach((item) =>
      sessionStorage.removeItem(`scamurai-yokai-job-${item.id}`),
    );
}
export function readInvestigation(id: string): Investigation | null {
  try {
    const value = sessionStorage.getItem(`scamurai-yokai-job-${id}`);
    return value ? validateInvestigation(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
