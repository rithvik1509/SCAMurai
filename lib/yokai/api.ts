import { z } from "zod";
import { config } from "../config";
import type {
  Investigation,
  InvestigationCapabilities,
  InvestigationRequest,
} from "./types";

export const yokaiApiConfig = {
  enabled: process.env.NEXT_PUBLIC_YOKAI_API_ENABLED === "true",
  capabilities:
    process.env.NEXT_PUBLIC_YOKAI_CAPABILITIES_PATH ||
    "/api/v1/kage/capabilities",
  investigations:
    process.env.NEXT_PUBLIC_YOKAI_INVESTIGATIONS_PATH ||
    "/api/v1/kage/investigations",
};
const status = z.enum([
  "queued",
  "initializing",
  "loading",
  "collecting",
  "comparing",
  "completed",
  "failed",
  "cancelled",
  "unsupported",
]);
const profile = z.enum(["desktop", "mobile", "returning"]);
const tone = z.enum(["normal", "difference", "sensitive", "unavailable"]);
const text = z.string().max(12000);
const refs = z.array(z.string()).max(100);
const timestamp = z
  .string()
  .refine((v) => Number.isFinite(Date.parse(v)), "Invalid timestamp");
const capture = z.object({
  id: z.string().min(1),
  profileId: profile,
  label: text,
  finalUrl: text,
  title: text,
  viewport: z.object({
    width: z.number().int().positive().max(16000),
    height: z.number().int().positive().max(16000),
  }),
  userAgent: text,
  cookieState: text,
  availability: z.enum(["complete", "partial", "unavailable"]),
  notes: z.array(text),
  screenshot: z
    .object({ url: text, kind: z.enum(["capture", "illustration"]) })
    .nullable(),
  redirects: z
    .array(
      z.object({
        from: text,
        to: text,
        status: z.number().int().min(300).max(399),
      }),
    )
    .max(100),
  structure: z
    .object({
      headings: z.array(text),
      linkCount: z.number().int().nonnegative(),
      language: text,
      textBlocks: z.array(text).max(200).optional(),
      actionLabels: z.array(text).max(100).optional(),
    })
    .nullable(),
  forms: z
    .array(
      z.object({
        id: z.string(),
        label: text,
        action: text,
        method: text,
        fields: z.array(text),
        sensitive: z.boolean(),
      }),
    )
    .max(200),
  network: z
    .array(z.object({ id: z.string(), url: text, method: text, kind: text }))
    .max(1000),
});
const result = z
  .object({
    captures: z.array(capture).max(20),
    findings: z.array(
      z.object({
        id: z.string(),
        title: text,
        explanation: text,
        tone,
        severity: z.enum(["informational", "low", "medium", "high"]).optional(),
        confidence: text.optional(),
        evidenceIds: refs,
      }),
    ),
    riskIndicators: z.array(text),
    limitations: z.array(text),
    recommendations: z.array(text),
    graph: z.object({
      nodes: z
        .array(
          z.object({
            id: z.string(),
            kind: z.enum(["profile", "url", "form", "network"]),
            label: text,
            description: text,
            tone,
            evidenceIds: refs,
            profileId: profile.optional(),
            position: z.object({
              x: z.number().finite(),
              y: z.number().finite(),
            }),
          }),
        )
        .max(2000),
      edges: z
        .array(
          z.object({
            id: z.string(),
            source: z.string(),
            target: z.string(),
            label: text,
            tone,
            evidenceIds: refs,
          }),
        )
        .max(5000),
    }),
    counterfactuals: z.array(
      z.object({
        id: z.string(),
        title: text,
        baseline: text,
        changedVariable: text,
        observedResult: text,
        finding: text,
        conclusion: z.enum(["controlled", "correlation", "inconclusive"]),
        evidenceIds: refs,
      }),
    ),
  })
  .superRefine((value, context) => {
    const nodes = new Set(value.graph.nodes.map((n) => n.id));
    const captures = new Set(value.captures.map((c) => c.id));
    if (
      nodes.size !== value.graph.nodes.length ||
      captures.size !== value.captures.length ||
      new Set(value.graph.edges.map((e) => e.id)).size !==
        value.graph.edges.length
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate evidence identifiers",
      });
    if (
      value.graph.edges.some(
        (e) => !nodes.has(e.source) || !nodes.has(e.target),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Graph contains an unverified relationship",
      });
    if (
      [
        ...value.graph.nodes,
        ...value.graph.edges,
        ...value.findings,
        ...value.counterfactuals,
      ].some((item) => item.evidenceIds.some((id) => !captures.has(id)))
    )
      context.addIssue({
        code: "custom",
        message: "Missing evidence reference",
      });
  });
const job = z.object({
  id: z.string().min(1).max(200),
  demo: z.boolean(),
  targetUrl: text,
  profiles: z.array(profile).min(1).max(3),
  status,
  createdAt: timestamp,
  updatedAt: timestamp,
  events: z.array(z.object({ status, at: timestamp, message: text })).max(200),
  error: text.optional(),
  result: result.optional(),
});
const capabilities = z.object({
  available: z.boolean(),
  profiles: z.array(profile),
  allowedOrigins: z.array(z.string().url()),
  authorizationPolicy: text,
  cancellation: z.boolean(),
  publicTargets: z.boolean().optional(),
});
export class YokaiApiError extends Error {}

export function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function imageUrl(value: string, demo: boolean) {
  if (demo && /^\/yokai\/[a-z-]+\.svg$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value, config.apiUrl);
  } catch {
    throw new YokaiApiError(
      "The evidence service returned an invalid screenshot location.",
    );
  }
  if (
    !safeExternalUrl(url.href) ||
    url.origin !== new URL(config.apiUrl).origin
  )
    throw new YokaiApiError(
      "A screenshot location is not supported by the evidence service.",
    );
  return url.href;
}
export function validateInvestigation(
  value: unknown,
  live = false,
): Investigation {
  const parsed = job.safeParse(value);
  if (!parsed.success || (live && parsed.data.demo))
    throw new YokaiApiError(
      "The investigation response could not be read. Its evidence contract is unsupported.",
    );
  const investigation = parsed.data;
  if (!safeExternalUrl(investigation.targetUrl))
    throw new YokaiApiError(
      "The investigation target is not a valid HTTP or HTTPS URL.",
    );
  if (investigation.result)
    investigation.result.captures = investigation.result.captures.map((c) => ({
      ...c,
      screenshot: c.screenshot
        ? {
            ...c.screenshot,
            url: imageUrl(c.screenshot.url, investigation.demo),
          }
        : null,
    }));
  return investigation;
}
async function request(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<unknown> {
  if (!yokaiApiConfig.enabled)
    throw new YokaiApiError(
      "Website investigations are not available on the connected service yet.",
    );
  const timeout = AbortSignal.timeout(config.timeout);
  try {
    const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([signal, timeout]),
      cache: "no-store",
    });
    if (!response.ok)
      throw new YokaiApiError(
        response.status === 403
          ? "This target is not permitted by the investigation service. Check its authorization or allowlist policy."
          : response.status === 404
            ? "This investigation or capability is unavailable on the connected service."
            : response.status === 422
              ? "The service rejected these target or profile settings. Review the investigation inputs."
              : `The investigation service returned ${response.status}. Retry when it is available.`,
      );
    return await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof YokaiApiError) throw error;
    throw new YokaiApiError(
      timeout.aborted
        ? "The investigation request timed out. You can retry without creating a new result."
        : "Could not read the investigation service. Check the connection and retry.",
    );
  }
}
export async function getCapabilities(
  signal: AbortSignal,
): Promise<InvestigationCapabilities> {
  if (!yokaiApiConfig.enabled)
    return {
      available: false,
      profiles: [],
      allowedOrigins: [],
      cancellation: false,
      authorizationPolicy:
        "Website investigations are not available on this service yet. Explore the labeled examples to preview YŌKAI.",
    };
  const parsed = capabilities.safeParse(
    await request(yokaiApiConfig.capabilities, signal),
  );
  if (!parsed.success)
    throw new YokaiApiError(
      "The service's investigation capabilities could not be read.",
    );
  return parsed.data;
}
export async function startInvestigation(
  input: InvestigationRequest,
  signal: AbortSignal,
) {
  return validateInvestigation(
    await request(yokaiApiConfig.investigations, signal, input),
    true,
  );
}
export async function getInvestigation(id: string, signal: AbortSignal) {
  const path = `${yokaiApiConfig.investigations}/${encodeURIComponent(id)}`;
  const snapshot = validateInvestigation(await request(path, signal), true);
  if (snapshot.id !== id)
    throw new YokaiApiError(
      "The service returned a different investigation. Retry the requested result.",
    );
  if (snapshot.status === "completed" && !snapshot.result) {
    const [captures, comparison] = await Promise.all([
      request(`${path}/evidence`, signal),
      request(`${path}/comparison`, signal),
    ]);
    return validateInvestigation(
      { ...snapshot, result: { ...(comparison as object), captures } },
      true,
    );
  }
  return snapshot;
}
export async function cancelInvestigation(id: string, signal: AbortSignal) {
  return validateInvestigation(
    await request(
      `${yokaiApiConfig.investigations}/${encodeURIComponent(id)}/cancel`,
      signal,
      {},
    ),
    true,
  );
}
