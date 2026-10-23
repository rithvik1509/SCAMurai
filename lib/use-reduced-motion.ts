"use client";
import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

// Hydration must start with the same snapshot as the server, including in reduced-motion browsers.
export function useAccessibleMotion() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
