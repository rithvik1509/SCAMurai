import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="container empty-state">
      <span className="eyebrow">404 / PAGE NOT FOUND</span>
      <h1>Let’s get you back on track.</h1>
      <p>
        This page isn’t available. You can start a new scan from the workspace.
      </p>
      <Button asChild>
        <Link href="/scan">Open scanner</Link>
      </Button>
    </div>
  );
}
