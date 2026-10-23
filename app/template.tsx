"use client";
import { motion } from "motion/react";
import { useAccessibleMotion } from "@/lib/use-reduced-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useAccessibleMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0.7, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.75, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
