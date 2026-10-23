"use client";
import { useEffect, useState } from "react";
import { health } from "./api";
import { config } from "./config";

export function useApiHealth() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    if (config.demo) return;
    const controller = new AbortController();
    let pending = false;
    async function check() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const available = await health(controller.signal);
        if (!controller.signal.aborted) setOnline(available);
      } finally {
        pending = false;
      }
    }
    const recheck = () => {
      void check();
    };
    recheck();
    // Recover after a cold start, a redeployment, or a temporary network failure.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") recheck();
    }, 30000);
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
    };
  }, []);
  return online;
}
