"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clipboard,
  Link2,
  MessageSquareText,
  Code2,
  X,
  LockKeyhole,
  TriangleAlert,
  LoaderCircle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyze, compareIntent } from "@/lib/api";
import { config } from "@/lib/config";
import { examples } from "@/lib/mock-data";
import type { Mode } from "@/lib/types";
import { saveReport, type ProtectionMode } from "@/lib/workspace";
export function Scanner({
  cryptoOnly = false,
  compact = false,
  workspaceMode,
  initialMode,
  intentCompare = false,
}: {
  cryptoOnly?: boolean;
  compact?: boolean;
  workspaceMode?: ProtectionMode;
  initialMode?: Mode;
  intentCompare?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(
    initialMode || (cryptoOnly ? "crypto" : "message"),
  );
  const draftKey = `scamurai-${workspaceMode}-${cryptoOnly ? (intentCompare ? "compare" : "inspect") : mode}-draft`;
  function readDraft(key: string) {
    try {
      return typeof window !== "undefined"
        ? JSON.parse(sessionStorage.getItem(key) || "{}")
        : {};
    } catch {
      return {};
    }
  }
  const [content, setContent] = useState(() =>
    workspaceMode ? readDraft(draftKey).content || "" : "",
  );
  const [network, setNetwork] = useState(() =>
    workspaceMode ? readDraft(draftKey).network || "Ethereum" : "Ethereum",
  );
  const [token, setToken] = useState(() =>
    workspaceMode ? readDraft(draftKey).token || "" : "",
  );
  const [promise, setPromise] = useState(() =>
    workspaceMode ? readDraft(draftKey).promise || "" : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (workspaceMode)
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ content, network, token, promise }),
        );
      } catch {}
  }, [workspaceMode, draftKey, content, network, token, promise]);
  function switchMode(value: Mode) {
    setMode(value);
    setContent(
      workspaceMode
        ? readDraft(`scamurai-${workspaceMode}-${value}-draft`).content || ""
        : "",
    );
    setError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!content.trim()) return setError("Add content to analyze first.");
    if (mode === "url") {
      try {
        const u = new URL(content);
        if (!["http:", "https:"].includes(u.protocol)) throw Error();
      } catch {
        return setError("Enter a complete HTTP or HTTPS URL.");
      }
    }
    if (mode === "crypto" && !/^0x(?:[a-fA-F0-9]{2}){4,}$/.test(content.trim()))
      return setError(
        "Enter hexadecimal transaction calldata starting with 0x.",
      );
    if (mode === "crypto" && token && !/^0x[a-fA-F0-9]{40}$/.test(token))
      return setError("Use a valid 42-character token contract address.");
    setBusy(true);
    try {
      const input = {
        mode,
        content: content.trim(),
        network,
        tokenAddress: token,
        promise,
      };
      const result = await (intentCompare
        ? compareIntent(input)
        : analyze(input));
      if (workspaceMode) {
        saveReport(
          workspaceMode,
          cryptoOnly
            ? intentCompare
              ? "Promise vs. Action"
              : "Transaction inspection"
            : mode === "url"
              ? "Website URL check"
              : "Message check",
          result,
        );
        router.push(`/dashboard/${workspaceMode}/results`);
      } else {
        sessionStorage.setItem("scamurai-result", JSON.stringify(result));
        router.push("/results");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Analysis failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function paste() {
    try {
      setContent((await navigator.clipboard.readText()).slice(0, 12000));
      setError("");
    } catch {
      setError(
        "Clipboard access is unavailable. Paste directly into the field.",
      );
    }
  }
  const tabs = [
    { id: "message" as const, label: "Message", icon: MessageSquareText },
    { id: "url" as const, label: "Website URL", icon: Link2 },
    { id: "crypto" as const, label: "Transaction", icon: Code2 },
  ];
  return (
    <form onSubmit={submit} className={`scanner ${compact ? "compact" : ""}`}>
      <div className="scanner-heading">
        <div>
          <ScanLabel
            label={
              workspaceMode === "kagami"
                ? "KAGAMI / TRANSACTION TRUTH"
                : workspaceMode === "kage"
                  ? "KAGE / SCAM INTELLIGENCE"
                  : undefined
            }
          />
          <h2>
            {cryptoOnly
              ? intentCompare
                ? "Does the promise match the permission?"
                : "Inspect a transaction"
              : "Something feels off? Check it."}
          </h2>
        </div>
        <span className="small-label">
          {workspaceMode ? "WORKSPACE CHECK" : "NO ACCOUNT NEEDED"}
        </span>
      </div>
      {!cryptoOnly && (
        <div className="mode-tabs" role="tablist" aria-label="Input type">
          {tabs
            .filter((tab) => workspaceMode !== "kage" || tab.id !== "crypto")
            .map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => switchMode(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
        </div>
      )}
      {config.demo && (
        <p className="demo-note">
          <span>DEMO</span>{" "}
          {cryptoOnly
            ? "Sample transaction scenario."
            : "Loads a labeled example report."}{" "}
          Your input is not assessed in demo mode.
        </p>
      )}
      <div className="input-box">
        <label
          className="sr-only"
          htmlFor={compact ? "quick-content" : "scan-content"}
        >
          {mode === "message"
            ? "Suspicious message"
            : mode === "url"
              ? "Website URL"
              : "Transaction calldata"}
        </label>
        <textarea
          id={compact ? "quick-content" : "scan-content"}
          value={content}
          maxLength={12000}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            mode === "message"
              ? "Paste the message that made you think twice…"
              : mode === "url"
                ? "https://suspicious-website.example"
                : "0x… Paste your transaction calldata"
          }
          rows={compact ? 3 : 6}
          spellCheck={false}
        />
        <div className="input-tools">
          <span>{content.length.toLocaleString()} / 12,000</span>
          <div>
            <button type="button" onClick={paste}>
              <Clipboard size={13} />
              Paste
            </button>
            <button
              type="button"
              aria-label="Clear input"
              onClick={() => {
                setContent("");
                setError("");
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
      {mode === "crypto" && (
        <div className="crypto-fields">
          <label>
            Network
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
            >
              <option>Ethereum</option>
              <option>Polygon</option>
              <option>Arbitrum</option>
              <option>Base</option>
            </select>
          </label>
          <label>
            Token contract <span>(optional)</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="0x…"
            />
          </label>
          {intentCompare && (
            <label className="full">
              What were you promised? <span>(optional)</span>
              <input
                value={promise}
                onChange={(e) => setPromise(e.target.value)}
                placeholder="e.g. Claim a free USDT reward"
              />
            </label>
          )}
        </div>
      )}
      <div className="examples">
        <span>Try an example</span>
        {mode === "message" ? (
          <>
            <button type="button" onClick={() => setContent(examples.bank)}>
              Bank KYC scam <ArrowRight size={12} />
            </button>
            <button type="button" onClick={() => setContent(examples.benign)}>
              Everyday message <ArrowRight size={12} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setContent(mode === "url" ? examples.url : examples.crypto);
              if (mode === "crypto") setPromise("Claim your free USDT reward.");
            }}
          >
            {mode === "url" ? "Suspicious URL" : "Unlimited approval"}
            <ArrowRight size={12} />
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          <TriangleAlert size={16} />
          {error}
        </p>
      )}
      <div className="scan-bottom">
        <span>
          <LockKeyhole size={13} /> Never paste passwords, OTPs, or seed
          phrases.
        </span>
        <Button type="submit" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={16} />
              {config.demo ? "Loading example…" : "Waiting for analysis…"}
            </>
          ) : (
            <>
              {config.demo ? "Explore demo analysis" : "Analyze threat"}
              <ArrowRight size={16} />
            </>
          )}
        </Button>
      </div>
      {busy && (
        <p className="loading-note" role="status">
          {config.demo
            ? "Retrieving a fixed demonstration fixture."
            : "Request sent. Waiting for the analysis service."}
        </p>
      )}
    </form>
  );
}
function ScanLabel({ label = "THE SCAM SCANNER" }: { label?: string }) {
  return (
    <span className="eyebrow">
      <Check size={12} /> {label}
    </span>
  );
}
