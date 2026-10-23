"use client";
import { useEffect, useRef } from "react";
import { X, ExternalLink, Monitor, Smartphone } from "lucide-react";
import { safeExternalUrl } from "@/lib/yokai/api";
import type { BrowserCapture } from "@/lib/yokai/types";
export function EvidenceDialog({
  captures,
  onClose,
  enlarge = false,
}: {
  captures: BrowserCapture[];
  onClose: () => void;
  enlarge?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`yk-dialog ${enlarge ? "yk-image-dialog" : ""}`}
      aria-labelledby="yk-evidence-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="yk-panel-heading">
        <div>
          <span className="yk-eyebrow">SUPPORTING EVIDENCE</span>
          <h2 id="yk-evidence-title">Browser observations</h2>
        </div>
        <button
          className="yk-icon-button"
          aria-label="Close evidence"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {captures.length ? (
        captures.map((c) => (
          <section key={c.id} className="yk-evidence-record">
            <h3>
              {c.profileId === "mobile" ? (
                <Smartphone size={17} />
              ) : (
                <Monitor size={17} />
              )}
              {c.label}
              <span className="yk-tag">{c.availability}</span>
            </h3>
            <code>{c.id}</code>
            {c.screenshot && (
              <figure className="yk-evidence-image">
                <img
                  src={c.screenshot.url}
                  alt={`${c.screenshot.kind === "illustration" ? "Illustrative demo page" : "Captured page"} for ${c.label}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <figcaption>
                  {c.screenshot.kind === "illustration"
                    ? "Illustrative demo evidence. Not a real browser screenshot."
                    : "Screenshot returned by the investigation service."}
                </figcaption>
              </figure>
            )}
            <dl>
              <div>
                <dt>Page title</dt>
                <dd>{c.title || "Not available"}</dd>
              </div>
              <div>
                <dt>Final URL</dt>
                <dd className="yk-break">
                  {c.finalUrl}
                  {safeExternalUrl(c.finalUrl) && (
                    <a
                      className="yk-inline-link"
                      href={safeExternalUrl(c.finalUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open destination <ExternalLink size={12} />
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt>Viewport</dt>
                <dd>
                  {c.viewport.width} × {c.viewport.height}
                </dd>
              </div>
              <div>
                <dt>User agent</dt>
                <dd>{c.userAgent}</dd>
              </div>
              <div>
                <dt>Cookie state</dt>
                <dd>{c.cookieState}</dd>
              </div>
            </dl>
            {c.notes.map((note) => (
              <p className="yk-field-note" key={note}>
                {note}
              </p>
            ))}
          </section>
        ))
      ) : (
        <p className="yk-muted">
          No supporting capture is available for this finding.
        </p>
      )}
    </dialog>
  );
}
