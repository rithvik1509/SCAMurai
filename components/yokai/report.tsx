"use client";
import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { EvidenceSummary } from "./evidence-summary";
import {
  profileLabels,
  statusLabels,
  type Investigation,
} from "@/lib/yokai/types";
export function InvestigationReport({
  job,
  onEvidence,
  onNew,
}: {
  job: Investigation;
  onEvidence: (ids: string[]) => void;
  onNew: () => void;
}) {
  const [copyState, setCopyState] = useState("");
  const result = job.result;
  if (!result) return null;
  async function copy() {
    const text = [
      `SCAMurai / KAGE YŌKAI ${job.demo ? "— FICTIONAL DEMO" : ""}`,
      `Target: ${job.targetUrl}`,
      `Status: ${statusLabels[job.status]}`,
      `Profiles: ${job.profiles.map((p) => profileLabels[p]).join(", ")}`,
      `Recorded: ${new Date(job.updatedAt).toISOString()}`,
      "Capture coverage",
      ...result!.captures.map(
        (c) =>
          `${c.label}: ${c.availability}\nFinal URL: ${c.finalUrl}\n${c.notes.join("\n")}`,
      ),
      ...result!.findings.map(
        (f) =>
          `${f.title}\nReview priority: ${f.severity || "Not supplied"}\n${f.explanation}\n${f.confidence || ""}\nEvidence: ${f.evidenceIds.join(", ")}`,
      ),
      "Risk indicators",
      ...result!.riskIndicators,
      "Limitations",
      ...result!.limitations,
      "Recommendations",
      ...result!.recommendations,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("Report copied.");
    } catch {
      setCopyState("Clipboard unavailable. Select the report text to copy it.");
    }
  }
  return (
    <article className="yk-panel yk-report">
      <div className="yk-panel-heading">
        <div>
          <span className="yk-eyebrow">THE EVIDENCE, IN CONTEXT</span>
          <h2>Investigation report</h2>
        </div>
        <button className="yk-secondary" onClick={copy}>
          <Copy size={15} /> Copy report
        </button>
      </div>
      <p role="status" className="yk-field-note">
        {copyState}
      </p>
      <div className="yk-report-meta">
        <span className="yk-tag">
          {job.demo ? "FICTIONAL DEMO" : "SERVICE RESULT"}
        </span>
        <strong>{statusLabels[job.status]}</strong>
        <p className="yk-break">{job.targetUrl}</p>
        <small>
          {job.profiles.map((p) => profileLabels[p]).join(" / ")} ·{" "}
          {new Date(job.updatedAt).toLocaleString()}
        </small>
      </div>
      <EvidenceSummary captures={result.captures} findings={result.findings} />
      <h3>Observed differences</h3>
      {result.findings.map((f) => (
        <details className={`yk-finding tone-${f.tone}`} key={f.id} open>
          <summary>{f.title}</summary>
          {f.severity && (
            <p className="yk-field-note">Review priority: {f.severity}</p>
          )}
          <p>{f.explanation}</p>
          {f.confidence && <p className="yk-field-note">{f.confidence}</p>}
          <button
            className="yk-inline-link"
            onClick={() => onEvidence(f.evidenceIds)}
          >
            View evidence ({f.evidenceIds.length}) ↗
          </button>
        </details>
      ))}
      <div className="yk-report-columns">
        <section>
          <h3>Risk indicators</h3>
          {result.riskIndicators.length ? (
            <ul>
              {result.riskIndicators.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <p>
              No risk indicators were supplied. This is not a safety verdict.
            </p>
          )}
        </section>
        <section>
          <h3>Evidence collected</h3>
          {result.captures.map((c) => (
            <button
              className="yk-evidence-link"
              key={c.id}
              onClick={() => onEvidence([c.id])}
            >
              {c.label}
              <span>{c.availability} ↗</span>
            </button>
          ))}
        </section>
      </div>
      <h3>Limitations</h3>
      <ul>
        {result.limitations.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h3>Recommended next steps</h3>
      <ol>
        {result.recommendations.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <button className="yk-primary" onClick={onNew}>
        <Plus size={16} /> Another investigation
      </button>
    </article>
  );
}
