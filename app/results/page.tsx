"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function Results() {
  const router = useRouter();
  useEffect(() => {
    const mode = sessionStorage.getItem("scamurai-last-mode");
    router.replace(
      mode === "kage" || mode === "kagami"
        ? `/dashboard/${mode}/results`
        : "/dashboard",
    );
  }, [router]);
  return <p role="status">Opening your workspace report…</p>;
}
