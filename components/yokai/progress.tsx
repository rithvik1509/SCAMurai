"use client";
import { useEffect, useState } from "react";
import { Clock3, LoaderCircle, CheckCircle2, CircleAlert } from "lucide-react";
import {
  statusLabels,
  terminalStatuses,
  type Investigation,
} from "@/lib/yokai/types";
export function InvestigationProgress({
  job,
  canCancel,
  busy,
  onCancel,
}: {
  job: Investigation;
  canCancel: boolean;
  busy: boolean;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const terminal = terminalStatuses.includes(job.status);
  useEffect(() => {
    if (terminal || job.demo) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [terminal, job.demo]);
  const elapsed = Math.max(
    0,
    Math.floor(
      ((terminal ? Date.parse(job.updatedAt) : now) -
        Date.parse(job.createdAt)) /
        1000,
    ),
  );
  const Icon =
    job.status === "completed"
      ? CheckCircle2
      : terminal
        ? CircleAlert
        : LoaderCircle;
  return (
    <section className="yk-panel yk-progress" aria-live="polite">
      <div className="yk-panel-heading">
        <h2>
          <Icon size={21} className={terminal ? "" : "spin"} />
          {statusLabels[job.status]}
        </h2>
        {!job.demo && (
          <span className="yk-elapsed">
            <Clock3 size={14} /> {Math.floor(elapsed / 60)}m {elapsed % 60}s
            elapsed
          </span>
        )}
      </div>
      <p className="yk-break">{job.targetUrl}</p>
      {job.error && <p className="yk-error">{job.error}</p>}
      <ol>
        {job.events.map((event, i) => (
          <li key={`${event.at}-${i}`}>
            <span>{statusLabels[event.status]}</span>
            <p>{event.message}</p>
            <time dateTime={event.at}>
              {new Date(event.at).toLocaleTimeString()}
            </time>
          </li>
        ))}
      </ol>
      {canCancel && !terminal && (
        <button className="yk-secondary" disabled={busy} onClick={onCancel}>
          Request cancellation
        </button>
      )}
      {job.status === "completed" && !job.result && (
        <p className="yk-muted">
          This investigation has no comparison evidence available.
        </p>
      )}
    </section>
  );
}
