import { validateWallet } from "./api";
import type { WalletAnalysis } from "./types";
export const walletSessionKey = "scamurai-kagami-investigation";
export function readWalletSnapshot(): WalletAnalysis | null {
  try {
    const saved = sessionStorage.getItem(walletSessionKey);
    return saved ? validateWallet(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}
