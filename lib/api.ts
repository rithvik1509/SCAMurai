import { config } from "./config";
import { mockAnalysis, mockRescue } from "./mock-data";
import type {
  Analysis,
  AnalyzeRequest,
  Incident,
  RescueResponse,
} from "./types";
export class ApiError extends Error {}
async function request(path: string, body?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout);
  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok)
      throw new ApiError(`Service returned ${response.status}. Please retry.`);
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? "The request timed out. Please retry."
        : "Cannot reach the analysis service. Check the backend connection and retry.",
    );
  } finally {
    clearTimeout(timer);
  }
}
function validateAnalysis(value: unknown, input: string): Analysis {
  const response = value as {
    risk_score?: unknown;
    risk_level?: unknown;
    category?: unknown;
    summary?: unknown;
    signals?: unknown;
    recommended_actions?: unknown;
    limitations?: { notes?: unknown };
  } | null;
  const levels: Record<string, Analysis["level"]> = {
    unknown: "UNKNOWN",
    low: "LOW",
    moderate: "MEDIUM",
    high: "HIGH",
    critical: "HIGH",
  };
  const signals = response?.signals as Array<Record<string, unknown>> | undefined;
  const actions = response?.recommended_actions as
    | Array<Record<string, unknown>>
    | undefined;
  const limitations = response?.limitations?.notes;
  if (
    !response ||
    typeof response.risk_score !== "number" ||
    response.risk_score < 0 ||
    response.risk_score > 100 ||
    typeof response.risk_level !== "string" ||
    !levels[response.risk_level] ||
    typeof response.category !== "string" ||
    typeof response.summary !== "string" ||
    !Array.isArray(signals) ||
    !signals.every(
      (signal) =>
        typeof signal.title === "string" &&
        typeof signal.explanation === "string" &&
        Array.isArray(signal.evidence) &&
        signal.evidence.every((evidence) => typeof evidence === "string"),
    ) ||
    !Array.isArray(actions) ||
    !actions.every((action) => typeof action.action === "string") ||
    !Array.isArray(limitations) ||
    !limitations.every((note) => typeof note === "string")
  )
    throw new ApiError(
      "The backend returned an unsupported response. Check the API contract.",
    );

  return {
    demo: false,
    input,
    score: response.risk_score,
    level: levels[response.risk_level as string],
    category:
      response.category === "none"
        ? "No clear indicators"
        : (response.category as string)
            .split("_")
            .map((word) => word[0].toUpperCase() + word.slice(1))
            .join(" "),
    explanation: response.summary,
    signals: signals.map((signal) => ({
      name: signal.title as string,
      explanation: signal.explanation as string,
      evidence: signal.evidence as string[],
    })),
    actions: actions.map((action) => action.action as string),
    limitations: limitations as string[],
  };
}
export async function analyze(input: AnalyzeRequest): Promise<Analysis> {
  if (config.demo) {
    await new Promise((r) => setTimeout(r, 650));
    return mockAnalysis(input);
  }
  if (input.mode === "crypto")
    throw new ApiError(
      "Live crypto transaction analysis is not available yet. The backend currently supports message and URL analysis.",
    );
  return validateAnalysis(
    await request("/api/v1/analyze", {
      type: "text",
      content: input.content,
      language: "en",
    }),
    input.content,
  );
}
export async function compareIntent(input: AnalyzeRequest): Promise<Analysis> {
  if (config.demo) return analyze(input);
  throw new ApiError(
    "Live Promise vs. Action analysis is not available yet in the backend.",
  );
}
export async function rescue(incident: Incident): Promise<RescueResponse> {
  if (config.demo) return mockRescue(incident);
  throw new ApiError(
    "Live rescue guidance is not available yet in the backend. Enable demo mode to view sample guidance.",
  );
}
export async function health(): Promise<boolean> {
  try {
    await request("/health");
    return true;
  } catch {
    return false;
  }
}
