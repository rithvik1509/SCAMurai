import type { BrowserCapture, Finding } from "@/lib/yokai/types";

export function EvidenceSummary({
  captures,
  findings,
}: {
  captures: BrowserCapture[];
  findings: Finding[];
}) {
  const complete = captures.filter((c) => c.availability === "complete").length;
  const review = findings.filter(
    (f) =>
      f.tone === "sensitive" ||
      f.severity === "medium" ||
      f.severity === "high",
  ).length;
  const title =
    complete < 2
      ? "Comparison is inconclusive"
      : review > 0
        ? "Review the observed warnings"
        : complete < captures.length
          ? "Some profile evidence is missing"
          : "No sensitive difference established";
  return (
    <section
      className="yk-evidence-summary"
      aria-label="Investigation evidence summary"
    >
      <div>
        <span className="yk-eyebrow">OBSERVATION SUMMARY</span>
        <h3>{title}</h3>
        <p>
          {complete < 2
            ? "At least two complete captures are needed. Failed loads and access challenges cannot establish normal website behavior."
            : "This describes the captured profiles and observation window. It is not a verdict that the website is safe or malicious."}
        </p>
      </div>
      <dl>
        <div>
          <dt>Complete captures</dt>
          <dd>
            {complete} / {captures.length}
          </dd>
        </div>
        <div>
          <dt>Warnings to review</dt>
          <dd>{review}</dd>
        </div>
      </dl>
    </section>
  );
}
