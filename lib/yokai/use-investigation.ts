"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "../config";
import {
  cancelInvestigation,
  getCapabilities,
  getInvestigation,
  startInvestigation,
  validateInvestigation,
} from "./api";
import { createDemoInvestigation } from "./fixtures";
import {
  readHistory,
  readInvestigation,
  storeInvestigation,
  type HistoryItem,
} from "./session";
import {
  terminalStatuses,
  type DemoCase,
  type Investigation,
  type InvestigationCapabilities,
  type InvestigationRequest,
} from "./types";

export function useInvestigation(initialId?: string) {
  const [job, setJob] = useState<Investigation | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [capabilities, setCapabilities] =
    useState<InvestigationCapabilities | null>(null);
  const [error, setError] = useState("");
  const [storageNote, setStorageNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = useRef<Investigation | null>(null);
  const request = useRef<AbortController | null>(null);
  const router = useRouter();
  const receive = useCallback((value: Investigation) => {
    current.current = value;
    setJob(value);
    try {
      storeInvestigation(value);
      setHistory(readHistory());
    } catch {
      setStorageNote(
        "This result is available now, but the browser could not save session history.",
      );
    }
  }, []);
  useEffect(() => {
    setHistory(readHistory());
    const controller = new AbortController();
    if (config.demo)
      setCapabilities({
        available: true,
        profiles: ["desktop", "mobile", "returning"],
        allowedOrigins: [],
        cancellation: false,
        authorizationPolicy:
          "Controlled demo fixtures only. No website will be visited.",
      });
    else
      void getCapabilities(controller.signal)
        .then(setCapabilities)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!initialId || current.current?.id === initialId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setBusy(true);
    setJob(null);
    current.current = null;
    const restore = async () => {
      if (initialId.startsWith("demo-")) {
        const cached = readInvestigation(initialId);
        if (!cached?.demo)
          throw Error(
            "This demo investigation is no longer in this tab. Open a new example below.",
          );
        return cached;
      }
      if (config.demo)
        throw Error(
          "Live investigations cannot be retrieved in demonstration mode.",
        );
      return getInvestigation(initialId, controller.signal);
    };
    void restore()
      .then((value) => {
        if (!controller.signal.aborted) receive(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [initialId, receive, retry]);
  useEffect(() => {
    if (
      !job ||
      busy ||
      job.demo ||
      terminalStatuses.includes(job.status) ||
      error
    )
      return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void getInvestigation(job.id, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) receive(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 2000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [job, busy, error, receive, retry]);
  async function start(
    input: InvestigationRequest,
    scenario: DemoCase,
    demo = config.demo,
  ) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setJob(null);
    current.current = null;
    if (!demo) router.replace("/dashboard/kage", { scroll: false });
    try {
      let value = demo
        ? validateInvestigation(createDemoInvestigation(scenario, input))
        : await startInvestigation(input, controller.signal);
      if (!value.demo && value.status === "completed" && !value.result)
        value = await getInvestigation(value.id, controller.signal);
      if (!controller.signal.aborted) {
        receive(value);
        router.replace(`/dashboard/kage?id=${encodeURIComponent(value.id)}`, {
          scroll: false,
        });
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "The investigation could not be started.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function cancel() {
    if (!job || !capabilities?.cancellation || job.demo) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const value = await cancelInvestigation(job.id, controller.signal);
      if (!controller.signal.aborted) receive(value);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Cancellation could not be confirmed.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return {
    job,
    history,
    capabilities,
    busy,
    error,
    storageNote,
    start,
    cancel,
    retry: () => {
      setError("");
      setRetry((v) => v + 1);
    },
    open: (id: string) =>
      router.push(`/dashboard/kage?id=${encodeURIComponent(id)}`),
  };
}
