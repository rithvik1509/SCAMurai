"use client";
import { Scissors, RotateCcw } from "lucide-react";
import {
  modeledSummary,
  formatAllowance,
  type WalletAnalysis,
} from "@/lib/kagami/types";
export function BreakpointLab({
  analysis,
  removed,
  onToggle,
  onReset,
}: {
  analysis: WalletAnalysis;
  removed: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const summary = modeledSummary(analysis, removed);
  const candidates = analysis.permissions.filter(
    (p) =>
      p.active &&
      p.modelRemovable &&
      analysis.graph?.edges.some((e) => e.permissionId === p.id),
  );
  return (
    <section className="kg-panel kg-breakpoint">
      <header className="kg-panel-heading">
        <div>
          <span className="kg-eyebrow">PERMISSION BREAKPOINT LAB</span>
          <h2>What if this path disappeared?</h2>
        </div>
        <button
          className="kg-secondary"
          disabled={!removed.length}
          onClick={onReset}
        >
          <RotateCcw size={14} /> Reset all changes
        </button>
      </header>
      <p className="kg-simulation-notice">
        <Scissors size={16} /> Simulation only. No real wallet permissions have
        been changed.
      </p>
      <div className="kg-model-summary">
        <div>
          <span>Current modeled paths</span>
          <strong>{summary.current}</strong>
        </div>
        <div>
          <span>Virtually disabled</span>
          <strong>{summary.removed}</strong>
        </div>
        <div>
          <span>Remaining modeled paths</span>
          <strong>{summary.remaining}</strong>
        </div>
      </div>
      {candidates.length ? (
        <div className="kg-breakpoint-list">
          {candidates.map((p) => (
            <div
              key={p.id}
              className={removed.includes(p.id) ? "is-removed" : ""}
            >
              <span>
                <strong>
                  {p.type === "delegation"
                    ? "EIP-7702 delegation"
                    : `${p.symbol || p.token} allowance`}
                </strong>
                <small>{formatAllowance(p)}</small>
              </span>
              <button
                className="kg-secondary"
                aria-pressed={removed.includes(p.id)}
                onClick={() => onToggle(p.id)}
              >
                {removed.includes(p.id) ? "Restore" : "Simulate removal"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="kg-note">
          The service supplied no active relationships with a supported removal
          model.
        </p>
      )}
      <p className="kg-note">
        Only edges explicitly attached to the selected permission are disabled.
        Indirect behavior and other permissions are outside this model. Fewer
        modeled paths do not guarantee wallet safety.
      </p>
    </section>
  );
}
