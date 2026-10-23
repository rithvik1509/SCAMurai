import { z } from "zod";
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const uint256 = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .max(78)
  .refine(
    (v) => v.length <= 78 && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) < 1n << 256n,
    "Value exceeds uint256",
  );
export const network = z.enum(["ethereum", "sepolia", "arbitrum"]);
const text = z.string().max(16000),
  refs = z.array(z.string()).max(100),
  time = z
    .string()
    .refine((v) => Number.isFinite(Date.parse(v)), "Invalid timestamp");
export const evidenceSchema = z.object({
  id: z.string().min(1),
  label: text,
  source: z.enum(["fixture", "chain", "service"]),
  reference: text,
  transactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
});
export const permissionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["erc20", "delegation"]),
    owner: address,
    spender: address,
    token: address.nullable(),
    symbol: text.nullable(),
    decimals: z.number().int().min(0).max(255).nullable(),
    allowanceRaw: uint256.nullable(),
    allowanceKind: z.enum(["finite", "unlimited", "zero", "not-applicable"]),
    active: z.boolean(),
    modelRemovable: z.boolean(),
    severity: z.enum(["none", "review", "high", "unknown"]),
    title: text,
    explanation: text,
    checkedAt: time,
    evidenceIds: refs,
  })
  .refine(
    (p) =>
      p.type !== "erc20" ||
      (p.token !== null &&
        p.allowanceRaw !== null &&
        p.allowanceKind !== "not-applicable"),
    "ERC-20 record lacks allowance evidence",
  )
  .refine(
    (p) => p.allowanceKind !== "zero" || (p.allowanceRaw === "0" && !p.active),
    "Inconsistent zero allowance",
  )
  .refine(
    (p) =>
      p.type !== "delegation" ||
      (p.token === null &&
        p.allowanceRaw === null &&
        p.allowanceKind === "not-applicable"),
    "Delegation is not a token allowance",
  );
export const graphSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum([
          "wallet",
          "permission",
          "token",
          "spender",
          "delegation",
        ]),
        label: text,
        address: address.nullable(),
        permissionId: z.string().nullable(),
        position: z.object({ x: z.number().finite(), y: z.number().finite() }),
      }),
    )
    .max(2000),
  edges: z
    .array(
      z.object({
        id: z.string().min(1),
        source: z.string(),
        target: z.string(),
        label: text,
        permissionId: z.string(),
        evidenceIds: refs,
      }),
    )
    .max(5000),
});
export const walletSchema = z
  .object({
    id: z.string().min(1).max(200),
    demo: z.boolean(),
    wallet: address,
    network,
    status: z.enum([
      "pending",
      "completed",
      "partial",
      "unsupported",
      "failed",
    ]),
    checkedAt: time,
    permissions: z.array(permissionSchema).max(2000),
    graph: graphSchema.nullable(),
    evidence: z.array(evidenceSchema).max(4000),
    coverage: z.object({
      approvals: z.enum(["complete", "partial", "unavailable"]),
      delegations: z.enum(["complete", "partial", "unavailable"]),
    }),
    limitations: z.array(text),
    findings: z.array(text),
    error: text.optional(),
  })
  .superRefine((v, ctx) => {
    const p = new Set(v.permissions.map((p) => p.id)),
      e = new Set(v.evidence.map((e) => e.id)),
      n = new Set(v.graph?.nodes.map((n) => n.id) || []);
    if (
      p.size !== v.permissions.length ||
      e.size !== v.evidence.length ||
      (v.graph && n.size !== v.graph.nodes.length) ||
      (v.graph &&
        new Set(v.graph.edges.map((e) => e.id)).size !== v.graph.edges.length)
    )
      ctx.addIssue({ code: "custom", message: "Duplicate identifiers" });
    if (
      v.permissions.some(
        (p) =>
          p.owner.toLowerCase() !== v.wallet.toLowerCase() ||
          p.evidenceIds.some((id) => !e.has(id)),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Wallet or evidence does not match",
      });
    if (
      v.graph?.edges.some(
        (edge) =>
          !n.has(edge.source) ||
          !n.has(edge.target) ||
          !p.has(edge.permissionId) ||
          edge.evidenceIds.some((id) => !e.has(id)),
      ) ||
      v.graph?.nodes.some(
        (node) => node.permissionId && !p.has(node.permissionId),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Unverified graph relationship",
      });
  });
export const transactionInputSchema = z.object({
  network,
  sender: address,
  target: address,
  calldata: z
    .string()
    .regex(/^0x(?:[0-9a-fA-F]{2}){4,}$/)
    .max(200000),
  valueWei: uint256,
  claimedPurpose: z.string().max(4000),
});
export const transactionSchema = z
  .object({
    demo: z.boolean(),
    network,
    sender: address,
    target: address,
    status: z.enum([
      "pending",
      "successful",
      "reverted",
      "unsupported",
      "failed",
      "inconclusive",
    ]),
    checkedAt: time,
    functionName: text.nullable(),
    parameters: z.array(z.object({ name: text, value: text })),
    effects: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["approval", "balance", "transfer", "other"]),
        label: text,
        asset: text,
        before: text.nullable(),
        after: text.nullable(),
        direction: z.enum(["incoming", "outgoing", "permission", "none"]),
        evidenceIds: refs,
      }),
    ),
    expectedAction: text.nullable(),
    actualAction: text.nullable(),
    mismatches: z.array(z.object({ finding: text, evidenceIds: refs })),
    evidence: z.array(evidenceSchema),
    limitations: z.array(text),
    error: text.optional(),
  })
  .superRefine((v, ctx) => {
    const ids = new Set(v.evidence.map((e) => e.id));
    if (
      [...v.effects, ...v.mismatches].some((x) =>
        x.evidenceIds.some((id) => !ids.has(id)),
      )
    )
      ctx.addIssue({ code: "custom", message: "Missing transaction evidence" });
  });
export const capabilitiesSchema = z.object({
  available: z.boolean(),
  networks: z.array(
    z.object({
      id: network,
      walletAnalysis: z.boolean(),
      decode: z.boolean(),
      preview: z.boolean(),
    }),
  ),
  limitations: z.array(text),
});
