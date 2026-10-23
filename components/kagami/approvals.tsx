"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import {
  formatAllowance,
  networks,
  type WalletAnalysis,
} from "@/lib/kagami/types";
import { CopyValue, EmptyPanel, SeverityBadge } from "./shared";
export function ApprovalTimebomb({
  analysis,
  onDetails,
  onGraph,
}: {
  analysis: WalletAnalysis;
  onDetails: (id: string) => void;
  onGraph: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [unlimited, setUnlimited] = useState(false);
  const [page, setPage] = useState(0);
  const approvals = useMemo(
    () => analysis.permissions.filter((p) => p.type === "erc20"),
    [analysis.permissions],
  );
  useEffect(() => setPage(0), [query, kind, severity, unlimited, analysis.id]);
  const filtered = useMemo(
    () =>
      approvals.filter(
        (p) =>
          `${p.symbol || ""} ${p.token} ${p.spender}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (kind === "all" || p.allowanceKind === kind) &&
          (severity === "all" || p.severity === severity) &&
          (!unlimited || p.allowanceKind === "unlimited"),
      ),
    [approvals, query, kind, severity, unlimited],
  );
  return (
    <section className="kg-panel kg-approvals">
      <header className="kg-panel-heading">
        <div>
          <span className="kg-eyebrow">
            APPROVAL TIMEBOMB / PERMISSION INVENTORY
          </span>
          <h2>Permissions outlast the moment.</h2>
        </div>
        <span className="kg-badge">
          Coverage: {analysis.coverage.approvals}
        </span>
      </header>
      <p className="kg-note">
        Review existing ERC-20 allowances. An unlimited allowance alone is not
        evidence of a malicious spender.
      </p>
      <div className="kg-model-summary">
        <div>
          <span>Returned approvals</span>
          <strong>{approvals.length}</strong>
        </div>
        <div>
          <span>Unlimited allowances</span>
          <strong>
            {approvals.filter((p) => p.allowanceKind === "unlimited").length}
          </strong>
        </div>
        <div>
          <span>Marked for review</span>
          <strong>
            {
              approvals.filter(
                (p) => p.severity === "review" || p.severity === "high",
              ).length
            }
          </strong>
        </div>
      </div>
      <p className="kg-note">
        Recorded {new Date(analysis.checkedAt).toLocaleString()}
        {analysis.demo ? " · Fixture timestamp" : ""} ·{" "}
        {networks.find((n) => n.id === analysis.network)?.label}
      </p>
      <div className="kg-approval-filters">
        <label className="kg-filter-search">
          <Search size={15} />
          <input
            aria-label="Filter token or spender"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Token or spender address"
          />
        </label>
        <label>
          Allowance type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All allowances</option>
            <option value="finite">Finite</option>
            <option value="unlimited">Unlimited</option>
            <option value="zero">Zero</option>
          </select>
        </label>
        <label>
          Finding severity
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="all">All findings</option>
            <option value="none">No review finding</option>
            <option value="review">Review recommended</option>
            <option value="high">High priority</option>
            <option value="unknown">Incomplete</option>
          </select>
        </label>
        <label className="kg-check-label">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => setUnlimited(e.target.checked)}
          />{" "}
          Unlimited only
        </label>
      </div>
      <p className="kg-note" role="status">
        {filtered.length} of {approvals.length} returned approvals
      </p>
      {filtered.length ? (
        <div className="kg-approval-list">
          {filtered.slice(page * 25, (page + 1) * 25).map((p) => (
            <article className="kg-approval-row" key={p.id}>
              <div className="kg-token-mark" aria-hidden="true">
                {p.symbol?.slice(0, 1) || "T"}
              </div>
              <div className="kg-approval-asset">
                <h3>{p.symbol || "Token contract"}</h3>
                <CopyValue
                  value={p.token!}
                  label={`Copy ${p.symbol || "token"} contract`}
                  short
                />
                <span className="kg-badge">ERC-20 · {analysis.network}</span>
              </div>
              <div>
                <span className="kg-eyebrow">SPENDER</span>
                <CopyValue
                  value={p.spender}
                  label="Copy spender address"
                  short
                />
                <button
                  className="kg-inline-link"
                  onClick={() => onDetails(p.id)}
                >
                  Evidence & details ↗
                </button>
              </div>
              <div className="kg-approval-amount">
                <span className="kg-eyebrow">ALLOWANCE</span>
                <strong>{formatAllowance(p)}</strong>
                <SeverityBadge severity={p.severity} />
              </div>
              <button
                className="kg-icon-button"
                aria-label={`View ${p.symbol || "token"} ${p.allowanceKind} allowance in Authority Graph`}
                onClick={() => onGraph(p.id)}
              >
                <ArrowUpRight size={18} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title={
            approvals.length
              ? "No approvals match these filters."
              : "No approval records were returned."
          }
        >
          {approvals.length
            ? "Change the filters to inspect other returned records."
            : "This does not establish that the wallet has no permissions. Check the supplied coverage limitations."}
        </EmptyPanel>
      )}
      {filtered.length > 25 && (
        <div className="kg-pagination">
          <button
            className="kg-secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {Math.ceil(filtered.length / 25)}
          </span>
          <button
            className="kg-secondary"
            disabled={(page + 1) * 25 >= filtered.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
