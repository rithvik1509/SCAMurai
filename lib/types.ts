export type Mode = "message" | "url" | "crypto";
export type Incident =
  "message" | "link" | "password" | "otp" | "money" | "crypto";
export interface AnalyzeRequest {
  mode: Mode;
  content: string;
  network?: string;
  tokenAddress?: string;
  promise?: string;
}
export interface Signal {
  name: string;
  explanation: string;
  evidence?: string | string[];
}
export interface Analysis {
  demo: boolean;
  input: string;
  score: number | null;
  level: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  category: string;
  explanation: string;
  signals: Signal[];
  actions: string[];
  limitations: string[];
  transaction?: {
    contract: string;
    spender: string;
    allowance: string;
    approval: "Limited" | "Very large" | "Unlimited";
    promise: string;
    action: string;
    verdict: string;
  };
}
export interface RescueResponse {
  demo: boolean;
  steps: string[];
  preserve: string[];
  warning: string;
}
