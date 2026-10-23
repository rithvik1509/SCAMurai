"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X, CircleHelp, ChevronRight } from "lucide-react";
import { config } from "@/lib/config";
import { health } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/brand/brand-mark";
import { LandingEntrance } from "@/components/brand/landing-entrance";
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="SCAMurai home">
      <BrandMark priority />
      <span>
        SCAM<span className="brand-light">urai</span>
        <span className="brand-period">.</span>
      </span>
    </Link>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    if (!config.demo) void health().then(setOnline);
  }, []);
  const links = [
    ["/", "Overview"],
    ["/#protection-modes", "Protection modes"],
    ["/#how-it-works", "How it works"],
    ["/rescue", "Rescue mode"],
  ];
  if (path.startsWith("/dashboard") || path === "/login")
    return <>{children}</>;
  return (
    <LandingEntrance enabled={path === "/"}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header">
        <div className="nav-wrap">
          <Brand />
          <nav
            aria-label="Main navigation"
            className={open ? "nav open" : "nav"}
          >
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={path === href ? "page" : undefined}
                className={path === href ? "active" : ""}
              >
                {label}
                {href === "/intentshield" && (
                  <span className="nav-tag">WEB3</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="nav-end">
            <span className="mode-status">
              <i className={config.demo ? "dot amber" : "dot"} />
              {config.demo
                ? "Demo workspace"
                : online === null
                  ? "Checking API"
                  : online
                    ? "API connected"
                    : "API unavailable"}
            </span>
            <Link
              className="nav-start"
              href={session ? "/dashboard" : "/login"}
            >
              {session ? "Go to dashboard" : "Enter SCAMurai"}{" "}
              <ArrowUpRight size={15} />
            </Link>
            <button
              className="menu-button"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="footer">
        <Brand />
        <p>Understand the scam. Stop the mistake.</p>
        <div>
          <span>Built for NEXATHON 2026</span>
          <Link href="/rescue">
            <CircleHelp size={14} /> Need help? <ChevronRight size={13} />
          </Link>
        </div>
      </footer>
    </LandingEntrance>
  );
}
