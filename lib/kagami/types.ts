export type NetworkId = "ethereum" | "sepolia" | "arbitrum";
export type ModuleId = "authority" | "approvals" | "futureview";
export type Severity = "none" | "review" | "high" | "unknown";
export interface Evidence {
  id: string;
  label: string;
  source: "fixture" | "chain" | "service";
  reference: string;
  transactionHash?: string;
}
export interface Permission {
  id: string;
  type: "erc20" | "delegation";
  owner: string;
  spender: string;
  token: string | null;
  symbol: string | null;
  decimals: number | null;
  allowanceRaw: string | null;
  allowanceKind: "finite" | "unlimited" | "zero" | "not-applicable";
  active: boolean;
  modelRemovable: boolean;
  severity: Severity;
  title: string;
  explanation: string;
  checkedAt: string;
  evidenceIds: string[];
}
export interface AuthorityNode {
  id: string;
  kind: "wallet" | "permission" | "token" | "spender" | "delegation";
  label: string;
  address: string | null;
  permissionId: string | null;
  position: { x: number; y: number };
}
export interface AuthorityEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  permissionId: string;
  evidenceIds: string[];
}
export interface AuthorityGraph {
  nodes: AuthorityNode[];
  edges: AuthorityEdge[];
}
export interface WalletAnalysis {
  id: string;
  demo: boolean;
  wallet: string;
  network: NetworkId;
  status: "pending" | "completed" | "partial" | "unsupported" | "failed";
  checkedAt: string;
  permissions: Permission[];
  graph: AuthorityGraph | null;
  evidence: Evidence[];
  coverage: {
    approvals: "complete" | "partial" | "unavailable";
    delegations: "complete" | "partial" | "unavailable";
  };
  limitations: string[];
  findings: string[];
  error?: string;
}
export interface KagamiCapabilities {
  available: boolean;
  networks: {
    id: NetworkId;
    walletAnalysis: boolean;
    decode: boolean;
    preview: boolean;
  }[];
  limitations: string[];
}
export interface TransactionInput {
  network: NetworkId;
  sender: string;
  target: string;
  calldata: string;
  valueWei: string;
  claimedPurpose: string;
}
export interface TransactionResult {
  demo: boolean;
  network: NetworkId;
  sender: string;
  target: string;
  status:
    | "pending"
    | "successful"
    | "reverted"
    | "unsupported"
    | "failed"
    | "inconclusive";
  checkedAt: string;
  functionName: string | null;
  parameters: { name: string; value: string }[];
  effects: {
    id: string;
    kind: "approval" | "balance" | "transfer" | "other";
    label: string;
    asset: string;
    before: string | null;
    after: string | null;
    direction: "incoming" | "outgoing" | "permission" | "none";
    evidenceIds: string[];
  }[];
  expectedAction: string | null;
  actualAction: string | null;
  mismatches: { finding: string; evidenceIds: string[] }[];
  evidence: Evidence[];
  limitations: string[];
  error?: string;
}
export const networks = [
  {
    id: "ethereum" as const,
    label: "Ethereum",
    chainId: 1,
    explorer: "https://etherscan.io",
  },
  {
    id: "sepolia" as const,
    label: "Sepolia testnet",
    chainId: 11155111,
    explorer: "https://sepolia.etherscan.io",
  },
  {
    id: "arbitrum" as const,
    label: "Arbitrum One",
    chainId: 42161,
    explorer: "https://arbiscan.io",
  },
];
export const demoCapabilities: KagamiCapabilities = {
  available: true,
  networks: [
    { id: "ethereum", walletAnalysis: true, decode: true, preview: true },
    { id: "sepolia", walletAnalysis: true, decode: true, preview: true },
  ],
  limitations: [
    "Fictional fixture data. No blockchain requests or wallet changes.",
  ],
};
export const severityLabels: Record<Severity, string> = {
  none: "No review finding",
  review: "Review recommended",
  high: "High priority",
  unknown: "Incomplete",
};
export function isAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}
export function buildErc20Calldata(
  method: "approve" | "transfer" | "transferFrom",
  destination: string,
  amountRaw: string,
  owner = "",
) {
  if (
    !isAddress(destination) ||
    (method === "transferFrom" && !isAddress(owner))
  )
    throw Error("Enter valid destination and owner addresses.");
  if (
    !/^(0|[1-9][0-9]*)$/.test(amountRaw) ||
    amountRaw.length > 78 ||
    BigInt(amountRaw) >= 1n << 256n
  )
    throw Error("Amount must be an exact uint256 integer in raw token units.");
  const addressWord = (value: string) =>
    value.slice(2).toLowerCase().padStart(64, "0");
  return (
    "0x" +
    { approve: "095ea7b3", transfer: "a9059cbb", transferFrom: "23b872dd" }[
      method
    ] +
    (method === "transferFrom" ? addressWord(owner) : "") +
    addressWord(destination) +
    BigInt(amountRaw).toString(16).padStart(64, "0")
  );
}
export function shortAddress(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
export function explorerAddress(
  network: NetworkId,
  address: string,
  demo: boolean,
) {
  return !demo && isAddress(address)
    ? `${networks.find((n) => n.id === network)!.explorer}/address/${address}`
    : undefined;
}
export function formatAllowance(permission: Permission) {
  if (permission.type === "delegation") return "Execution delegation";
  if (permission.allowanceKind === "unlimited") return "Unlimited";
  if (permission.allowanceRaw === null) return "Unavailable";
  if (permission.decimals === null)
    return `${permission.allowanceRaw} raw units`;
  const padded = permission.allowanceRaw.padStart(permission.decimals + 1, "0");
  const whole = permission.decimals
    ? padded.slice(0, -permission.decimals)
    : padded;
  const fraction = permission.decimals
    ? padded.slice(-permission.decimals).replace(/0+$/, "")
    : "";
  return `${whole}${fraction ? `.${fraction}` : ""}${permission.symbol ? ` ${permission.symbol}` : ""}`;
}
export function modeledSummary(analysis: WalletAnalysis, removed: string[]) {
  const modeled = analysis.permissions.filter(
    (p) =>
      p.active && analysis.graph?.edges.some((e) => e.permissionId === p.id),
  );
  return {
    current: modeled.length,
    removed: modeled.filter((p) => removed.includes(p.id)).length,
    remaining: modeled.filter((p) => !removed.includes(p.id)).length,
  };
}
