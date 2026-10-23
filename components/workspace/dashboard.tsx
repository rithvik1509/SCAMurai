"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ScanLine,
  GitCompareArrows,
  ArrowRight,
  Clock3,
  CircleHelp,
  Activity,
  MoveUpRight,
} from "lucide-react";
import { readRecent, type RecentCheck } from "@/lib/workspace";
import { readHistory, type HistoryItem } from "@/lib/yokai/session";
import { statusLabels } from "@/lib/yokai/types";
import { readWalletSnapshot } from "@/lib/kagami/session";
import type { WalletAnalysis } from "@/lib/kagami/types";
import { toolLinks } from "./workspace-shell";

export function Dashboard() {
  const [walletInvestigation, setWalletInvestigation] =
    useState<WalletAnalysis | null>(null);
  const [recent, setRecent] = useState<RecentCheck[]>([]);
  const [investigation, setInvestigation] = useState<HistoryItem | null>(null);
  useEffect(() => {
    const refresh = () => {
      const wallet = readWalletSnapshot();
      setWalletInvestigation(wallet);
      setRecent(readRecent().filter((item) => item.mode !== "kage" && !wallet));
      setInvestigation(readHistory()[0] || null);
    };
    refresh();
    window.addEventListener("scamurai-workspace", refresh);
    return () => window.removeEventListener("scamurai-workspace", refresh);
  }, []);
  return (
    <div className="dashboard-view">
      <div className="dashboard-top-grid">
        <section className="overview-panel">
          <div className="overview-panel-top">
            <span className="overview-eyebrow">YOUR SCAMURAI WORKSPACE</span>
            <span className="overview-symbol">
              <ScanLine size={21} />
            </span>
          </div>
          <h2>
            A little doubt.
            <br />
            <span>A clearer next move.</span>
          </h2>
          <p>
            Choose what you want to inspect. Understand the request before you
            act on it.
          </p>
          <div className="overview-mini-grid">
            <div>
              <span>Protection modes</span>
              <strong>
                02 <small>One connected workspace</small>
              </strong>
            </div>
            <div>
              <span>Reports in this tab</span>
              <strong>
                {String(
                  recent.length +
                    (investigation ? 1 : 0) +
                    (walletInvestigation ? 1 : 0),
                ).padStart(2, "0")}{" "}
                <small>
                  {recent.length || investigation || walletInvestigation
                    ? "Your latest check in each mode"
                    : "Your first check starts here"}
                </small>
              </strong>
            </div>
          </div>
        </section>
        <section className="console-card workspace-glance">
          <div className="console-card-title">
            <h2>Make your next move informed.</h2>
            <CircleHelp size={17} />
          </div>
          <p>Two modes. Different questions. The same clarity.</p>
          <div className="glance-body">
            <div className="mode-orbit">
              <span>
                02<small>protection modes</small>
              </span>
            </div>
            <div className="glance-legend">
              <Link href="/dashboard/kage">
                <i className="legend-lime" />
                <span>
                  KAGE<small>Website investigations</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/dashboard/kagami">
                <i className="legend-cyan" />
                <span>
                  KAGAMI<small>Wallet permissions</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <div className="glance-foot">
            <span>Demonstration workspace</span>
            <span>No account credentials collected</span>
          </div>
        </section>
      </div>
      <div className="console-section-heading">
        <div>
          <h2>Choose your protection mode</h2>
          <p>Start with the question you’re trying to answer.</p>
        </div>
        <span>
          BUILT FOR YOUR NEXT MOVE <ArrowRight size={13} />
        </span>
      </div>
      <div className="mode-entry-grid">
        <Link href="/dashboard/kage" className="mode-entry kage-entry">
          <div className="mode-entry-top">
            <span className="mode-emblem">
              <ScanLine size={23} />
            </span>
            <span className="mode-entry-arrow">
              <ArrowUpRight size={20} />
            </span>
          </div>
          <div className="mode-entry-copy">
            <span className="mode-entry-subtitle">
              WEBSITE INTELLIGENCE MODE
            </span>
            <h2>
              KAGE<span>影</span>
            </h2>
            <p>One website. Compare every perspective.</p>
          </div>
          <div className="mode-entry-bottom">
            <span>YŌKAI · Profiles · Behavioral evidence</span>
            <strong>
              Investigate with YŌKAI <ArrowRight size={15} />
            </strong>
          </div>
          <div className="mode-entry-art kage-entry-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <ScanLine size={55} />
          </div>
        </Link>
        <Link href="/dashboard/kagami" className="mode-entry kagami-entry">
          <div className="mode-entry-top">
            <span className="mode-emblem">
              <GitCompareArrows size={23} />
            </span>
            <span className="mode-entry-arrow">
              <ArrowUpRight size={20} />
            </span>
          </div>
          <div className="mode-entry-copy">
            <span className="mode-entry-subtitle">TRANSACTION TRUTH MODE</span>
            <h2>
              KAGAMI<span>鏡</span>
            </h2>
            <p>Map the permission. Preview the consequence.</p>
          </div>
          <div className="mode-entry-bottom">
            <span>KUROKAGI · Approval Timebomb · FutureView</span>
            <strong>
              Investigate with KAGAMI <ArrowRight size={15} />
            </strong>
          </div>
          <div className="mode-entry-art kagami-entry-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <GitCompareArrows size={55} />
          </div>
        </Link>
      </div>
      <div className="dashboard-bottom-grid">
        <section className="console-card recent-panel">
          <div className="console-card-title">
            <h2>Latest checks</h2>
            <span className="console-small-badge">THIS TAB ONLY</span>
          </div>
          <p>
            Your latest report from each mode. Nothing is saved to an account.
          </p>
          {recent.length || investigation || walletInvestigation ? (
            <div className="recent-list">
              {walletInvestigation && (
                <Link href="/dashboard/kagami?module=authority">
                  <span className="recent-icon kagami">
                    <GitCompareArrows size={18} />
                  </span>
                  <div>
                    <strong>KUROKAGI wallet investigation</strong>
                    <small>
                      KAGAMI · {walletInvestigation.network} ·{" "}
                      {walletInvestigation.demo
                        ? "Demo fixture"
                        : "Service result"}
                    </small>
                  </div>
                  <span className="console-small-badge">
                    {walletInvestigation.status}
                  </span>
                  <ArrowUpRight size={16} />
                </Link>
              )}
              {investigation && (
                <Link
                  href={`/dashboard/kage?id=${encodeURIComponent(investigation.id)}`}
                >
                  <span className="recent-icon kage">
                    <ScanLine size={18} />
                  </span>
                  <div>
                    <strong>YŌKAI website investigation</strong>
                    <small>
                      KAGE ·{" "}
                      {new Date(investigation.openedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {investigation.demo ? "Demo example" : "Service result"}
                    </small>
                  </div>
                  <span className="console-small-badge">
                    {statusLabels[investigation.status]}
                  </span>
                  <ArrowUpRight size={16} />
                </Link>
              )}
              {recent.map(({ mode, tool, time, result }) => (
                <Link key={mode} href={`/dashboard/${mode}/results`}>
                  <span className={`recent-icon ${mode}`}>
                    {mode === "kage" ? (
                      <ScanLine size={18} />
                    ) : (
                      <GitCompareArrows size={18} />
                    )}
                  </span>
                  <div>
                    <strong>{tool}</strong>
                    <small>
                      {mode.toUpperCase()} ·{" "}
                      {new Date(time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {result.demo ? "Demo report" : "API report"}
                    </small>
                  </div>
                  <span className={`recent-risk ${result.level.toLowerCase()}`}>
                    {result.level}
                  </span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="activity-empty">
              <span>
                <Activity size={25} />
              </span>
              <h3>A clean slate.</h3>
              <p>
                Investigate a website in KAGE or inspect a transaction in
                KAGAMI.
                <br />
                Your latest report will appear here.
              </p>
              <Link href="/dashboard/kage">
                Start an investigation <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
          <div className="session-note">
            <Clock3 size={12} />
            Reports clear when you sign out or close this tab.
          </div>
        </section>
        <section className="console-card quick-tools">
          <div className="console-card-title">
            <h2>Quick tools</h2>
            <MoveUpRight size={17} />
          </div>
          <p>A direct route to the right question.</p>
          {toolLinks.map(({ name, description, href, Icon }) => (
            <Link key={name} href={href}>
              <Icon size={18} />
              <div>
                <strong>{name}</strong>
                <small>{description}</small>
              </div>
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
