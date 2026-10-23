export type ProfileId = "desktop" | "mobile" | "returning";
export type InvestigationStatus =
  | "queued"
  | "initializing"
  | "loading"
  | "collecting"
  | "comparing"
  | "completed"
  | "failed"
  | "cancelled"
  | "unsupported";
export type EvidenceTone =
  "normal" | "difference" | "sensitive" | "unavailable";
export type DemoCase = "responsive" | "payment" | "redirect";
export interface InvestigationRequest {
  targetUrl: string;
  profiles: ProfileId[];
  authorizationConfirmed: boolean;
  settings: {
    timeoutSeconds: number;
    captureScreenshots: boolean;
    includeNetwork: boolean;
  };
}
export interface BrowserCapture {
  id: string;
  profileId: ProfileId;
  label: string;
  finalUrl: string;
  title: string;
  viewport: { width: number; height: number };
  userAgent: string;
  cookieState: string;
  availability: "complete" | "partial" | "unavailable";
  notes: string[];
  screenshot: { url: string; kind: "capture" | "illustration" } | null;
  redirects: { from: string; to: string; status: number }[];
  structure: {
    headings: string[];
    linkCount: number;
    language: string;
    textBlocks?: string[];
    actionLabels?: string[];
  } | null;
  forms: {
    id: string;
    label: string;
    action: string;
    method: string;
    fields: string[];
    sensitive: boolean;
  }[];
  network: { id: string; url: string; method: string; kind: string }[];
}
export interface Finding {
  id: string;
  title: string;
  explanation: string;
  tone: EvidenceTone;
  evidenceIds: string[];
  severity?: "informational" | "low" | "medium" | "high";
  confidence?: string;
}
export interface EvidenceNode {
  id: string;
  kind: "profile" | "url" | "form" | "network";
  label: string;
  description: string;
  tone: EvidenceTone;
  evidenceIds: string[];
  profileId?: ProfileId;
  position: { x: number; y: number };
}
export interface EvidenceEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  tone: EvidenceTone;
  evidenceIds: string[];
}
export interface Counterfactual {
  id: string;
  title: string;
  baseline: string;
  changedVariable: string;
  observedResult: string;
  finding: string;
  conclusion: "controlled" | "correlation" | "inconclusive";
  evidenceIds: string[];
}
export interface InvestigationResult {
  captures: BrowserCapture[];
  findings: Finding[];
  riskIndicators: string[];
  limitations: string[];
  recommendations: string[];
  graph: { nodes: EvidenceNode[]; edges: EvidenceEdge[] };
  counterfactuals: Counterfactual[];
}
export interface Investigation {
  id: string;
  demo: boolean;
  targetUrl: string;
  profiles: ProfileId[];
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;
  events: { status: InvestigationStatus; at: string; message: string }[];
  error?: string;
  result?: InvestigationResult;
}
export interface InvestigationCapabilities {
  available: boolean;
  profiles: ProfileId[];
  allowedOrigins: string[];
  authorizationPolicy: string;
  cancellation: boolean;
  publicTargets?: boolean;
}
export const profileLabels: Record<ProfileId, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  returning: "Returning visitor",
};
export const statusLabels: Record<InvestigationStatus, string> = {
  queued: "Queued",
  initializing: "Initializing browser",
  loading: "Loading website",
  collecting: "Collecting evidence",
  comparing: "Comparing results",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  unsupported: "Unsupported",
};
export const terminalStatuses: InvestigationStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "unsupported",
];
