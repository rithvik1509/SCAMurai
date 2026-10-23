import Link from "next/link";
import {
  ArrowUpRight,
  ScanLine,
  GitCompareArrows,
  LockKeyhole,
  CircleHelp,
  Check,
  LifeBuoy,
  ArrowRight,
} from "lucide-react";
import { Scanner } from "@/components/scanner/scanner";
import type { ProtectionMode } from "@/lib/workspace";
export function ModeWorkspace({
  mode,
  tool,
}: {
  mode: ProtectionMode;
  tool: string;
}) {
  const crypto = mode === "kagami";
  const compare = tool === "compare";
  return (
    <div className="mode-workspace">
      <section className={`mode-intro ${mode}`}>
        <div>
          <span className="mode-intro-label">
            {crypto
              ? "KAGAMI / TRANSACTION TRUTH MODE"
              : "KAGE / SCAM INTELLIGENCE MODE"}
          </span>
          <h2>
            {crypto ? (
              <>
                Your signature.
                <br />
                <span>Know its power.</span>
              </>
            ) : (
              <>
                Pause the pressure.
                <br />
                <span>Read the request.</span>
              </>
            )}
          </h2>
          <p>
            {crypto
              ? "Reflect the transaction. Reveal the truth. Understand the permission before you approve it."
              : "See the shadow before it strikes. Look past urgency, impersonation, and unusual requests."}
          </p>
        </div>
        <div className="mode-intro-art" aria-hidden="true">
          <i />
          <i />
          {crypto ? <GitCompareArrows size={62} /> : <ScanLine size={62} />}
        </div>
        <Link href="/dashboard">
          Switch mode <ArrowUpRight size={14} />
        </Link>
      </section>
      <div className="mode-workspace-grid">
        <div className="mode-working-column">
          {crypto && (
            <nav className="crypto-tool-tabs" aria-label="KAGAMI tools">
              <Link
                href="/dashboard/kagami?tool=inspect"
                aria-current={!compare ? "page" : undefined}
              >
                Transaction inspection
              </Link>
              <Link
                href="/dashboard/kagami?tool=compare"
                aria-current={compare ? "page" : undefined}
              >
                Promise vs. Action
              </Link>
            </nav>
          )}
          <Scanner
            key={`${mode}-${tool}`}
            workspaceMode={mode}
            initialMode={crypto ? "crypto" : tool === "url" ? "url" : "message"}
            cryptoOnly={crypto}
            intentCompare={compare}
          />
          {crypto && (
            <section className="console-card comparison-explainer">
              <div className="console-card-title">
                <h3>Read the gap between promise and permission.</h3>
                <GitCompareArrows size={18} />
              </div>
              <span className="example-disclaimer">ILLUSTRATIVE EXAMPLE</span>
              <div className="light-comparison">
                <div>
                  <span>THE PROMISE</span>
                  <p>“Claim your free USDT reward.”</p>
                </div>
                <ArrowRight size={20} />
                <div>
                  <span>THE PERMISSION</span>
                  <p>Allow unlimited token spending.</p>
                </div>
              </div>
              <p>
                Unlimited approvals can be legitimate. Context and the spender
                matter.
              </p>
            </section>
          )}
        </div>
        <aside className="mode-guidance">
          <section className="console-card">
            <span className="guidance-icon">
              <CircleHelp size={20} />
            </span>
            <h3>{crypto ? "Know what to inspect" : "A second look helps."}</h3>
            <p>
              {crypto
                ? "Paste transaction calldata, choose the network, and optionally add the token contract. No wallet connection is required."
                : "Paste the full message for context, or use a complete HTTP/HTTPS URL. You can start with a labeled example."}
            </p>
            <div className="guidance-checklist">
              {(crypto
                ? [
                    "Identify the spender",
                    "Read the allowance",
                    "Compare the claimed outcome",
                  ]
                : [
                    "Review the pressure tactics",
                    "Inspect the request for money",
                    "Check the supporting evidence",
                  ]
              ).map((text) => (
                <span key={text}>
                  <Check size={13} />
                  {text}
                </span>
              ))}
            </div>
          </section>
          <section className="console-card privacy-card">
            <LockKeyhole size={19} />
            <h3>Keep private things private.</h3>
            <p>
              Never paste passwords, OTPs, private keys, or seed phrases. Remove
              personal details before submitting.
            </p>
          </section>
          <Link href="/rescue" className="mode-rescue-card">
            <LifeBuoy size={21} />
            <span>
              <strong>Already acted?</strong>
              <small>Find a calm, practical next step.</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          <p className="mode-limit-note">
            A low risk score is not a safety guarantee. Review the evidence and
            limitations in every report.
          </p>
        </aside>
      </div>
    </div>
  );
}
