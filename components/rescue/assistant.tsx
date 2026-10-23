"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  MessageSquareText,
  MousePointer2,
  KeyRound,
  Smartphone,
  Banknote,
  Wallet,
  Phone,
  LifeBuoy,
  Check,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { rescue } from "@/lib/api";
import { config } from "@/lib/config";
import { incidentLabels } from "@/lib/mock-data";
import type { Incident, RescueResponse } from "@/lib/types";
const icons = {
  message: MessageSquareText,
  link: MousePointer2,
  password: KeyRound,
  otp: Smartphone,
  money: Banknote,
  crypto: Wallet,
};
export function RescueAssistant() {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [data, setData] = useState<RescueResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<number[]>([]);
  async function choose(value: Incident) {
    setIncident(value);
    setBusy(true);
    setData(null);
    setError("");
    setCompleted([]);
    try {
      setData(await rescue(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load guidance.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container workspace rescue-workspace">
      <div className="page-heading">
        <span className="eyebrow">
          <LifeBuoy size={13} /> RESCUE MODE
        </span>
        <h1>
          Take a breath.
          <br />
          <span>Let’s find your next step.</span>
        </h1>
        <p>
          You don’t have to figure everything out at once. Start with what
          happened.
        </p>
      </div>
      <div className="rescue-layout">
        <section>
          {!incident ? (
            <>
              <h2 className="incident-title">What’s happened?</h2>
              <div className="incident-grid">
                {(Object.keys(incidentLabels) as Incident[]).map((key) => {
                  const Icon = icons[key];
                  return (
                    <button
                      key={key}
                      className="incident-option"
                      onClick={() => choose(key)}
                    >
                      <Icon size={21} />
                      <span>{incidentLabels[key]}</span>
                      <ArrowUpRight size={16} />
                    </button>
                  );
                })}
              </div>
              <p className="muted small">
                Choose the closest match. You can change it at any time.
              </p>
            </>
          ) : (
            <>
              <button
                className="back-link"
                onClick={() => {
                  setIncident(null);
                  setData(null);
                }}
              >
                {" "}
                <ArrowLeft size={14} /> Choose another situation
              </button>
              <h2 className="incident-title">{incidentLabels[incident]}</h2>
              {busy && (
                <p className="loading-note" role="status">
                  <LoaderCircle className="spin" size={18} />
                  Loading recovery steps…
                </p>
              )}
              {error && (
                <div className="error" role="alert">
                  {error}
                  <Button variant="outline" onClick={() => choose(incident)}>
                    Retry
                  </Button>
                </div>
              )}
              {data && (
                <>
                  {data.demo && (
                    <p className="demo-note">
                      <span>DEMO GUIDANCE</span> General recovery checklist.
                      Adapt it to your situation.
                    </p>
                  )}
                  <div className="recovery-steps">
                    {data.steps.map((step, index) => (
                      <label
                        key={step}
                        className={
                          completed.includes(index)
                            ? "recovery-step complete"
                            : "recovery-step"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={completed.includes(index)}
                          onChange={() =>
                            setCompleted((previous) =>
                              previous.includes(index)
                                ? previous.filter((i) => i !== index)
                                : [...previous, index],
                            )
                          }
                        />
                        <span className="step-check">
                          {completed.includes(index) ? (
                            <Check size={16} />
                          ) : (
                            String(index + 1).padStart(2, "0")
                          )}
                        </span>
                        <span>{step}</span>
                      </label>
                    ))}
                  </div>
                  <p className="completion" role="status">
                    {completed.length} of {data.steps.length} steps checked
                  </p>
                  <div className="preserve">
                    <h3>Keep a record</h3>
                    {data.preserve.map((s) => (
                      <p key={s}>
                        <Check size={14} />
                        {s}
                      </p>
                    ))}
                  </div>
                  <p className="recovery-warning">{data.warning}</p>
                </>
              )}
            </>
          )}
        </section>
        <aside className="urgent-help">
          <span className="urgent-icon">
            <Phone size={22} />
          </span>
          <span className="eyebrow">FINANCIAL FRAUD IN INDIA</span>
          <h2>
            Money transferred?
            <br />
            Act promptly.
          </h2>
          <p>
            Contact your bank or payment provider immediately. Use India’s
            official reporting channels.
          </p>
          <a href="tel:1930" className="helpline">
            1930 <ArrowUpRight size={23} />
          </a>
          <span className="small-label">NATIONAL CYBERCRIME HELPLINE</span>
          <Button variant="outline" asChild>
            <a
              href="https://cybercrime.gov.in"
              target="_blank"
              rel="noreferrer"
            >
              Report cybercrime <ArrowUpRight size={15} />
            </a>
          </Button>
          <a
            className="source-link"
            href="https://www.pib.gov.in/PressReleasePage.aspx?PRID=2241344&lang=1&reg=1"
            target="_blank"
            rel="noreferrer"
          >
            Official reporting information <ArrowUpRight size={11} />
          </a>
          <p className="small muted">
            Prompt reporting may help. Fund recovery or reversal cannot be
            guaranteed.
          </p>
        </aside>
      </div>
    </div>
  );
}
