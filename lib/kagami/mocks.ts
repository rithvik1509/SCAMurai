import type {
  AuthorityGraph,
  NetworkId,
  Permission,
  TransactionInput,
  TransactionResult,
  WalletAnalysis,
} from "./types";
export const demoWallet = "0x1111111111111111111111111111111111111111";
export const demoToken = "0x2222222222222222222222222222222222222222";
export const demoSpender = "0x3333333333333333333333333333333333333333";
export const maximumAllowance =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const checkedAt = "2026-10-23T09:00:00.000Z";
export const approvalCalldata = `0x095ea7b3${demoSpender.slice(2).padStart(64, "0")}${"f".repeat(64)}`;
export function demoTransaction(
  network: NetworkId,
  unsupported = false,
): TransactionInput {
  return {
    network,
    sender: demoWallet,
    target: demoToken,
    calldata: unsupported ? "0xdeadbeef" : approvalCalldata,
    valueWei: "0",
    claimedPurpose: unsupported ? "" : "Claim a token reward",
  };
}
export function createWalletFixture(network: NetworkId): WalletAnalysis {
  const permissions: Permission[] = [
    {
      id: "finite",
      type: "erc20",
      owner: demoWallet,
      spender: demoSpender,
      token: demoToken,
      symbol: "ORB",
      decimals: 18,
      allowanceRaw: "1250000000000000000000",
      allowanceKind: "finite",
      active: true,
      modelRemovable: true,
      severity: "none",
      title: "Finite token allowance",
      explanation:
        "This fixture permits the spender to spend up to 1,250 ORB. An approval is a permission, not a transfer of ownership.",
      checkedAt,
      evidenceIds: ["ev-finite"],
    },
    {
      id: "unlimited",
      type: "erc20",
      owner: demoWallet,
      spender: "0x4444444444444444444444444444444444444444",
      token: "0x5555555555555555555555555555555555555555",
      symbol: "USDX",
      decimals: 6,
      allowanceRaw: maximumAllowance,
      allowanceKind: "unlimited",
      active: true,
      modelRemovable: true,
      severity: "review",
      title: "Unlimited spending allowance",
      explanation:
        "This fixture has an unlimited allowance. Review whether this spender still needs that scope. Unlimited permission alone does not establish malicious behavior.",
      checkedAt,
      evidenceIds: ["ev-unlimited"],
    },
    {
      id: "zero",
      type: "erc20",
      owner: demoWallet,
      spender: "0x6666666666666666666666666666666666666666",
      token: demoToken,
      symbol: "ORB",
      decimals: 18,
      allowanceRaw: "0",
      allowanceKind: "zero",
      active: false,
      modelRemovable: false,
      severity: "none",
      title: "Zero allowance",
      explanation:
        "The fixture records a zero allowance for this spender. This record contributes no active modeled permission path.",
      checkedAt,
      evidenceIds: ["ev-zero"],
    },
    {
      id: "delegation",
      type: "delegation",
      owner: demoWallet,
      spender: "0x7777777777777777777777777777777777777777",
      token: null,
      symbol: null,
      decimals: null,
      allowanceRaw: null,
      allowanceKind: "not-applicable",
      active: true,
      modelRemovable: true,
      severity: "review",
      title: "EIP-7702 execution delegation",
      explanation:
        "The fixture records a delegated implementation. Delegation changes how account execution can work; its presence alone does not establish compromise or token-spending authority.",
      checkedAt,
      evidenceIds: ["ev-delegation"],
    },
  ];
  const graph: AuthorityGraph = {
    nodes: [
      {
        id: "wallet",
        kind: "wallet",
        label: "Investigated wallet",
        address: demoWallet,
        permissionId: null,
        position: { x: 0, y: 200 },
      },
    ],
    edges: [],
  };
  permissions.forEach((p, i) => {
    const id = `permission-${p.id}`,
      y = p.id === "zero" || p.type === "delegation" ? 440 : i * 220;
    graph.nodes.push({
      id,
      kind: p.type === "delegation" ? "delegation" : "permission",
      label:
        p.type === "delegation"
          ? "EIP-7702 delegation"
          : `${p.symbol} · ${p.allowanceKind}`,
      address: p.type === "delegation" ? p.spender : null,
      permissionId: p.id,
      position: { x: p.id === "zero" ? 0 : 310, y },
    });
    graph.edges.push({
      id: `edge-${p.id}`,
      source: "wallet",
      target: id,
      label:
        p.type === "delegation"
          ? "Delegates execution"
          : p.active
            ? "Granted allowance"
            : "Observed zero allowance",
      permissionId: p.id,
      evidenceIds: p.evidenceIds,
    });
    if (p.type === "erc20" && p.active) {
      graph.nodes.push(
        {
          id: `spender-${p.id}`,
          kind: "spender",
          label: "Approved spender",
          address: p.spender,
          permissionId: p.id,
          position: { x: 620, y: y - 45 },
        },
        {
          id: `token-${p.id}`,
          kind: "token",
          label: `${p.symbol} token`,
          address: p.token,
          permissionId: p.id,
          position: { x: 620, y: y + 80 },
        },
      );
      graph.edges.push(
        {
          id: `spender-edge-${p.id}`,
          source: id,
          target: `spender-${p.id}`,
          label: "Spender address",
          permissionId: p.id,
          evidenceIds: p.evidenceIds,
        },
        {
          id: `token-edge-${p.id}`,
          source: id,
          target: `token-${p.id}`,
          label: "Token contract",
          permissionId: p.id,
          evidenceIds: p.evidenceIds,
        },
      );
    }
  });
  return {
    id: `demo-wallet-${network}`,
    demo: true,
    wallet: demoWallet,
    network,
    status: "completed",
    checkedAt,
    permissions,
    graph,
    evidence: permissions.map((p) => ({
      id: p.evidenceIds[0],
      label: p.title,
      source: "fixture",
      reference: `Authored demonstration record ${p.id}; not a chain query or transaction.`,
    })),
    coverage: { approvals: "partial", delegations: "partial" },
    findings: [
      "One unlimited allowance and one execution delegation are marked for review in this fixture.",
    ],
    limitations: [
      "All addresses, tokens, permissions, and evidence are fictional demonstration fixtures. No blockchain was queried.",
      "Coverage is limited to the supplied records. Other tokens, spenders, and authorization types may exist on a real account.",
      "Virtually disabling a direct relationship only hides that modeled path. It does not model indirect contract behavior or guarantee asset safety.",
    ],
  };
}
export function createTransactionFixture(
  input: TransactionInput,
  action: "decode" | "preview",
): TransactionResult {
  const supported =
    input.sender.toLowerCase() === demoWallet &&
    input.target.toLowerCase() === demoToken &&
    input.calldata.toLowerCase() === approvalCalldata &&
    input.valueWei === "0" &&
    (input.network === "ethereum" || input.network === "sepolia");
  return {
    demo: true,
    network: input.network,
    sender: input.sender,
    target: input.target,
    status: supported ? "successful" : "unsupported",
    checkedAt,
    functionName: supported ? "approve(address spender, uint256 amount)" : null,
    parameters: supported
      ? [
          { name: "spender", value: demoSpender },
          { name: "amount (raw uint256)", value: maximumAllowance },
        ]
      : [],
    effects:
      supported && action === "preview"
        ? [
            {
              id: "approval-change",
              kind: "approval",
              label: "Spending allowance",
              asset: "ORB",
              before: "1250 ORB",
              after: "Unlimited ORB approval",
              direction: "permission",
              evidenceIds: ["tx-fixture"],
            },
          ]
        : [],
    expectedAction: input.claimedPurpose || null,
    actualAction: supported
      ? "Authorize the supplied spender to spend ORB up to the fixture's unlimited allowance."
      : null,
    mismatches:
      supported && input.claimedPurpose.trim() === "Claim a token reward"
        ? [
            {
              finding:
                "The fixture calls approve; no reward transfer is represented. The claimed reward and this authorization describe different actions.",
              evidenceIds: ["tx-fixture"],
            },
          ]
        : [],
    evidence: supported
      ? [
          {
            id: "tx-fixture",
            label: "Authored ERC-20 approval example",
            source: "fixture",
            reference:
              "Exact matching demonstration calldata; no chain state or simulation engine was queried.",
          },
        ]
      : [],
    limitations: [
      "Demonstration only. This frontend does not execute a transaction simulation.",
      ...(supported
        ? [
            "No verified balance data or asset transfers are supplied. An allowance change is not a token transfer.",
          ]
        : [
            "Only the exact supplied approval example is supported in demo mode. Other inputs require a connected backend.",
          ]),
      "Simulation results are estimates and may differ from final blockchain execution.",
    ],
  };
}
