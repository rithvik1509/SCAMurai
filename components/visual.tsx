"use client";
import { motion } from "motion/react";
import { useAccessibleMotion } from "@/lib/use-reduced-motion";

export function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useAccessibleMotion();
  return (
    <motion.div
      className={className}
      initial={false}
      whileInView={
        reduced ? {} : { y: [22, 0], filter: ["blur(2px)", "blur(0px)"] }
      }
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, ease: [0.2, 0.75, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
