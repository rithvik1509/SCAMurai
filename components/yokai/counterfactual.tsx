import type { Counterfactual } from "@/lib/yokai/types";
export function CounterfactualView({
  items,
  onEvidence,
}: {
  items: Counterfactual[];
  onEvidence: (ids: string[]) => void;
}) {
  return (
    <section className="yk-panel">
      <span className="yk-eyebrow">CHANGE ONE THING. EXAMINE THE RESULT.</span>
      <h2>Counterfactual analysis</h2>
      <p className="yk-muted">
        Separate controlled observations from correlation and missing evidence.
      </p>
      {items.length ? (
        items.map((item) => (
          <article className="yk-counterfactual" key={item.id}>
            <div className="yk-panel-heading">
              <h3>{item.title}</h3>
              <span className="yk-tag">{item.conclusion}</span>
            </div>
            <div className="yk-cf-grid">
              {[
                ["Baseline", item.baseline],
                ["Changed variable", item.changedVariable],
                ["Observed result", item.observedResult],
              ].map(([label, text], i) => (
                <div key={label}>
                  <span className="yk-eyebrow">
                    0{i + 1} / {label}
                  </span>
                  <p>{text}</p>
                </div>
              ))}
            </div>
            <p>{item.finding}</p>
            <button
              className="yk-secondary"
              onClick={() => onEvidence(item.evidenceIds)}
            >
              Inspect supporting evidence ↗
            </button>
          </article>
        ))
      ) : (
        <p>No counterfactual observations were returned.</p>
      )}
    </section>
  );
}
