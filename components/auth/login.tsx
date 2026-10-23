"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  ArrowRight,
  ArrowUpRight,
  GitCompareArrows,
  LoaderCircle,
  ArrowLeft,
  LockKeyhole,
} from "lucide-react";
import { safeReturnPath, useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/brand/brand-mark";
export function Login({ destination }: { destination: string }) {
  const { session, loading, signIn } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = safeReturnPath(destination);
  useEffect(() => {
    if (!loading && session) router.replace(next);
  }, [session, loading, next, router]);
  async function enter(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(name);
      router.replace(next);
    } catch {
      setError(
        "This browser could not save your demo session. Allow session storage and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-world">
      <div className="login-frame">
        <aside className="login-art">
          <Link href="/" className="login-brand">
            <BrandMark priority />
            SCAMurai.
          </Link>
          <div className="login-art-copy">
            <span>UNDERSTAND THE SCAM. STOP THE MISTAKE.</span>
            <h1>
              A sharper instinct.
              <br />
              <em>Starts here.</em>
            </h1>
            <p>
              A space to question the message, inspect the permission, and make
              a more informed next move.
            </p>
          </div>
          <div className="login-mode-preview">
            <div>
              <ScanLine />
              <span>
                KAGE<small>Website intelligence</small>
              </span>
            </div>
            <div>
              <GitCompareArrows />
              <span>
                KAGAMI<small>Transaction truth</small>
              </span>
            </div>
          </div>
          <div className="login-sculpture" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span className="login-art-footer">
            FINANCIAL SELF-DEFENSE / SCAMURAI
          </span>
        </aside>
        <section className="login-form-panel">
          <Link href="/" className="login-back">
            <ArrowLeft size={14} />
            Back to SCAMurai
          </Link>
          <div className="login-form-content">
            <span className="login-form-icon">
              <BrandMark />
            </span>
            <span className="login-eyebrow">YOUR WORKSPACE AWAITS</span>
            <h2>
              Welcome to
              <br />
              your next move.
            </h2>
            <p>
              Choose KAGE for website investigations, or KAGAMI for transaction
              permissions.
            </p>
            <form onSubmit={enter}>
              <label htmlFor="display-name">
                What should we call you? <span>Optional</span>
              </label>
              <input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Investigator"
                autoComplete="nickname"
              />
              <button type="submit" disabled={busy || loading}>
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    Opening workspace…
                  </>
                ) : (
                  <>
                    Enter demo workspace <ArrowRight size={18} />
                  </>
                )}
              </button>
              {error && (
                <p role="alert" className="login-error">
                  {error}
                </p>
              )}
            </form>
            <div className="login-disclosure">
              <LockKeyhole size={15} />
              <p>
                <strong>A demonstration session, in this tab.</strong>No
                password needed. Real account sign-in is not connected yet. This
                session does not provide secure authentication.
              </p>
            </div>
            <Link href="/rescue" className="login-help">
              Need urgent help? Open Rescue Mode <ArrowUpRight size={14} />
            </Link>
          </div>
          <span className="login-form-footer">
            No wallet connection. No seed phrases. Just clarity.
          </span>
        </section>
      </div>
    </div>
  );
}
