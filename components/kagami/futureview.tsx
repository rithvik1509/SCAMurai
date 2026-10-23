"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Braces,
  Play,
  LoaderCircle,
  ArrowUpRight,
} from "lucide-react";
import {
  decodeTransaction,
  previewTransaction,
  validateTransaction,
} from "@/lib/kagami/api";
import { createTransactionFixture, demoTransaction } from "@/lib/kagami/mocks";
import { transactionInputSchema } from "@/lib/kagami/schemas";
import {
  networks,
  buildErc20Calldata,
  type KagamiCapabilities,
  type NetworkId,
  type TransactionInput,
  type TransactionResult,
} from "@/lib/kagami/types";
import { CopyValue, EmptyPanel } from "./shared";
export function FutureView({
  wallet,
  network,
  demo,
  capabilities,
  initialPurpose = false,
}: {
  wallet: string;
  network: NetworkId;
  demo: boolean;
  capabilities: KagamiCapabilities | null;
  initialPurpose?: boolean;
}) {
  const [sender, setSender] = useState(wallet);
  const [target, setTarget] = useState("");
  const [calldata, setCalldata] = useState("");
  const [valueWei, setValueWei] = useState("0");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [action, setAction] = useState<"decode" | "preview">("decode");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [builderMethod, setBuilderMethod] = useState<
    "approve" | "transfer" | "transferFrom"
  >("approve");
  const [builderDestination, setBuilderDestination] = useState("");
  const [builderAmount, setBuilderAmount] = useState("0");
  const [builderOwner, setBuilderOwner] = useState("");
  const request = useRef<AbortController | null>(null);
  const version = useRef(0);
  const available = capabilities?.networks.find((n) => n.id === network);
  const networkLabel = networks.find((n) => n.id === network)?.label;
  useEffect(() => () => request.current?.abort(), []);
  function invalidate() {
    version.current++;
    request.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
  }
  function example(unsupported: boolean) {
    invalidate();
    const input = demoTransaction(network, unsupported);
    setSender(input.sender);
    setTarget(input.target);
    setCalldata(input.calldata);
    setValueWei(input.valueWei);
    setPurpose(input.claimedPurpose);
  }
  async function run(kind: "decode" | "preview") {
    setError("");
    const input: TransactionInput = {
      network,
      sender: sender.trim(),
      target: target.trim(),
      calldata: calldata.trim(),
      valueWei: valueWei.trim(),
      claimedPurpose: purpose.trim(),
    };
    const parsed = transactionInputSchema.safeParse(input);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setError(
        field === "calldata"
          ? "Calldata must be 0x followed by complete hexadecimal bytes, including a four-byte method selector."
          : field === "valueWei"
            ? "Native value must be an exact nonnegative uint256 integer in wei."
            : field === "claimedPurpose"
              ? "Keep the claimed purpose under 4,000 characters."
              : "Enter valid sender and target EVM addresses: 0x followed by 40 hexadecimal characters.",
      );
      return;
    }
    if (!capabilities?.available || !available?.[kind]) {
      setError(
        `The selected service does not support transaction ${kind} on this network.`,
      );
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++version.current;
    setBusy(true);
    setResult(null);
    setAction(kind);
    try {
      const value = demo
        ? validateTransaction(createTransactionFixture(input, kind))
        : await (kind === "decode" ? decodeTransaction : previewTransaction)(
            input,
            controller.signal,
          );
      if (!controller.signal.aborted && current === version.current)
        setResult(value);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "The transaction request failed.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="kg-future-grid">
      <section className="kg-panel kg-transaction-form">
        <header className="kg-panel-heading">
          <div>
            <span className="kg-eyebrow">
              WALLET FUTUREVIEW / UNSIGNED INPUT
            </span>
            <h2>Before you sign.</h2>
          </div>
          <Braces size={24} />
        </header>
        <p className="kg-note">
          Inspect a transaction's declared inputs. No wallet connection,
          signature, or broadcast.
        </p>
        {demo && (
          <div className="kg-examples">
            <span>FICTIONAL EXAMPLES</span>
            <button className="kg-secondary" onClick={() => example(false)}>
              ERC-20 approval <ArrowUpRight size={13} />
            </button>
            <button className="kg-secondary" onClick={() => example(true)}>
              Unknown method
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("preview");
          }}
        >
          <label className="kg-label" htmlFor="kg-tx-network">
            Transaction network
          </label>
          <input id="kg-tx-network" value={networkLabel} readOnly />
          <label className="kg-label" htmlFor="kg-sender">
            Sender address
          </label>
          <input
            id="kg-sender"
            value={sender}
            onChange={(e) => {
              invalidate();
              setSender(e.target.value);
            }}
            placeholder="0x…"
            spellCheck={false}
            maxLength={42}
            required
          />
          <label className="kg-label" htmlFor="kg-target">
            Target contract address
          </label>
          <input
            id="kg-target"
            value={target}
            onChange={(e) => {
              invalidate();
              setTarget(e.target.value);
            }}
            placeholder="0x…"
            spellCheck={false}
            maxLength={42}
            required
          />
          <label className="kg-label" htmlFor="kg-calldata">
            Transaction calldata
          </label>
          <textarea
            id="kg-calldata"
            value={calldata}
            onChange={(e) => {
              invalidate();
              setCalldata(e.target.value);
            }}
            placeholder="0x095ea7b3…"
            spellCheck={false}
            maxLength={200000}
            required
          />
          <label className="kg-label" htmlFor="kg-wei">
            Native value (wei)
          </label>
          <input
            id="kg-wei"
            value={valueWei}
            onChange={(e) => {
              invalidate();
              setValueWei(e.target.value);
            }}
            inputMode="numeric"
            maxLength={78}
            required
          />
          <p className="kg-note">
            Exact integer units. 1 ETH = 1,000,000,000,000,000,000 wei.
          </p>
          {!demo && (
            <details className="kg-specific-allowance">
              <summary>Build ERC-20 calldata</summary>
              <p className="kg-note">
                Prepare unsigned inputs for decoding or preview. Enter exact raw
                token units; this does not send a transaction.
              </p>
              <div className="kg-specific-fields">
                <label>
                  Operation
                  <select
                    aria-label="ERC-20 operation"
                    value={builderMethod}
                    onChange={(e) =>
                      setBuilderMethod(e.target.value as typeof builderMethod)
                    }
                  >
                    <option value="approve">Approve a spender</option>
                    <option value="transfer">Transfer tokens</option>
                    <option value="transferFrom">Transfer from an owner</option>
                  </select>
                </label>
                <label>
                  {builderMethod === "approve" ? "Spender" : "Recipient"}{" "}
                  address
                  <input
                    aria-label="Builder destination address"
                    value={builderDestination}
                    onChange={(e) => setBuilderDestination(e.target.value)}
                    maxLength={42}
                    spellCheck={false}
                  />
                </label>
                {builderMethod === "transferFrom" && (
                  <label>
                    Owner address
                    <input
                      aria-label="Builder owner address"
                      value={builderOwner}
                      onChange={(e) => setBuilderOwner(e.target.value)}
                      maxLength={42}
                      spellCheck={false}
                    />
                  </label>
                )}
                <label>
                  Amount in raw units
                  <input
                    aria-label="Builder raw amount"
                    value={builderAmount}
                    onChange={(e) => setBuilderAmount(e.target.value)}
                    maxLength={78}
                    inputMode="numeric"
                  />
                </label>
              </div>
              <button
                type="button"
                className="kg-secondary"
                disabled={busy}
                onClick={() => {
                  invalidate();
                  try {
                    setCalldata(
                      buildErc20Calldata(
                        builderMethod,
                        builderDestination.trim(),
                        builderAmount.trim(),
                        builderOwner.trim(),
                      ),
                    );
                    setValueWei("0");
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not build calldata.",
                    );
                  }
                }}
              >
                Use generated calldata
              </button>
            </details>
          )}
          <details className="kg-purpose" open={initialPurpose || undefined}>
            <summary>
              Expected purpose <span>Optional</span>
            </summary>
            <label className="kg-label" htmlFor="kg-purpose">
              What do you expect this transaction to do?
            </label>
            <textarea
              id="kg-purpose"
              value={purpose}
              onChange={(e) => {
                invalidate();
                setPurpose(e.target.value);
              }}
              placeholder="Describe the expected action…"
              maxLength={4000}
            />
          </details>
          {(!available?.decode || !available?.preview) && (
            <p className="kg-notice">
              {!capabilities?.available
                ? "Transaction endpoints are not available on the connected service. Choose demo examples to explore."
                : `On this network: decoding ${available?.decode ? "available" : "unsupported"}; outcome preview ${available?.preview ? "available" : "unsupported"}.`}
            </p>
          )}
          {error && (
            <p className="kg-error" role="alert">
              {error}
            </p>
          )}
          <div className="kg-form-actions">
            <button
              className="kg-secondary"
              type="button"
              disabled={busy || !available?.decode}
              onClick={() => void run("decode")}
            >
              <Braces size={15} /> Decode transaction
            </button>
            <button
              className="kg-primary"
              type="submit"
              disabled={busy || !available?.preview}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Play size={15} />
              )}{" "}
              {busy ? "Waiting for response…" : "Preview outcome"}
            </button>
          </div>
          {busy && (
            <button
              type="button"
              className="kg-inline-link"
              onClick={() => {
                invalidate();
                setError(
                  "Stopped waiting. This does not cancel backend processing.",
                );
              }}
            >
              Stop waiting for request
            </button>
          )}
        </form>
      </section>
      <div className="kg-future-output">
        {result ? (
          <section className="kg-panel kg-outcome" aria-live="polite">
            <header className="kg-panel-heading">
              <div>
                <span className="kg-eyebrow">
                  {result.demo ? "FICTIONAL DEMO RESULT" : "SERVICE RESULT"}
                </span>
                <h2>
                  {action === "decode" ? "Decoded action" : "Estimated outcome"}
                </h2>
              </div>
              <span className={`kg-badge status-${result.status}`}>
                {result.status}
              </span>
            </header>
            <p className="kg-note">
              {networkLabel} · {new Date(result.checkedAt).toLocaleString()}
              {result.demo ? " · Fixture timestamp" : ""}
            </p>
            {result.error && <p className="kg-error">{result.error}</p>}
            {result.status === "unsupported" ||
            result.status === "failed" ||
            result.status === "reverted" ? (
              <div className="kg-result-status">
                <h3>
                  {result.status === "unsupported"
                    ? "This transaction is not supported."
                    : result.status === "reverted"
                      ? "The service reports a revert."
                      : "The request could not be analyzed."}
                </h3>
                <p>No completed outcome is displayed.</p>
              </div>
            ) : result.status === "pending" ? (
              <p className="kg-notice">
                The service returned a pending result. No completed simulation
                evidence is available yet.
              </p>
            ) : (
              <>
                <h3>
                  {result.functionName || "Function information unavailable"}
                </h3>
                <div className="kg-decoded-params">
                  {result.parameters.map((p, i) => (
                    <div key={`${p.name}-${i}`}>
                      <span>{p.name}</span>
                      <CopyValue value={p.value} label={`Copy ${p.name}`} />
                    </div>
                  ))}
                </div>
                {result.effects.length ? (
                  <div className="kg-effects">
                    {result.effects.map((effect) => (
                      <article key={effect.id}>
                        <span className="kg-eyebrow">
                          {effect.kind.toUpperCase()} / {effect.asset}
                        </span>
                        <h3>{effect.label}</h3>
                        <div className="kg-before-after">
                          <div>
                            <small>BEFORE</small>
                            <strong>{effect.before ?? "Unavailable"}</strong>
                          </div>
                          <ArrowRight size={19} />
                          <div>
                            <small>ESTIMATED AFTER</small>
                            <strong>{effect.after ?? "Unavailable"}</strong>
                          </div>
                        </div>
                        <span className="kg-badge">
                          {effect.direction === "permission"
                            ? "Permission change · No transfer implied"
                            : effect.direction}
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="kg-notice">
                    {action === "decode"
                      ? "Decoding describes the call. Run Preview outcome for supported modeled effects."
                      : "No supported effect evidence was supplied. This is not a prediction of no impact."}
                  </p>
                )}
                {(result.expectedAction || result.actualAction) && (
                  <section className="kg-promise">
                    <h3>Promise vs. reality</h3>
                    <div>
                      <span>Expected action</span>
                      <p>{result.expectedAction || "No purpose supplied."}</p>
                    </div>
                    <div>
                      <span>Decoded or modeled action</span>
                      <p>{result.actualAction || "Unavailable."}</p>
                    </div>
                    {result.mismatches.length ? (
                      result.mismatches.map((m, i) => (
                        <p className="kg-notice" key={i}>
                          {m.finding}
                        </p>
                      ))
                    ) : (
                      <p className="kg-note">
                        No contradiction finding was supplied. Review the
                        decoded facts and limitations.
                      </p>
                    )}
                  </section>
                )}
              </>
            )}
            <details className="kg-evidence">
              <summary>Result evidence · {result.evidence.length}</summary>
              {result.evidence.map((e) => (
                <div key={e.id}>
                  <strong>{e.label}</strong>
                  <p>{e.reference}</p>
                </div>
              ))}
            </details>
            <div className="kg-limitations">
              <h4>Analysis limitations</h4>
              <ul>
                {result.limitations.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : (
          <section className="kg-panel">
            <EmptyPanel title="An informed next signature.">
              Load a labeled example or enter an unsigned transaction. The
              result will explain supported permissions and effects, with its
              evidence and limits.
            </EmptyPanel>
            <div className="kg-output-guide">
              <div>
                <span>01</span>
                <p>
                  <strong>Decode the request.</strong> Inspect the function and
                  exact parameters.
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>Preview supported effects.</strong> Compare available
                  before and estimated after data.
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>Read the limitations.</strong> A preview cannot
                  guarantee final execution.
                </p>
              </div>
            </div>
          </section>
        )}
        <p className="kg-estimate-note">
          Simulation results are estimates and may differ from final blockchain
          execution.
        </p>
      </div>
    </div>
  );
}
