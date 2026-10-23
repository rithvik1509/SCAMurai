"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useAccessibleMotion } from "@/lib/use-reduced-motion";
import { BrandMark } from "@/components/brand/brand-mark";
import {
  LayoutDashboard,
  ScanLine,
  GitCompareArrows,
  LifeBuoy,
  Keyboard,
  Search,
  Plus,
  ArrowUpRight,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Code2,
  Check,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { health } from "@/lib/api";
export const toolLinks = [
  {
    name: "YŌKAI investigation",
    description: "Compare website behavior across browser profiles",
    href: "/dashboard/kage",
    Icon: ScanLine,
  },
  {
    name: "KUROKAGI authority graph",
    description: "Wallet approvals and execution delegations",
    href: "/dashboard/kagami?module=authority",
    Icon: GitCompareArrows,
  },
  {
    name: "Approval Timebomb",
    description: "Review existing token-spending allowances",
    href: "/dashboard/kagami?module=approvals",
    Icon: Code2,
  },
  {
    name: "Wallet FutureView",
    description: "Decode unsigned transactions and preview supported effects",
    href: "/dashboard/kagami?module=futureview",
    Icon: Code2,
  },
  {
    name: "Recovery checklist",
    description: "Find your next step after an incident",
    href: "/rescue",
    Icon: LifeBuoy,
  },
];
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const reduced = useAccessibleMotion();
  const [mobile, setMobile] = useState(false);
  const [account, setAccount] = useState(false);
  const [dialog, setDialog] = useState<"search" | "shortcuts" | null>(null);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!loading && !session)
      router.replace(
        `/login?next=${encodeURIComponent(path + window.location.search)}`,
      );
  }, [loading, session, path, router]);
  useEffect(() => {
    if (!config.demo) void health().then(setOnline);
  }, []);
  useEffect(() => {
    setMobile(false);
    setAccount(false);
    setDialog(null);
  }, [path]);
  useEffect(() => {
    if (dialog && !modal.current?.open) {
      modal.current?.showModal();
      if (dialog === "search") modal.current?.querySelector("input")?.focus();
    } else if (!dialog && modal.current?.open) modal.current?.close();
  }, [dialog]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobile(false);
        setAccount(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setDialog((previous) => (previous ? null : "search"));
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  if (loading || !session)
    return (
      <div className="console-loading" role="status">
        <ScanLine size={26} />
        <p>{loading ? "Opening your workspace…" : "Returning to login…"}</p>
      </div>
    );
  const mode = path.includes("/kagami")
    ? "kagami"
    : path.includes("/kage")
      ? "kage"
      : "dashboard";
  const title =
    mode === "dashboard"
      ? `Hi, ${session.name}`
      : mode === "kage"
        ? "Website intelligence"
        : "Wallet intelligence";
  const links = [
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    {
      href: "/dashboard/kage",
      label: "KAGE",
      detail: "Website intelligence",
      Icon: ScanLine,
    },
    {
      href: "/dashboard/kagami",
      label: "KAGAMI",
      detail: "Wallet intelligence",
      Icon: GitCompareArrows,
    },
  ];
  async function logout() {
    setAccount(false);
    await signOut();
    router.replace("/login");
  }
  return (
    <div className={`console-world mode-${mode}`}>
      <a href="#workspace-main" className="console-skip">
        Skip to workspace
      </a>
      <div className="console-frame">
        <aside className={`console-sidebar ${mobile ? "expanded" : ""}`}>
          <Link href="/" className="console-brand">
            <BrandMark priority />
            SCAMurai<span className="console-brand-dot">.</span>
          </Link>
          <button
            className="console-close"
            aria-label="Close workspace navigation"
            onClick={() => setMobile(false)}
          >
            <X size={19} />
          </button>
          <span className="console-nav-label">WORKSPACE</span>
          <nav aria-label="Workspace navigation">
            {links.map(({ href, label, detail, Icon }) => (
              <Link
                href={href}
                key={href}
                aria-current={
                  path === href ||
                  (href !== "/dashboard" && path.startsWith(href))
                    ? "page"
                    : undefined
                }
                className={
                  mode ===
                  (label === "Dashboard" ? "dashboard" : label.toLowerCase())
                    ? "selected"
                    : ""
                }
                onClick={() => setMobile(false)}
              >
                {mode ===
                  (label === "Dashboard"
                    ? "dashboard"
                    : label.toLowerCase()) && (
                  <motion.span
                    className="workspace-nav-selection"
                    layoutId="workspace-nav-selection"
                    aria-hidden="true"
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 380, damping: 34 }
                    }
                  />
                )}
                <Icon size={19} />
                <span>
                  {label}
                  {detail && <small>{detail}</small>}
                </span>
                {detail && <ArrowUpRight size={14} />}
              </Link>
            ))}
          </nav>
          <span className="console-nav-label">SUPPORT</span>
          <Link className="console-rescue-link" href="/rescue">
            <LifeBuoy size={19} />
            Rescue mode <ArrowUpRight size={14} />
          </Link>
          <div className="sidebar-bottom">
            <button onClick={() => setDialog("shortcuts")}>
              <Keyboard size={17} />
              Keyboard shortcuts
            </button>
            <div className="sidebar-session">
              <span className="session-dot" />
              <div>
                Demo session<small>Saved in this tab only</small>
              </div>
            </div>
            <button className="sidebar-signout" onClick={logout}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </aside>
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label="Dismiss workspace navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="console-content">
          <header className="console-topbar">
            <div className="console-title">
              <button
                className="console-mobile-menu"
                aria-label="Open workspace navigation"
                aria-expanded={mobile}
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </button>
              <div>
                <Link href="/dashboard">Workspace</Link>
                <span className="console-breadcrumb">
                  {" "}
                  / {mode === "dashboard" ? "Dashboard" : mode.toUpperCase()}
                  {path.endsWith("/results") ? " / Report" : ""}
                </span>
                <h1>{title}</h1>
              </div>
            </div>
            <div className="console-top-actions">
              <span className="console-api-status">
                <i />
                {config.demo
                  ? "Demo analysis"
                  : online === null
                    ? "Checking API"
                    : online
                      ? "API connected"
                      : "API unavailable"}
              </span>
              <button
                className="console-new"
                aria-label="New check"
                onClick={() => {
                  setQuery("");
                  setDialog("search");
                }}
              >
                <Plus size={17} />
                <span>New check</span>
              </button>
              <button
                className="console-icon-button"
                aria-label="Search tools"
                onClick={() => {
                  setQuery("");
                  setDialog("search");
                }}
              >
                <Search size={19} />
              </button>
              <div className="console-account">
                <button
                  className="account-button"
                  aria-label="Account menu"
                  aria-expanded={account}
                  onClick={() => setAccount(!account)}
                >
                  <span>{session.name.charAt(0).toUpperCase()}</span>
                  <ChevronDown size={13} />
                </button>
                {account && (
                  <div className="account-dropdown">
                    <strong>{session.name}</strong>
                    <small>Demonstration session</small>
                    <button onClick={logout}>
                      <LogOut size={15} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main id="workspace-main" className="console-main">
            <div key={path} className="workspace-route">
              {children}
            </div>
          </main>
          <footer className="console-footer">
            <span>Understand the scam. Stop the mistake.</span>
            <span>
              No wallet connection required <Check size={11} />
            </span>
          </footer>
        </div>
      </div>
      <dialog
        ref={modal}
        className="tool-dialog"
        aria-labelledby="tool-dialog-title"
        onCancel={() => setDialog(null)}
        onClick={(event) => {
          if (event.target === modal.current) setDialog(null);
        }}
      >
        <div className="dialog-heading">
          <h2 id="tool-dialog-title">
            {dialog === "shortcuts"
              ? "A quicker way around"
              : "What would you like to check?"}
          </h2>
          <button aria-label="Close dialog" onClick={() => setDialog(null)}>
            <X size={20} />
          </button>
        </div>
        {dialog === "search" ? (
          <>
            <label className="tool-search">
              <Search size={18} />
              <input
                autoFocus
                placeholder="Search investigations, transactions…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>ESC</kbd>
            </label>
            <div className="tool-search-results">
              {toolLinks
                .filter((t) =>
                  (t.name + " " + t.description)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map(({ name, description, href, Icon }) => (
                  <Link
                    key={name}
                    href={href}
                    onClick={() => {
                      setDialog(null);
                      setQuery("");
                    }}
                  >
                    <Icon size={20} />
                    <div>
                      <strong>{name}</strong>
                      <small>{description}</small>
                    </div>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
              {!toolLinks.some((t) =>
                (t.name + " " + t.description)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              ) && <p>No matching tools. Try “YŌKAI” or “transaction”.</p>}
            </div>
          </>
        ) : (
          <div className="shortcut-list">
            <p>
              <span>Open tool search</span>
              <kbd>Ctrl / ⌘ + K</kbd>
            </p>
            <p>
              <span>Close a dialog</span>
              <kbd>Esc</kbd>
            </p>
            <p>
              <span>Move between controls</span>
              <kbd>Tab</kbd>
            </p>
            <p>
              <span>Activate a control</span>
              <kbd>Enter</kbd>
            </p>
          </div>
        )}
      </dialog>
    </div>
  );
}
