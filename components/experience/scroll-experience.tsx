"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValueEvent,
} from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ScanLine,
  TriangleAlert,
  GitCompareArrows,
  LifeBuoy,
  MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InspectionCore } from "./inspection-core";
import { useAccessibleMotion } from "@/lib/use-reduced-motion";

export function ScrollExperience() {
  const section = useRef<HTMLElement>(null);
  const reduce = useAccessibleMotion();
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });
  const introOpacity = useTransform(smooth, [0, 0.14, 0.28], [1, 1, 0]);
  const introY = useTransform(smooth, [0, 0.3], [0, -90]);
  const secondOpacity = useTransform(
    smooth,
    [0.22, 0.36, 0.58, 0.7],
    [0, 1, 1, 0],
  );
  const secondY = useTransform(smooth, [0.22, 0.45, 0.7], [65, 0, -65]);
  const lastOpacity = useTransform(smooth, [0.62, 0.8, 1], [0, 1, 1]);
  const lastY = useTransform(smooth, [0.62, 0.85], [65, 0]);
  const firstCardY = useTransform(smooth, [0, 0.35], [0, -65]);
  const bottomOpacity = useTransform(smooth, [0, 0.3, 0.7], [0.45, 0.85, 1]);
  const bottomRotate = useTransform(smooth, [0, 1], [7, -4]);
  useMotionValueEvent(smooth, "change", (value) => {
    const next = value > 0.65 ? 2 : value > 0.26 ? 1 : 0;
    setActive((previous) => (previous === next ? previous : next));
  });
  const cardRotate = useTransform(smooth, [0, 1], [-8, 8]);
  return (
    <section
      ref={section}
      className={`scroll-experience ${reduce ? "motion-reduced" : ""}`}
      aria-label="Explore the request beneath the promise"
    >
      <div className="experience-sticky">
        <div className="experience-grid" />
        <div className="experience-word" aria-hidden="true">
          SCAMURAI
        </div>
        <InspectionCore progress={smooth} reduced={reduce} />
        <div className="experience-container">
          <motion.div
            className="experience-copy experience-intro"
            inert={!reduce && active !== 0}
            style={reduce ? {} : { opacity: introOpacity, y: introY }}
          >
            <div className="experience-kicker">
              <span /> FINANCIAL SELF-DEFENSE
            </div>
            <h1>
              Scammers
              <br />
              manipulate.
              <br />
              <span>See through it.</span>
            </h1>
            <p>
              Every scam has a story.
              <br />
              Look closer at what it’s asking you to do.
            </p>
            <div className="experience-actions">
              <Button asChild>
                <Link href="/login">
                  Enter SCAMurai <ArrowUpRight size={17} />
                </Link>
              </Button>
              <Link
                className="experience-secondary"
                href="/login?next=%2Fdashboard%2Fkagami"
              >
                Explore KAGAMI <ArrowRight size={15} />
              </Link>
            </div>
            <div className="experience-footnote">
              <span>
                <Check size={12} /> Demo workspace available
              </span>
              <span>
                <Check size={12} /> No wallet connection
              </span>
            </div>
          </motion.div>
          {!reduce && (
            <>
              <motion.div
                className="experience-copy experience-stage"
                inert={active !== 1}
                style={{ opacity: secondOpacity, y: secondY }}
              >
                <span className="experience-kicker">
                  01 / LOOK PAST THE PROMISE
                </span>
                <h2>
                  Good story.
                  <br />
                  <span>Different intent.</span>
                </h2>
                <p>
                  “Free tokens” sounds like something you receive. An approval
                  can be something you give away.
                </p>
                <span className="illustration-tag">
                  ILLUSTRATIVE SCENARIO · NOT A LIVE SCAN
                </span>
              </motion.div>
              <motion.div
                className="experience-copy experience-stage"
                inert={active !== 2}
                style={{ opacity: lastOpacity, y: lastY }}
              >
                <span className="experience-kicker">
                  02 / UNDERSTAND THE ACTION
                </span>
                <h2>
                  Your tokens.
                  <br />
                  <span>Their permission.</span>
                </h2>
                <p>
                  See the gap between a promised reward and an unlimited
                  spending allowance. Then decide.
                </p>
                <Link
                  className="experience-secondary"
                  href="/login?next=%2Fdashboard%2Fkagami"
                >
                  Explore the comparison <ArrowUpRight size={17} />
                </Link>
                <span className="illustration-tag">
                  UNLIMITED APPROVAL ALONE DOES NOT PROVE FRAUD
                </span>
              </motion.div>
            </>
          )}
          <motion.div
            className="scene-note scene-note-top"
            style={reduce ? {} : { y: firstCardY, rotate: cardRotate }}
          >
            <MessageSquareText size={16} />
            <div>
              <span>THE PROMISE</span>
              <p>“Claim your free USDT.”</p>
            </div>
            <ArrowUpRight size={15} />
          </motion.div>
          <motion.div
            className="scene-note scene-note-bottom"
            style={
              reduce ? {} : { opacity: bottomOpacity, rotate: bottomRotate }
            }
          >
            <span className="scene-warning">
              <TriangleAlert size={18} />
            </span>
            <div>
              <span>THE ACTUAL PERMISSION</span>
              <p>Unlimited token spending.</p>
            </div>
          </motion.div>
        </div>
        <div className="experience-bottom">
          <span className="experience-bottom-label">
            <ScanLine size={14} /> UNDERSTAND THE SCAM. STOP THE MISTAKE.
          </span>
          <div className="scroll-chapters">
            <span>THE REQUEST</span>
            <div>
              <motion.i style={{ scaleX: smooth }} />
            </div>
            <span>THE REALITY</span>
          </div>
          <span className="scroll-invitation">
            Scroll to look closer <ArrowDown size={14} />
          </span>
        </div>
      </div>
    </section>
  );
}

const capabilities = [
  {
    number: "01",
    label: "KAGE / SCAM INTELLIGENCE",
    heading: "The words change.\nThe tactics repeat.",
    copy: "Urgency. Impersonation. A request for money. See the signals behind a suspicious message and the evidence that supports them.",
    href: "/login?next=%2Fdashboard%2Fkage",
    cta: "Read between the lines",
    Icon: MessageSquareText,
    visual: "message",
  },
  {
    number: "02",
    label: "KAGAMI / TRANSACTION TRUTH",
    heading: "Your signature.\nTheir spending power.",
    copy: "A wallet prompt can look harmless. Compare what was promised with what a transaction actually allows before you approve it.",
    href: "/login?next=%2Fdashboard%2Fkagami",
    cta: "Understand the permission",
    Icon: GitCompareArrows,
    visual: "permission",
  },
  {
    number: "03",
    label: "RESCUE MODE",
    heading: "Already acted?\nYou still have a next step.",
    copy: "A calm response plan for a difficult moment. Secure your accounts, keep the evidence, and find official reporting options.",
    href: "/rescue",
    cta: "Find your next step",
    Icon: LifeBuoy,
    visual: "rescue",
  },
];
export function CapabilityJourney() {
  return (
    <section className="journey-section container">
      <div className="journey-heading">
        <span className="eyebrow">
          YOUR DEFENSE, FROM FIRST DOUBT TO NEXT STEP
        </span>
        <h2>
          A sharper instinct.
          <br />
          <span>Backed by understanding.</span>
        </h2>
      </div>
      <div className="journey-stack">
        {capabilities.map((item, index) => (
          <JourneyPanel key={item.number} item={item} index={index} />
        ))}
      </div>
    </section>
  );
}
function JourneyPanel({
  item,
  index,
}: {
  item: (typeof capabilities)[number];
  index: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useAccessibleMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start .95", "start .2"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [12, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [75, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  return (
    <motion.article
      ref={ref}
      className={`journey-panel journey-${item.visual}`}
      style={{
        top: 100 + index * 18,
        ...(reduce ? {} : { rotateX, y, scale }),
      }}
    >
      <div className="journey-panel-copy">
        <span className="journey-panel-label">
          <b>{item.number}</b>
          {item.label}
        </span>
        <h3>
          {item.heading.split("\n").map((text, i) => (
            <span key={text}>
              {text}
              {i === 0 && <br />}
            </span>
          ))}
        </h3>
        <p>{item.copy}</p>
        <Link href={item.href}>
          {item.cta}
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <div className="journey-panel-visual" aria-hidden="true">
        {item.visual === "message" ? (
          <div className="message-art">
            <MessageSquareText size={22} />
            <p>
              Your account will be
              <br />
              <em>blocked in 2 hours.</em>
            </p>
            <span className="art-signal">
              <TriangleAlert size={12} /> PRESSURE TO ACT
            </span>
            <div className="art-lines">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : item.visual === "permission" ? (
          <div className="permission-art">
            <div className="permission-ring">
              <GitCompareArrows size={50} />
            </div>
            <span>APPROVAL AMOUNT</span>
            <b>∞</b>
            <p>Unlimited allowance</p>
          </div>
        ) : (
          <div className="rescue-art">
            <LifeBuoy size={85} />
            <div>
              <span>ONE STEP AT A TIME</span>
              <p>
                <Check size={13} /> Secure your account
              </p>
              <p>
                <Check size={13} /> Preserve the evidence
              </p>
              <p>
                <Check size={13} /> Report the incident
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}
