"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring, useMotionValue } from "motion/react";
import {
  ArrowDown,
  ArrowUpRight,
  ArrowRight,
  ScanLine,
  GitCompareArrows,
  LifeBuoy,
  Check,
} from "lucide-react";
import { InspectionCore } from "./inspection-core";
import { useAccessibleMotion } from "@/lib/use-reduced-motion";

const chapters = [
  { id: "overview", name: "The instinct", caption: "01 / THE INSPECTION CORE" },
  {
    id: "the-promise",
    name: "The promise",
    caption: "02 / LOOK BENEATH THE SURFACE",
  },
  {
    id: "the-permission",
    name: "The permission",
    caption: "03 / UNFOLD THE SIGNAL",
  },
  {
    id: "protection-modes",
    name: "Your protection",
    caption: "04 / EVERY REQUEST LEAVES A PATTERN",
  },
  {
    id: "how-it-works",
    name: "The evidence",
    caption: "05 / TRACE THE INTENT",
  },
  {
    id: "next-step",
    name: "Your next step",
    caption: "06 / MAKE YOUR NEXT MOVE",
  },
];
const mobileQuery =
  "(max-width: 700px), (max-width: 950px) and (max-height: 500px) and (pointer: coarse)";
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const mobileServerSnapshot = () => false;
function subscribeMobile(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function PersistentLanding() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useAccessibleMotion();
  const [active, setActive] = useState(0);
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    mobileServerSnapshot,
  );
  const mobileProgress = useMotionValue(0);
  const mobileSmooth = useSpring(mobileProgress, {
    stiffness: 130,
    damping: 32,
    restDelta: 0.0001,
  });
  const { scrollYProgress } = useScroll({
    target: root,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 85,
    damping: 28,
    restDelta: 0.0001,
  });
  const still = useMotionValue(0.7);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let next = 0;
      const sections = Array.from(
        root.current?.querySelectorAll<HTMLElement>(".story-chapter") || [],
      );
      const readingLine = mobile
        ? (root.current?.querySelector(".story-visual")?.getBoundingClientRect()
            .height || 220) + 36
        : innerHeight * 0.58;
      sections.forEach((element, index) => {
        if (element.getBoundingClientRect().top <= readingLine) next = index;
      });
      if (mobile && sections.length) {
        const starts = [0, 0.16, 0.38, 0.62, 0.82, 1];
        const top = sections[next].getBoundingClientRect().top;
        const end =
          sections[next + 1]?.getBoundingClientRect().top ??
          top + sections[next].offsetHeight;
        const fraction = Math.max(
          0,
          Math.min(1, (readingLine - top) / Math.max(1, end - top)),
        );
        mobileProgress.set(
          starts[next] + ((starts[next + 1] ?? 1) - starts[next]) * fraction,
        );
      }
      setActive(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [mobile, mobileProgress]);
  return (
    <div
      ref={root}
      className={`persistent-story cinematic-story ${reduced ? "reduced-story" : ""}`}
    >
      <aside
        className="story-visual"
        aria-label="Continuous 3D inspection scene"
      >
        <div className="story-visual-grid" aria-hidden="true" />
        <InspectionCore
          progress={reduced ? still : mobile ? mobileSmooth : progress}
          reduced={reduced}
          cinematic
        />
        <div className="story-visual-top">
          <span>
            <ScanLine size={14} /> SCAMURAI / SIGNAL LAB
          </span>
          <span>
            SCROLL TO TRANSFORM <ArrowDown size={11} />
          </span>
        </div>
        <div className="story-visual-bottom">
          <p>{chapters[active].caption}</p>
          <nav aria-label="Landing chapters">
            {chapters.map((chapter, index) => (
              <a
                key={chapter.id}
                href={`#${chapter.id}`}
                aria-label={chapter.name}
                aria-current={active === index ? "step" : undefined}
              >
                0{index + 1}
              </a>
            ))}
          </nav>
          <div className="story-progress">
            <motion.i style={{ scaleX: scrollYProgress }} />
          </div>
          <span className="scene-disclosure">
            ILLUSTRATIVE VISUAL · NO BIOMETRIC DATA COLLECTED
          </span>
        </div>
      </aside>
      <div className="story-content">
        <section id="overview" className="story-chapter story-intro">
          <div className="story-left">
            <span className="story-eyebrow">
              <i /> FINANCIAL SELF-DEFENSE
            </span>
            <h1>
              Scammers
              <br />
              manipulate.
              <br />
              <em>See through it.</em>
            </h1>
            <p>
              Every scam has a story. Look closer at what it’s asking you to do.
            </p>
            <div className="story-actions">
              <Link className="story-primary" href="/login">
                Enter SCAMurai <ArrowUpRight size={18} />
              </Link>
              <a href="#the-promise">
                Look beneath the surface <ArrowDown size={16} />
              </a>
            </div>
            <div className="story-footnote">
              <span>
                <Check size={12} /> Demo workspace
              </span>
              <span>
                <Check size={12} /> No wallet connection
              </span>
            </div>
          </div>
        </section>
        <section id="the-promise" className="story-chapter">
          <div className="story-left">
            <span className="story-eyebrow">01 / THE OUTER LAYER</span>
            <h2>
              Good story.
              <br />
              <em>Different intent.</em>
            </h2>
            <p>
              The message gets your attention. The request reveals what’s really
              at stake.
            </p>
            <span className="story-rule">PAUSE BEFORE YOU PAY.</span>
          </div>
          <div className="story-right">
            <span className="story-eyebrow">LOOK PAST THE PROMISE</span>
            <div className="story-quote">
              <blockquote>
                “Claim your free
                <br />
                USDT reward.”
              </blockquote>
              <small>Illustrative scenario · not a live scan</small>
            </div>
            <p>
              “Free tokens” sounds like something you receive. An approval can
              be something you give away.
            </p>
            <a className="story-text-link" href="#the-permission">
              Unfold the request <ArrowDown size={17} />
            </a>
          </div>
        </section>
        <section id="the-permission" className="story-chapter">
          <div className="story-left">
            <span className="story-eyebrow">02 / BENEATH THE SURFACE</span>
            <h2>
              Your tokens.
              <br />
              <em>Their permission.</em>
            </h2>
            <p>
              Separate the persuasive story from the action it asks you to take.
            </p>
            <Link
              className="story-text-link"
              href="/login?next=%2Fdashboard%2Fkagami"
            >
              Explore the comparison <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="story-right">
            <GitCompareArrows className="story-detail-icon" size={28} />
            <span className="story-eyebrow">THE ACTUAL PERMISSION</span>
            <h3>
              Unlimited
              <br />
              token spending.
            </h3>
            <p>
              See the gap between a promised reward and an unlimited allowance.
              Then decide.
            </p>
            <small className="story-caveat">
              Unlimited approval alone does not prove fraud. Context and the
              spender matter.
            </small>
          </div>
        </section>
        <section id="protection-modes" className="story-chapter">
          <div className="story-left">
            <span className="story-eyebrow">03 / TWO WAYS TO LOOK CLOSER</span>
            <h2>
              Different questions.
              <br />
              <em>The same clarity.</em>
            </h2>
            <Link className="story-mode" href="/login?next=%2Fdashboard%2Fkage">
              <div>
                <ScanLine size={25} />
                <span>WEBSITE INTELLIGENCE</span>
                <h3>
                  KAGE <small>影</small>
                </h3>
                <p>See the shadow before it strikes.</p>
                <small>YŌKAI · Browser profiles · Behavioral evidence</small>
                <strong>
                  Explore KAGE <ArrowUpRight size={16} />
                </strong>
              </div>
            </Link>
          </div>
          <div className="story-right">
            <Link
              className="story-mode story-mode-cyan"
              href="/login?next=%2Fdashboard%2Fkagami"
            >
              <div>
                <GitCompareArrows size={25} />
                <span>TRANSACTION TRUTH</span>
                <h3>
                  KAGAMI <small>鏡</small>
                </h3>
                <p>
                  Reflect the transaction.
                  <br />
                  Reveal the truth.
                </p>
                <small>Approvals · Permissions · Promise vs. Action</small>
                <strong>
                  Explore KAGAMI <ArrowUpRight size={16} />
                </strong>
              </div>
            </Link>
            <p className="story-small-copy">
              One workspace. Choose the mode that fits the question you’re
              asking.
            </p>
          </div>
        </section>
        <section id="how-it-works" className="story-chapter">
          <div className="story-left">
            <span className="story-eyebrow">04 / TRACE THE INTENT</span>
            <h2>
              A sharper instinct.
              <br />
              <em>Backed by understanding.</em>
            </h2>
            <p>
              The words change. The tactics repeat. Look for pressure,
              impersonation, and unusual requests.
            </p>
            <Link className="story-text-link" href="/login">
              Open your workspace <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="story-right">
            <div className="story-evidence">
              <span>01</span>
              <div>
                <h3>Bring the request.</h3>
                <p>Start with a message, URL, or transaction permission.</p>
              </div>
            </div>
            <div className="story-evidence">
              <span>02</span>
              <div>
                <h3>Read the signals.</h3>
                <p>Review the explanation and the evidence behind it.</p>
              </div>
            </div>
            <div className="story-evidence">
              <span>03</span>
              <div>
                <h3>Choose your next move.</h3>
                <p>
                  Understand the limitations. A low risk score is not a safety
                  guarantee.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section id="next-step" className="story-chapter story-end">
          <div className="story-left">
            <span className="story-eyebrow">05 / YOU’RE NOT ALONE</span>
            <h2>
              Less panic.
              <br />
              <em>More next steps.</em>
            </h2>
            <p>
              Clicked a link? Shared an OTP? Sent money? Start with what
              happened.
            </p>
            <Link className="story-primary" href="/rescue">
              Enter rescue mode <ArrowRight size={18} />
            </Link>
          </div>
          <div className="story-right">
            <LifeBuoy className="story-detail-icon" size={32} />
            <h3>
              A calm plan.
              <br />
              One step at a time.
            </h3>
            <ul className="story-recovery">
              <li>
                <Check size={15} /> Secure your accounts
              </li>
              <li>
                <Check size={15} /> Preserve the evidence
              </li>
              <li>
                <Check size={15} /> Find official reporting options
              </li>
            </ul>
            <Link className="story-text-link" href="/login">
              Enter SCAMurai <ArrowUpRight size={17} />
            </Link>
            <span className="story-signoff">STAY SHARP.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
