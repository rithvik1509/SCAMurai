"use client";
import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import {
  explorerAddress,
  shortAddress,
  severityLabels,
  isAddress,
  type NetworkId,
  type Severity,
} from "@/lib/kagami/types";
export function CopyValue({
  value,
  label = "Copy full value",
  short = false,
}: {
  value: string;
  label?: string;
  short?: boolean;
}) {
  const [state, setState] = useState("");
  return (
    <span className="kg-copy">
      <code title={value}>
        {short ? (
          shortAddress(value)
        ) : isAddress(value) ? (
          <>
            {value.slice(0, Math.ceil(value.length / 2))}
            <wbr />
            {value.slice(Math.ceil(value.length / 2))}
          </>
        ) : (
          value
        )}
      </code>
      <button
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("Copied");
          } catch {
            setState("Select the value to copy it");
          }
        }}
      >
        {state === "Copied" ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <span className="sr-only" role="status">
        {state}
      </span>
    </span>
  );
}
export function AddressValue({
  value,
  network,
  demo,
  label = "Copy full address",
}: {
  value: string;
  network: NetworkId;
  demo: boolean;
  label?: string;
}) {
  const href = explorerAddress(network, value, demo);
  return (
    <div className="kg-address">
      <CopyValue value={value} label={label} />
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer">
          Explorer <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`kg-badge severity-${severity}`}>
      {severityLabels[severity]}
    </span>
  );
}
export function EmptyPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="kg-empty">
      <div className="kg-empty-symbol" aria-hidden="true">
        鏡
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
