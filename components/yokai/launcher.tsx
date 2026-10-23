"use client";
import { useEffect, useState } from "react";
import {
  Monitor,
  Smartphone,
  RotateCcw,
  ArrowUpRight,
  Play,
  Check,
  ChevronDown,
  Globe2,
  LoaderCircle,
  ShieldCheck,
  Clock3,
} from "lucide-react";

import { demoCases } from "@/lib/yokai/fixtures";
import { config } from "@/lib/config";
import {
  profileLabels,
  statusLabels,
  type DemoCase,
  type InvestigationCapabilities,
  type InvestigationRequest,
  type ProfileId,
} from "@/lib/yokai/types";
import type { HistoryItem } from "@/lib/yokai/session";

export function InvestigationLauncher({
  demo,
  capabilities,
  busy,
  history,
  onStart,
  onOpen,
}: {
  demo: boolean;
  capabilities: InvestigationCapabilities | null;
  busy: boolean;
  history: HistoryItem[];
  onStart: (request: InvestigationRequest, scenario: DemoCase) => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const [scenario, setScenario] = useState<DemoCase>("responsive");
  const [target, setTarget] = useState("");
  const [profiles, setProfiles] = useState<ProfileId[]>(["desktop", "mobile"]);
  const [authorized, setAuthorized] = useState(false);
  const [timeout, setTimeoutSeconds] = useState(30);
  const [screenshots, setScreenshots] = useState(true);
  const [network, setNetwork] = useState(true);
  const [error, setError] = useState("");
  const supportedProfiles = capabilities?.profiles.join(",");
  useEffect(() => {
    if (!demo && capabilities?.available)
      setProfiles((previous) => {
        const valid = previous.filter((id) =>
          capabilities.profiles.includes(id),
        );
        return valid.length >= 2 ? valid : capabilities.profiles.slice(0, 2);
      });
  }, [demo, supportedProfiles, capabilities?.available]);
  const selected = demoCases.find((d) => d.id === scenario)!;
  const localApi = new URL(config.apiUrl);
  const localTestsAvailable =
    !demo &&
    ["localhost", "127.0.0.1"].includes(localApi.hostname) &&
    capabilities?.allowedOrigins.includes(localApi.origin);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const value = demo ? selected.target : target.trim();
    let url: URL;
    try {
      url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error();
    } catch {
      setError(
        "Enter a complete HTTP or HTTPS URL without embedded credentials.",
      );
      return;
    }
    if (profiles.length < 2) {
      setError("Select at least two browser profiles to compare.");
      return;
    }
    if (!demo && profiles.some((id) => !capabilities?.profiles.includes(id))) {
      setError("Select only profiles supported by the connected service.");
      return;
    }
    if (!demo && !authorized) {
      setError("Confirm that you have permission to investigate this target.");
      return;
    }
    if (
      !demo &&
      !capabilities?.publicTargets &&
      capabilities?.allowedOrigins.length &&
      !capabilities.allowedOrigins.includes(url.origin)
    ) {
      setError(
        "This origin is not on the investigation service's published allowlist.",
      );
      return;
    }
    await onStart(
      {
        targetUrl: value,
        profiles,
        authorizationConfirmed: demo || authorized,
        settings: {
          timeoutSeconds: timeout,
          captureScreenshots: screenshots,
          includeNetwork: network,
        },
      },
      scenario,
    );
  }
  return (
    <div className="yk-launch-grid">
      <section className="yk-panel yk-launcher">
        <div className="yk-panel-heading">
          <div>
            <span className="yk-eyebrow">01 / INVESTIGATION SETUP</span>
            <h2>Set up an investigation.</h2>
          </div>
          <Globe2 size={23} />
        </div>
        <p className="yk-muted">
          Choose a target and the browser profiles you want to compare.
        </p>
        {demo && (
          <div className="yk-demo-notice">
            <span>DEMO</span>
            <p>
              These are fixed, fictional investigations. No website is visited
              and no browser is launched.
            </p>
          </div>
        )}
        <form onSubmit={submit}>
          <label className="yk-label" htmlFor="yk-target">
            Investigation URL
          </label>
          <div className="yk-url-input">
            <Globe2 size={17} />
            <input
              id="yk-target"
              type="url"
              value={demo ? selected.target : target}
              onChange={(e) => setTarget(e.target.value)}
              readOnly={demo}
              placeholder="https://your-authorized-site.example/page"
              maxLength={2048}
              aria-describedby="yk-authorization"
              required
            />
          </div>
          {localTestsAvailable && (
            <div className="yk-local-tests">
              <p className="yk-field-note">
                Try a controlled local page. These run real browser investigations.
              </p>
              <div>
                {[
                  ["responsive", "Responsive layout"],
                  ["payment", "Conditional payment form"],
                  ["redirect", "Profile redirects"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className="yk-secondary"
                    disabled={busy}
                    onClick={() => {
                      setTarget(`${localApi.origin}/api/v1/kage/__yokai_fixture__/${id}`);
                      setError("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p id="yk-authorization" className="yk-field-note">
            {capabilities?.authorizationPolicy ||
              "Checking investigation availability…"}
          </p>
          {!demo && !!capabilities?.allowedOrigins.length && (
            <details className="yk-advanced">
              <summary>
                {capabilities.publicTargets ? "Local test origins" : "Permitted origins"} <ChevronDown size={14} />
              </summary>
              <ul>
                {capabilities.allowedOrigins.map((origin) => (
                  <li key={origin}>
                    <code>{origin}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <fieldset className="yk-profiles">
            <legend>
              Browser profiles{" "}
              <span>{profiles.length} selected · Minimum two</span>
            </legend>
            {(["desktop", "mobile", "returning"] as ProfileId[]).map((id) => {
              const Icon =
                id === "mobile"
                  ? Smartphone
                  : id === "returning"
                    ? RotateCcw
                    : Monitor;
              const enabled = capabilities?.profiles.includes(id) ?? demo;
              return (
                <label
                  className={profiles.includes(id) ? "is-selected" : ""}
                  key={id}
                >
                  <input
                    type="checkbox"
                    checked={profiles.includes(id)}
                    disabled={!enabled || busy}
                    onChange={(e) =>
                      setProfiles((previous) =>
                        e.target.checked
                          ? [...previous, id]
                          : previous.filter((p) => p !== id),
                      )
                    }
                  />
                  <Icon size={20} />
                  <strong>{profileLabels[id]}</strong>
                  <small>
                    {id === "mobile"
                      ? "390 × 844 viewport"
                      : id === "returning"
                        ? "Same viewport, returning state"
                        : "1440 × 900 viewport"}
                  </small>
                  <span className="yk-check">
                    <Check size={12} />
                  </span>
                </label>
              );
            })}
          </fieldset>
          {demo && (
            <fieldset className="yk-scenarios">
              <legend>Choose an investigation example</legend>
              {demoCases.map((item, index) => (
                <label
                  key={item.id}
                  className={scenario === item.id ? "is-selected" : ""}
                >
                  <input
                    type="radio"
                    name="scenario"
                    value={item.id}
                    checked={scenario === item.id}
                    onChange={() => setScenario(item.id)}
                  />
                  <span className="yk-case-number">0{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <small>{item.tag}</small>
                </label>
              ))}
            </fieldset>
          )}
          <details className="yk-advanced">
            <summary>
              Advanced settings <ChevronDown size={15} />
            </summary>
            {demo && (
              <p className="yk-field-note">
                Demonstration settings are fixed so the evidence remains
                consistent.
              </p>
            )}
            <fieldset disabled={demo || busy}>
              <label className="yk-timeout-option">
                <span>Observation timeout</span>
                <select
                  aria-label="Observation timeout"
                  value={timeout}
                  onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                >
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                </select>
              </label>
              <label className="yk-checkbox-option">
                <input
                  type="checkbox"
                  checked={screenshots}
                  onChange={(e) => setScreenshots(e.target.checked)}
                />
                <span>Capture screenshots</span>
              </label>
              <label className="yk-checkbox-option">
                <input
                  type="checkbox"
                  checked={network}
                  onChange={(e) => setNetwork(e.target.checked)}
                />
                <span>Include network observations</span>
              </label>
            </fieldset>
          </details>
          {!demo && (
            <label className="yk-authorized">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
              />
              <span>I own this target or have permission to investigate it.</span>
            </label>
          )}
          {error && (
            <p className="yk-error" role="alert">
              {error}
            </p>
          )}
          <div className="yk-launch-actions">
            <span>
              <ShieldCheck size={14} /> Evidence first. Conclusions second.
            </span>
            <button
              className="yk-primary"
              type="submit"
              disabled={busy || !capabilities?.available}
            >
              {busy ? (
                <>
                  <LoaderCircle size={16} className="spin" /> Opening…
                </>
              ) : (
                <>
                  {demo ? "Open demo investigation" : "Start investigation"}
                  <Play size={15} />
                </>
              )}
            </button>
          </div>
        </form>
      </section>
      <aside className="yk-launch-aside">
        <section className="yk-panel yk-launch-guide">
          <span className="yk-eyebrow">YOUR INVESTIGATION, EXPLAINED</span>
          <h3>
            The details make
            <br />
            the difference.
          </h3>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Choose the profiles.</strong>
                <p>
                  Look at the same target under different browser conditions.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Inspect the differences.</strong>
                <p>
                  Compare page content, forms, redirects, and network
                  destinations.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Follow the evidence.</strong>
                <p>A difference deserves context. It is not proof of fraud.</p>
              </div>
            </li>
          </ol>
        </section>
        <section className="yk-panel yk-history">
          <div className="yk-panel-heading">
            <h3>In this session</h3>
            <Clock3 size={17} />
          </div>
          <p className="yk-field-note">
            Up to eight investigations, saved in this tab.
          </p>
          {history.length ? (
            history.map((item) => (
              <button key={item.id} onClick={() => onOpen(item.id)}>
                <span>
                  <strong>
                    {item.demo ? "Demo investigation" : "Website investigation"}
                  </strong>
                  <small>{item.targetUrl}</small>
                  <em>
                    {statusLabels[item.status]} ·{" "}
                    {new Date(item.openedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </em>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <div className="yk-history-empty">
              <Clock3 size={24} />
              <p>Your first investigation starts here.</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
