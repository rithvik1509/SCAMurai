import { config } from "../config";
import {
  capabilitiesSchema,
  graphSchema,
  permissionSchema,
  transactionInputSchema,
  transactionSchema,
  walletSchema,
} from "./schemas";
import type {
  KagamiCapabilities,
  NetworkId,
  TransactionInput,
  TransactionResult,
  WalletAnalysis,
} from "./types";
export const kagamiApiConfig = {
  enabled: process.env.NEXT_PUBLIC_KAGAMI_API_ENABLED === "true",
  base: process.env.NEXT_PUBLIC_KAGAMI_API_PATH || "/api/v1/kagami",
};
export class KagamiApiError extends Error {}
async function request(path: string, signal: AbortSignal, body?: unknown) {
  if (!kagamiApiConfig.enabled)
    throw new KagamiApiError(
      "Wallet investigation is not available on this service yet. Explore labeled demo fixtures.",
    );
  const timeout = AbortSignal.timeout(config.timeout);
  try {
    const response = await fetch(
      `${config.apiUrl.replace(/\/$/, "")}${kagamiApiConfig.base}${path}`,
      {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([timeout, signal]),
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new KagamiApiError(
        response.status === 404
          ? "This KAGAMI capability is not available on the connected service."
          : response.status === 422
            ? "The service rejected these wallet, network, or transaction inputs."
            : `KAGAMI service returned ${response.status}. Please retry.`,
      );
    return await response.json();
  } catch (e) {
    if (signal.aborted || e instanceof KagamiApiError) throw e;
    throw new KagamiApiError(
      timeout.aborted
        ? "The request timed out. The last verified result has not been replaced."
        : "Could not read the KAGAMI service. Check the connection and retry.",
    );
  }
}
export function validateWallet(value: unknown, live = false): WalletAnalysis {
  const p = walletSchema.safeParse(value);
  if (
    !p.success ||
    (live && p.data.demo) ||
    (p.success &&
      !p.data.demo &&
      p.data.evidence.some((e) => e.source === "fixture"))
  )
    throw new KagamiApiError(
      "The wallet evidence contract is unsupported or inconsistent.",
    );
  return p.data;
}
export function validateTransaction(
  value: unknown,
  live = false,
): TransactionResult {
  const p = transactionSchema.safeParse(value);
  if (!p.success || (live && p.data.demo))
    throw new KagamiApiError(
      "The transaction evidence contract is unsupported or inconsistent.",
    );
  return p.data;
}
export async function getCapabilities(
  signal: AbortSignal,
): Promise<KagamiCapabilities> {
  if (!kagamiApiConfig.enabled)
    return {
      available: false,
      networks: [],
      limitations: [
        "KAGAMI endpoints are not published by the connected backend yet. Use the explicitly labeled examples to explore the interface.",
      ],
    };
  const p = capabilitiesSchema.safeParse(
    await request("/capabilities", signal),
  );
  if (!p.success)
    throw new KagamiApiError(
      "The service's network capabilities could not be read.",
    );
  return p.data;
}
export async function analyzeWallet(
  wallet: string,
  network: NetworkId,
  signal: AbortSignal,
) {
  const result = validateWallet(
    await request("/wallets/analyze", signal, { wallet, network }),
    true,
  );
  if (
    result.wallet.toLowerCase() !== wallet.toLowerCase() ||
    result.network !== network
  )
    throw new KagamiApiError(
      "The service returned evidence for a different wallet or network.",
    );
  return result;
}
export async function retrieveWallet(id: string, signal: AbortSignal) {
  const result = validateWallet(
    await request(`/wallets/${encodeURIComponent(id)}`, signal),
    true,
  );
  if (result.id !== id)
    throw new KagamiApiError("The service returned a different investigation.");
  return result;
}
export async function checkAllowance(
  wallet: string,
  network: NetworkId,
  token: string,
  spender: string,
  signal: AbortSignal,
) {
  const result = validateWallet(
    await request("/wallets/check-allowance", signal, {
      wallet,
      network,
      token,
      spender,
    }),
    true,
  );
  if (
    result.wallet.toLowerCase() !== wallet.toLowerCase() ||
    result.network !== network ||
    !result.permissions.some(
      (p) =>
        p.type === "erc20" &&
        p.token?.toLowerCase() === token.toLowerCase() &&
        p.spender.toLowerCase() === spender.toLowerCase(),
    )
  )
    throw new KagamiApiError(
      "The service returned evidence for a different allowance.",
    );
  return result;
}
export async function retrieveAuthorityGraph(id: string, signal: AbortSignal) {
  const p = graphSchema.safeParse(
    await request(`/wallets/${encodeURIComponent(id)}/authority`, signal),
  );
  if (!p.success)
    throw new KagamiApiError("The authority graph contract is unsupported.");
  return p.data;
}
export async function retrieveApprovals(id: string, signal: AbortSignal) {
  const p = permissionSchema
    .array()
    .safeParse(
      await request(`/wallets/${encodeURIComponent(id)}/approvals`, signal),
    );
  if (!p.success || p.data.some((x) => x.type !== "erc20"))
    throw new KagamiApiError("The approval evidence could not be read.");
  return p.data;
}
export async function retrieveDelegations(id: string, signal: AbortSignal) {
  const p = permissionSchema
    .array()
    .safeParse(
      await request(`/wallets/${encodeURIComponent(id)}/delegations`, signal),
    );
  if (!p.success || p.data.some((x) => x.type !== "delegation"))
    throw new KagamiApiError("The delegation evidence could not be read.");
  return p.data;
}
async function transaction(
  action: "decode" | "preview",
  input: TransactionInput,
  signal: AbortSignal,
) {
  const p = transactionInputSchema.safeParse(input);
  if (!p.success)
    throw new KagamiApiError(
      "Use valid EVM addresses, complete hex calldata, and an exact integer value in wei.",
    );
  const result = validateTransaction(
    await request(`/transactions/${action}`, signal, p.data),
    true,
  );
  if (
    result.network !== input.network ||
    result.sender.toLowerCase() !== input.sender.toLowerCase() ||
    result.target.toLowerCase() !== input.target.toLowerCase()
  )
    throw new KagamiApiError(
      "The service returned a result for different transaction inputs.",
    );
  return result;
}
export const decodeTransaction = (
  input: TransactionInput,
  signal: AbortSignal,
) => transaction("decode", input, signal);
export const previewTransaction = (
  input: TransactionInput,
  signal: AbortSignal,
) => transaction("preview", input, signal);
