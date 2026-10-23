"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ScanLine,
  Monitor,
  Smartphone,
  Columns2,
  Network,
  GitCompareArrows,
  FileText,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { config } from "@/lib/config";
import { useInvestigation } from "@/lib/yokai/use-investigation";
import { InvestigationLauncher } from "./launcher";
import { InvestigationProgress } from "./progress";
import { BrowserComparison } from "./comparison";
import { CounterfactualView } from "./counterfactual";
import { InvestigationReport } from "./report";
import { EvidenceDialog } from "./evidence-dialog";
const BehaviorGraph = dynamic(() => import("./behavior-graph"), {
  ssr: false,
  loading: () => (
    <div className="yk-panel yk-empty" role="status">
      Loading evidence graph…
    </div>
  ),
});
type View = "launch" | "compare" | "graph" | "counterfactual" | "report";
const tabs = [
  { id: "launch" as const, label: "Investigate", Icon: ScanLine },
  { id: "compare" as const, label: "Compare", Icon: Columns2 },
  { id: "graph" as const, label: "Graph", Icon: Network },
  {
    id: "counterfactual" as const,
    label: "Counterfactual",
    Icon: GitCompareArrows,
  },
  { id: "report" as const, label: "Report", Icon: FileText },
];
function revealView(view: View) {
  requestAnimationFrame(() => {
    const mobile = window.matchMedia("(max-width:640px)").matches;
    const selector = mobile
      ? view === "launch"
        ? ".yk-launch-grid"
        : ".yk-result-view"
      : ".yk-navigation:not(.yk-navigation-mobile)";
    document
      .querySelector(selector)
      ?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  });
}
export function YokaiWorkspace({ initialId }: { initialId?: string }) {
  const state = useInvestigation(initialId);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [demoMode, setDemoMode] = useState(config.demo);
  const [view, setView] = useState<View>("launch");
  const [evidence, setEvidence] = useState<{
    ids: string[];
    enlarge: boolean;
  } | null>(null);
  const result = state.job?.result;
  const displayingDemo = view === "launch" ? demoMode : state.job?.demo;
  const launcherCapabilities = demoMode
    ? {
        available: true,
        profiles: [
          "desktop",
          "mobile",
          "returning",
        ] as import("@/lib/yokai/types").ProfileId[],
        allowedOrigins: [],
        cancellation: false,
        authorizationPolicy:
          "Controlled demo fixtures only. No website will be visited.",
      }
    : state.capabilities;
  useEffect(() => {
    if (state.job?.result) {
      setView("compare");
      setDemoMode(state.job.demo);
      revealView("compare");
    }
  }, [state.job?.id, !!state.job?.result]);
  const showEvidence = (ids: string[], enlarge = false) =>
    setEvidence({ ids, enlarge });
  const newInvestigation = () => {
    setView("launch");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const navigation = (mobile: boolean) => (
    <nav
      className={`yk-navigation ${mobile ? "yk-navigation-mobile" : ""}`}
      aria-label="Investigation views"
    >
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          disabled={id !== "launch" && !result}
          aria-current={view === id ? "page" : undefined}
          onClick={() => {
            setView(id);
            revealView(id);
          }}
        >
          <Icon size={17} />
          <span
            className={id === "counterfactual" ? "yk-desktop-label" : undefined}
          >
            {label}
          </span>
          {id === "counterfactual" && (
            <span className="yk-mobile-label">What-if</span>
          )}
        </button>
      ))}
    </nav>
  );
  return (
    <div className="yk-workspace">
      <header className="yk-hero">
        <div>
          <span className="yk-eyebrow">KAGE / DIFFERENTIAL INVESTIGATION</span>
          <h1>
            YŌKAI<span>One site. Every perspective.</span>
          </h1>
          <p>
            Look closer at what changes between visitors. Follow the page, the
            redirects, and the evidence.
          </p>
        </div>
        <div className="yk-hero-mark" aria-hidden="true">
          <div className="yk-hero-browser yk-hero-desktop">
            <div>
              <Monitor size={13} />
              <span>Desktop</span>
              <i />
              <i />
              <i />
            </div>
            <section>
              <b />
              <b />
              <b />
              <b />
            </section>
            <footer>
              <span>同じサイト / SAME TARGET</span>
              <ScanLine size={16} />
            </footer>
          </div>
          <div className="yk-hero-browser yk-hero-mobile">
            <div>
              <Smartphone size={12} />
              <span>Mobile</span>
            </div>
            <section>
              <b />
              <b />
              <b />
            </section>
            <footer>別の視点</footer>
          </div>
        </div>
        <Link href="/dashboard">
          All modes <ArrowUpRight size={15} />
        </Link>
      </header>
      <div className="yk-status-strip">
        <span>
          <i />
          {displayingDemo ? "Demo workspace" : "Investigation workspace"}
        </span>
        <p>
          {displayingDemo
            ? "Fictional examples · No live browsing"
            : "Authorized targets only · Evidence from the connected service"}
        </p>
        {!config.demo && view === "launch" && (
          <button
            className="yk-secondary yk-demo-switch"
            onClick={() => setDemoMode(!demoMode)}
          >
            {demoMode ? "Use connected service" : "Explore demo examples"}
            <ArrowUpRight size={14} />
          </button>
        )}
        {result && view !== "launch" && (
          <button className="yk-secondary" onClick={newInvestigation}>
            <Plus size={14} /> New investigation
          </button>
        )}
      </div>
      {navigation(false)}
      {mounted && createPortal(navigation(true), document.body)}
      {state.error && (
        <div className="yk-error yk-error-banner" role="alert">
          <p>{state.error}</p>
          <button className="yk-secondary" onClick={state.retry}>
            Retry connection
          </button>
        </div>
      )}
      {state.storageNote && (
        <p className="yk-field-note">{state.storageNote}</p>
      )}
      {state.busy && !state.job && (
        <p role="status" className="yk-panel">
          Opening investigation…
        </p>
      )}
      {state.job && (!result || view === "report") && (
        <InvestigationProgress
          job={state.job}
          canCancel={!!state.capabilities?.cancellation}
          busy={state.busy}
          onCancel={state.cancel}
        />
      )}
      {view === "launch" && (
        <InvestigationLauncher
          demo={demoMode}
          capabilities={launcherCapabilities}
          busy={state.busy}
          history={state.history}
          onStart={(input, scenario) => state.start(input, scenario, demoMode)}
          onOpen={(id) => {
            if (id === state.job?.id) setView("compare");
            else state.open(id);
          }}
        />
      )}
      {result && state.job && (
        <div key={`${state.job.id}-${view}`} className="yk-result-view">
          {view === "compare" && (
            <BrowserComparison
              captures={result.captures}
              findings={result.findings}
              onEvidence={showEvidence}
            />
          )}
          {view === "graph" && (
            <BehaviorGraph graph={result.graph} onEvidence={showEvidence} />
          )}
          {view === "counterfactual" && (
            <CounterfactualView
              items={result.counterfactuals}
              onEvidence={showEvidence}
            />
          )}
          {view === "report" && (
            <InvestigationReport
              job={state.job}
              onEvidence={showEvidence}
              onNew={newInvestigation}
            />
          )}
        </div>
      )}
      {evidence && (
        <EvidenceDialog
          captures={
            result?.captures.filter((c) => evidence.ids.includes(c.id)) || []
          }
          enlarge={evidence.enlarge}
          onClose={() => setEvidence(null)}
        />
      )}
    </div>
  );
}
