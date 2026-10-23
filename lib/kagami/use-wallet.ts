"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import {
  analyzeWallet,
  checkAllowance,
  getCapabilities,
  retrieveWallet,
  validateWallet,
} from "./api";
import { createWalletFixture, demoWallet } from "./mocks";
import {
  demoCapabilities,
  isAddress,
  type KagamiCapabilities,
  type NetworkId,
  type WalletAnalysis,
} from "./types";
const key = "scamurai-kagami-investigation";
export function useWallet() {
  const [wallet, setWallet] = useState(config.demo ? demoWallet : "");
  const [network, setNetwork] = useState<NetworkId>("ethereum");
  const [demo, setDemo] = useState(config.demo);
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);
  const [capabilities, setCapabilities] = useState<KagamiCapabilities | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageNote, setStorageNote] = useState("");
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const ready = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (saved) {
        const result = validateWallet(saved);
        setWallet(result.wallet);
        setNetwork(result.network);
        setDemo(result.demo);
        setAnalysis(result);
      }
    } catch {}
    ready.current = true;
    return () => request.current?.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void getCapabilities(controller.signal)
      .then(setCapabilities)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  const receive = useCallback((value: WalletAnalysis) => {
    setAnalysis(value);
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      window.dispatchEvent(new Event("scamurai-workspace"));
    } catch {
      setStorageNote(
        "This browser could not save the investigation in this tab.",
      );
    }
  }, []);
  function invalidate() {
    revision.current++;
    request.current?.abort();
    setAnalysis(null);
    setError("");
    setBusy(false);
    if (ready.current)
      try {
        sessionStorage.removeItem(key);
      } catch {}
  }
  const changeWallet = (value: string) => {
    invalidate();
    setWallet(value);
  };
  const changeNetwork = (value: NetworkId) => {
    invalidate();
    setNetwork(value);
  };
  const changeDemo = () => {
    invalidate();
    setDemo(!demo);
    setWallet(!demo ? demoWallet : "");
  };
  async function analyze(pair?: { token: string; spender: string }) {
    setError("");
    if (!isAddress(wallet)) {
      setError(
        "Enter a public EVM address: 0x followed by 40 hexadecimal characters.",
      );
      return;
    }
    if (pair && (!isAddress(pair.token) || !isAddress(pair.spender) || demo)) {
      setError(
        "Enter valid token and spender addresses while using the connected service.",
      );
      return;
    }
    const caps = demo ? demoCapabilities : capabilities;
    if (
      !caps?.available ||
      !caps.networks.find((n) => n.id === network)?.walletAnalysis
    ) {
      setError(
        "The selected network has no wallet data connection. Your address has been kept; choose a connected network or retry the connection.",
      );
      return;
    }
    if (demo && wallet.toLowerCase() !== demoWallet) {
      setError(
        "Use the fixed example wallet for fictional evidence. Switch to the connected service to inspect another address.",
      );
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const version = ++revision.current;
    setBusy(true);
    setAnalysis(null);
    try {
      const result = demo
        ? validateWallet(createWalletFixture(network))
        : pair
          ? await checkAllowance(
              wallet,
              network,
              pair.token,
              pair.spender,
              controller.signal,
            )
          : await analyzeWallet(wallet, network, controller.signal);
      if (!controller.signal.aborted && revision.current === version) {
        receive(result);
        return true;
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Wallet analysis failed.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (!analysis || analysis.demo || analysis.status !== "pending" || error)
      return;
    const controller = new AbortController();
    const version = revision.current;
    const timer = setTimeout(() => {
      void retrieveWallet(analysis.id, controller.signal)
        .then((result) => {
          if (
            result.wallet.toLowerCase() !== analysis.wallet.toLowerCase() ||
            result.network !== analysis.network
          )
            throw Error("The service returned a different wallet or network.");
          if (!controller.signal.aborted && revision.current === version)
            receive(result);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 2000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [analysis, error, retry, receive]);
  return {
    wallet,
    network,
    demo,
    analysis,
    busy,
    error,
    storageNote,
    capabilities: demo ? demoCapabilities : capabilities,
    changeWallet,
    changeNetwork,
    changeDemo,
    analyze,
    checkAllowance: (token: string, spender: string) =>
      analyze({ token: token.trim(), spender: spender.trim() }),
    useExample: () => changeWallet(demoWallet),
    retry: () => {
      setError("");
      setRetry((v) => v + 1);
    },
    cancelRequest: () => {
      revision.current++;
      request.current?.abort();
      setBusy(false);
      setError(
        "Stopped waiting for the request. This does not cancel backend processing.",
      );
    },
  };
}
