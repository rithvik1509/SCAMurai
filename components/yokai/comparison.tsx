"use client";
import { useState } from "react";
import {
  Image as ImageIcon,
  ListTree,
  TextCursorInput,
  Network,
  Maximize2,
  ArrowRight,
  Monitor,
  Smartphone,
  CircleHelp,
} from "lucide-react";
import type { BrowserCapture, Finding } from "@/lib/yokai/types";
import { EvidenceSummary } from "./evidence-summary";
type View = "screenshots" | "structure" | "forms" | "network";
const views = [
  { id: "screenshots" as const, label: "Screenshots", Icon: ImageIcon },
  { id: "structure" as const, label: "Page structure", Icon: ListTree },
  { id: "forms" as const, label: "Forms", Icon: TextCursorInput },
  { id: "network" as const, label: "Network", Icon: Network },
];
export function BrowserComparison({
  captures,
  findings,
  onEvidence,
}: {
  captures: BrowserCapture[];
  findings: Finding[];
  onEvidence: (ids: string[], enlarge?: boolean) => void;
}) {
  const [view, setView] = useState<View>("screenshots");
  const [left, setLeft] = useState(captures[0]?.id || "");
  const [right, setRight] = useState(captures[1]?.id || "");
  const [mobilePanel, setMobilePanel] = useState(0);
  if (!captures.length)
    return (
      <div className="yk-panel yk-empty">
        <CircleHelp size={28} />
        <h2>No browser captures were returned.</h2>
        <p>
          Available findings can still be reviewed in the report. Missing
          evidence is not a clean result.
        </p>
      </div>
    );
  const selected = [
    captures.find((c) => c.id === left) || captures[0],
    captures.find((c) => c.id === right),
  ].filter((c): c is BrowserCapture => !!c);
  function select(index: number, id: string) {
    if (index === 0) {
      if (id === right) setRight(left);
      setLeft(id);
    } else {
      if (id === left) setLeft(right);
      setRight(id);
    }
  }
  return (
    <div className="yk-comparison">
      <div className="yk-view-bar">
        <div>
          <span className="yk-eyebrow">THE DIFFERENTIAL VIEW</span>
          <h2>Same target. Compare the evidence.</h2>
        </div>
        <div
          className="yk-view-tabs"
          role="tablist"
          aria-label="Evidence display"
        >
          {views.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              id={`yk-view-${id}`}
              aria-controls="yk-comparison-panels"
              aria-selected={view === id}
              tabIndex={view === id ? 0 : -1}
              onKeyDown={(event) => {
                const index = views.findIndex((v) => v.id === id);
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % views.length
                    : event.key === "ArrowLeft"
                      ? (index + views.length - 1) % views.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? views.length - 1
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                setView(views[next].id);
                document.getElementById(`yk-view-${views[next].id}`)?.focus();
              }}
              onClick={() => setView(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>
      <EvidenceSummary captures={captures} findings={findings} />
      {findings
        .filter((f) => f.tone !== "normal")
        .map((f) => (
          <button
            className={`yk-difference-callout tone-${f.tone}`}
            key={f.id}
            onClick={() => onEvidence(f.evidenceIds)}
          >
            <span>
              <strong>{f.title}</strong>
              {f.severity && <small>Review priority: {f.severity}</small>}
              <small>{f.explanation}</small>
              {f.confidence && <small>{f.confidence}</small>}
            </span>
            <ArrowRight size={18} />
          </button>
        ))}
      <div
        className="yk-mobile-profiles"
        role="group"
        aria-label="Visible comparison profile"
      >
        {selected.map((c, index) => (
          <button
            key={c.id}
            aria-pressed={mobilePanel === index}
            onClick={() => setMobilePanel(index)}
          >
            {c.profileId === "mobile" ? (
              <Smartphone size={16} />
            ) : (
              <Monitor size={16} />
            )}
            {c.label}
          </button>
        ))}
      </div>
      <div
        className="yk-browser-grid"
        id="yk-comparison-panels"
        role="tabpanel"
        aria-labelledby={`yk-view-${view}`}
      >
        {selected.map((c, index) => (
          <article
            key={`${index}-${c.id}`}
            className={`yk-browser yk-mobile-panel-${index} ${mobilePanel === index ? "mobile-visible" : ""}`}
          >
            <div className="yk-browser-toolbar">
              <span className="yk-browser-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <label>
                <span className="sr-only">
                  {index === 0 ? "Left" : "Right"} comparison profile
                </span>
                <select
                  value={c.id}
                  onChange={(e) => select(index, e.target.value)}
                >
                  {captures.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} investigation
                    </option>
                  ))}
                </select>
              </label>
              <span
                className={`yk-availability availability-${c.availability}`}
              >
                {c.availability}
              </span>
            </div>
            <div className="yk-browser-address">
              <span>{c.finalUrl}</span>
            </div>
            {c.availability === "unavailable" ? (
              <div className="yk-capture-empty">
                <CircleHelp size={25} />
                <p>Evidence unavailable for this profile.</p>
                {c.notes.map((note) => (
                  <small key={note}>{note}</small>
                ))}
              </div>
            ) : view === "screenshots" ? (
              c.screenshot ? (
                <figure
                  className={`yk-capture ${c.profileId === "mobile" ? "is-mobile-capture" : ""}`}
                >
                  <button
                    aria-label={`Enlarge ${c.label} evidence`}
                    onClick={() => onEvidence([c.id], true)}
                  >
                    <img
                      src={c.screenshot.url}
                      alt={`${c.screenshot.kind === "illustration" ? "Illustrative fixture" : "Captured website"}, ${c.label}: ${c.title}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    <span>
                      <Maximize2 size={14} /> Enlarge
                    </span>
                  </button>
                  <figcaption>
                    {c.screenshot.kind === "illustration"
                      ? "ILLUSTRATIVE DEMO CAPTURE · NOT A LIVE WEBSITE"
                      : "CAPTURED BY THE INVESTIGATION SERVICE"}
                  </figcaption>
                </figure>
              ) : (
                <div className="yk-capture-empty">
                  <ImageIcon size={26} />
                  <p>No screenshot was returned.</p>
                </div>
              )
            ) : view === "structure" ? (
              <div className="yk-browser-content">
                <h3>Page structure</h3>
                {c.structure ? (
                  <>
                    <dl>
                      <div>
                        <dt>Title</dt>
                        <dd>{c.title}</dd>
                      </div>
                      <div>
                        <dt>Language</dt>
                        <dd>{c.structure.language}</dd>
                      </div>
                      <div>
                        <dt>Links observed</dt>
                        <dd>{c.structure.linkCount}</dd>
                      </div>
                    </dl>
                    <h4>Recorded headings</h4>
                    <ol className="yk-heading-list">
                      {c.structure.headings.map((heading, i) => (
                        <li key={`${heading}-${i}`}>{heading}</li>
                      ))}
                    </ol>
                    {!!c.structure.actionLabels?.length && (
                      <>
                        <h4>Visible actions</h4>
                        <ul className="yk-heading-list">
                          {c.structure.actionLabels.map((label, i) => (
                            <li key={i}>{label}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {!!c.structure.textBlocks?.length && (
                      <details>
                        <summary>
                          Recorded visible text ({c.structure.textBlocks.length}{" "}
                          excerpts)
                        </summary>
                        <ol className="yk-heading-list">
                          {c.structure.textBlocks.map((text, i) => (
                            <li key={i}>{text}</li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </>
                ) : (
                  <p className="yk-muted">
                    Page structure evidence was not returned.
                  </p>
                )}
              </div>
            ) : view === "forms" ? (
              <div className="yk-browser-content">
                <h3>
                  Forms observed{" "}
                  <span className="yk-tag">{c.forms.length}</span>
                </h3>
                {c.forms.length ? (
                  c.forms.map((form) => (
                    <section
                      key={form.id}
                      className={
                        form.sensitive
                          ? "yk-form-evidence sensitive"
                          : "yk-form-evidence"
                      }
                    >
                      <h4>{form.label}</h4>
                      <span className="yk-tag">
                        {form.sensitive ? "Sensitive fields" : "Observed form"}
                      </span>
                      <dl>
                        <div>
                          <dt>Method</dt>
                          <dd>{form.method}</dd>
                        </div>
                        <div>
                          <dt>Action</dt>
                          <dd className="yk-break">{form.action}</dd>
                        </div>
                      </dl>
                      <ul>
                        {form.fields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </section>
                  ))
                ) : (
                  <div className="yk-no-observation">
                    <TextCursorInput size={26} />
                    <p>No form recorded in this capture.</p>
                    <small>
                      This describes the observation only; it is not a safety
                      guarantee.
                    </small>
                  </div>
                )}
              </div>
            ) : (
              <div className="yk-browser-content">
                <h3>
                  Network destinations{" "}
                  <span className="yk-tag">{c.network.length}</span>
                </h3>
                {c.network.length ? (
                  <div className="yk-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Method</th>
                          <th>Observed destination</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.network.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <code>{request.method}</code>
                            </td>
                            <td className="yk-break">
                              {request.url}
                              <small>{request.kind}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="yk-muted">
                    No network destination evidence was returned.
                  </p>
                )}
              </div>
            )}
            <div className="yk-browser-meta">
              <span>
                {c.viewport.width} × {c.viewport.height}
              </span>
              <button onClick={() => onEvidence([c.id])}>
                Profile & evidence details <ArrowRight size={12} />
              </button>
            </div>
            <details className="yk-redirects">
              <summary>
                Redirect path{" "}
                <span>
                  {c.redirects.length
                    ? `${c.redirects.length} recorded`
                    : "None recorded"}
                </span>
              </summary>
              {c.redirects.length ? (
                <ol>
                  {c.redirects.map((r, i) => (
                    <li key={i}>
                      <code>{r.from}</code>
                      <span>
                        HTTP {r.status} <ArrowRight size={12} />
                      </span>
                      <code>{r.to}</code>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>The service recorded no redirects for this capture.</p>
              )}
            </details>
          </article>
        ))}
      </div>
      <p className="yk-comparison-note">
        <CircleHelp size={14} /> Compare context before drawing conclusions.
        Responsive layouts, experiments, and session state can all explain
        differences.
      </p>
    </div>
  );
}
