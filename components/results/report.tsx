"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  CircleAlert,
  TriangleAlert,
  ScanLine,
  GitCompareArrows,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Analysis } from "@/lib/types";
import type { ProtectionMode } from "@/lib/workspace";
export function Report({ workspaceMode }: { workspaceMode?: ProtectionMode }) {
  const scannerPath = workspaceMode ? `/dashboard/${workspaceMode}` : "/scan";
  const [result, setResult] = useState<Analysis | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copy, setCopy] = useState("Copy summary");
  const riskTone =
    result?.score === null || result?.score === undefined
      ? "risk-unknown"
      : result.score >= 40
        ? "risk-danger"
        : result.score >= 15
          ? "risk-suspicious"
          : "risk-safe";
  useEffect(() => {
    setResult(null);
    try {
      const raw = sessionStorage.getItem(
        workspaceMode ? `scamurai-${workspaceMode}-result` : "scamurai-result",
      );
      if (raw) setResult(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, [workspaceMode]);
  async function copySummary() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        `${result.demo ? "DEMONSTRATION ONLY\n" : ""}${result.category}: ${result.level} (${result.score ?? "Unknown"}/100)\n${result.explanation}\n${result.actions.join("\n")}\nLimitations: ${result.limitations.join(" ")}`,
      );
      setCopy("Copied");
    } catch {
      setCopy("Clipboard unavailable");
    }
  }
  if (!loaded)
    return (
      <div className="container workspace">
        <div className="skeleton" role="status">
          Loading your report…
        </div>
      </div>
    );
  if (!result)
    return (
      <div className="container empty-state">
        <ScanLine size={40} />
        <h1>Your next step starts with a scan.</h1>
        <p>Submit a message, link, or transaction to view its analysis here.</p>
        <Button asChild>
          <Link href={scannerPath}>
            Open scanner <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    );
  return (
    <div className="container workspace">
      <div className="report-top">
        <Link className="back-link" href={scannerPath}>
          <ArrowLeft size={14} /> Back to scanner
        </Link>
        <span className="small-label">THREAT INTELLIGENCE REPORT</span>
      </div>
      <div className="page-heading report-heading">
        <div>
          <span className="eyebrow">THE ANALYSIS</span>
          <h1>A clearer picture of the request.</h1>
        </div>
        <Button variant="outline" onClick={copySummary}>
          <Copy size={14} />
          {copy}
        </Button>
      </div>
      {result.demo && (
        <div className="report-demo">
          <span>DEMONSTRATION DATA</span>
          <p>
            This fixed sample report illustrates the experience. It does not
            assess your submitted content.
          </p>
        </div>
      )}
      <div className="report-grid">
        <section
          className={`risk-panel ${result.level.toLowerCase()} ${riskTone}`}
        >
          <div className="risk-top">
            <span className="small-label">RISK ASSESSMENT</span>
            <span className="risk-badge">{result.level} RISK</span>
          </div>
          <div className="risk-number">
            {result.score ?? "—"}
            <span>/100</span>
          </div>
          <div className="risk-scale">
            <i style={{ width: `${result.score ?? 0}%` }} />
          </div>
          <h2>{result.category}</h2>
          <p>{result.explanation}</p>
          <span className="risk-foot">
            <CircleAlert size={14} />
            {result.demo
              ? "Sample score, not a live assessment."
              : "Risk indicators are not a safety guarantee."}
          </span>
        </section>
        <section className="recommendations surface">
          <div className="panel-title">
            <Check size={18} />
            <h2>Your next steps</h2>
          </div>
          <ol>
            {result.actions.map((action, i) => (
              <li key={action}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <p>{action}</p>
              </li>
            ))}
          </ol>
          <Link className="text-link" href="/rescue">
            Already acted? Open rescue mode <ArrowUpRight size={15} />
          </Link>
        </section>
      </div>
      {result.transaction && (
        <section className="transaction-result">
          <div className="panel-title">
            <GitCompareArrows size={19} />
            <h2>Promise vs. Action</h2>
            <span className="sample-label">
              {result.demo ? "SAMPLE COMPARISON" : "API COMPARISON"}
            </span>
          </div>
          <div className="promise-comparison">
            <div>
              <span className="small-label">WHAT YOU WERE PROMISED</span>
              <h2>{result.transaction.promise}</h2>
            </div>
            <div className="versus">
              <ArrowRight />
            </div>
            <div className="actual">
              <span className="small-label">WHAT THIS ACTUALLY ALLOWS</span>
              <h2>{result.transaction.action}</h2>
            </div>
            <div className="comparison-verdict">
              <span>SCAMURAI VERDICT</span>
              <p>{result.transaction.verdict}</p>
            </div>
          </div>
          <dl className="transaction-details">
            {Object.entries({
              Contract: result.transaction.contract,
              Spender: result.transaction.spender,
              Allowance: result.transaction.allowance,
              "Approval type": result.transaction.approval,
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <div className="report-grid lower">
        <section className="surface signals">
          <div className="panel-title">
            <TriangleAlert size={18} />
            <h2>Threat signals</h2>
            <span className="count">{result.signals.length}</span>
          </div>
          {result.signals.length ? (
            result.signals.map((signal) => (
              <details key={signal.name} open>
                <summary>{signal.name}</summary>
                <p>{signal.explanation}</p>
                {signal.evidence &&
                  (Array.isArray(signal.evidence)
                    ? signal.evidence
                    : [signal.evidence]
                  ).map((evidence) => (
                    <blockquote key={evidence}>“{evidence}”</blockquote>
                  ))}
              </details>
            ))
          ) : (
            <p className="muted">
              No clear scam signals in this sample. Stay cautious with
              unexpected requests.
            </p>
          )}
        </section>
        <section className="surface evidence">
          <div className="panel-title">
            <ScanLine size={18} />
            <h2>Evidence in context</h2>
          </div>
          <span className="small-label">
            {result.demo
              ? "SUBMITTED INPUT · SAMPLE SPANS ONLY"
              : "SUBMITTED INPUT"}
          </span>
          <p className="evidence-text">
            <Evidence
              text={result.input}
              spans={result.signals.flatMap((s) =>
                s.evidence
                  ? Array.isArray(s.evidence)
                    ? s.evidence
                    : [s.evidence]
                  : [],
              )}
            />
          </p>
          <p className="muted small">
            {result.demo
              ? "Only fixture evidence present in the input is highlighted."
              : "Highlights show evidence spans returned by the backend."}
          </p>
        </section>
      </div>
      <section className="limitations">
        <CircleAlert size={17} />
        <div>
          <h3>What this report can’t tell you</h3>
          {result.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </section>
      <div className="report-actions">
        <Button asChild>
          <Link href={scannerPath}>
            Analyze another threat <ArrowRight size={16} />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/rescue">
            Open rescue mode <ArrowUpRight size={15} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
function Evidence({ text, spans }: { text: string; spans: string[] }) {
  const escaped = spans
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return text;
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return parts.map((part, i) =>
    spans.includes(part) ? <mark key={i}>{part}</mark> : part,
  );
}
