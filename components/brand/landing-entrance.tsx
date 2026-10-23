"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { useAccessibleMotion } from "@/lib/use-reduced-motion";

export function LandingEntrance({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<
    "checking" | "playing" | "leaving" | "done"
  >("checking");
  const reduced = useAccessibleMotion();
  const skip = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const hadPlayed = useRef(false);
  const finish = useCallback(() => {
    setPhase((previous) => (previous === "done" ? "done" : "leaving"));
  }, []);

  useEffect(() => {
    if (!enabled || reduced) {
      setPhase("done");
      return;
    }
    setPhase("playing");
  }, [enabled, reduced]);

  useEffect(() => {
    if (phase === "done" && hadPlayed.current) {
      hadPlayed.current = false;
      content.current
        ?.querySelector<HTMLElement>("#main")
        ?.focus({ preventScroll: true });
    }
    if (!enabled || phase === "done" || phase === "checking") return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", escape);
    if (phase === "playing") {
      hadPlayed.current = true;
      skip.current?.focus({ preventScroll: true });
    }
    const timer = window.setTimeout(
      () => {
        if (phase === "playing") finish();
        else {
          setPhase("done");
        }
      },
      phase === "playing" ? 2750 : 600,
    );
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", escape);
    };
  }, [phase, enabled, finish]);

  const locked = enabled && (phase === "playing" || phase === "leaving");
  return (
    <>
      <div ref={content} className="brand-site-content" inert={locked}>
        {children}
      </div>
      {enabled && phase !== "done" && (
        <div
          className="brand-intro"
          data-phase={phase}
          role="dialog"
          aria-modal="true"
          aria-labelledby="brand-intro-title"
        >
          <div className="intro-curtain intro-curtain-top" />
          <div className="intro-curtain intro-curtain-bottom" />
          <button ref={skip} className="intro-skip" onClick={finish}>
            Skip intro <ArrowRight size={15} />
          </button>
          <div className="intro-scene">
            <div className="intro-aura" aria-hidden="true" />
            <span className="intro-overline" aria-hidden="true">
              INSTINCT. PRECISION. PROTECTION.
            </span>
            <svg
              className="intro-katana"
              viewBox="0 0 760 300"
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="katana-steel"
                  x1="378"
                  y1="120"
                  x2="390"
                  y2="178"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#7a8278" />
                  <stop offset=".4" stopColor="#f6ffe7" />
                  <stop offset=".52" stopColor="#a0b4a0" />
                  <stop offset="1" stopColor="#2c3a30" />
                </linearGradient>
                <linearGradient id="katana-edge">
                  <stop stopColor="#a7c282" />
                  <stop offset=".75" stopColor="#e7ffbd" />
                  <stop offset="1" stopColor="#fff" />
                </linearGradient>
              </defs>
              <g className="katana-body">
                <path
                  d="M224 154C398 147 557 120 675 69L688 66L678 84C569 145 414 175 230 180Z"
                  fill="url(#katana-steel)"
                  stroke="#c7d9b5"
                  strokeWidth=".8"
                />
                <path
                  className="katana-edge"
                  d="M230 180C414 175 569 145 678 84L688 66"
                  stroke="url(#katana-edge)"
                  strokeWidth="1.7"
                  pathLength="1"
                />
                <path
                  d="M235 173C412 167 560 140 666 91"
                  stroke="#526452"
                  strokeWidth=".8"
                />
                <path
                  d="M92 191L203 155L213 183L102 219Z"
                  fill="#101811"
                  stroke="#56664b"
                  strokeWidth="1.3"
                />
                <path
                  d="M104 189L122 213M123 183L141 207M142 177L160 201M161 171L179 195M180 165L198 189"
                  stroke="#a4b68b"
                  strokeWidth="6"
                />
                <path
                  d="M108 218L124 184M127 212L143 178M146 206L162 172M165 200L181 166M184 194L200 160"
                  stroke="#253722"
                  strokeWidth="4"
                />
                <path d="M91 191L102 219" stroke="#c7db9e" strokeWidth="7" />
                <ellipse
                  cx="220"
                  cy="169"
                  rx="8"
                  ry="33"
                  transform="rotate(-18 220 169)"
                  fill="#27351d"
                  stroke="#cbef8e"
                  strokeWidth="3"
                />
                <path d="M227 155L241 153L245 178L231 181Z" fill="#c5d39e" />
              </g>
            </svg>
            <svg
              className="intro-slash"
              viewBox="0 0 1000 300"
              aria-hidden="true"
            >
              <path d="M60 248Q470 245 940 49" pathLength="1" />
            </svg>
            <div className="intro-lockup">
              <BrandMark className="intro-mark" priority sizes="220px" />
              <h1 id="brand-intro-title">
                SCAM<span>urai</span>
                <i>.</i>
              </h1>
              <p>Understand the scam. Stop the mistake.</p>
            </div>
            <span className="intro-bottom-note" aria-hidden="true">
              A SHARPER INSTINCT STARTS HERE
            </span>
          </div>
        </div>
      )}
      <noscript>
        <style>{`.brand-intro{display:none!important}`}</style>
      </noscript>
    </>
  );
}
