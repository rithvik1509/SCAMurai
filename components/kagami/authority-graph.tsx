"use client";
import { useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Maximize2,
  RotateCcw,
  Wallet,
  KeyRound,
  Coins,
  Code2,
} from "lucide-react";
import {
  shortAddress,
  type AuthorityNode,
  type WalletAnalysis,
} from "@/lib/kagami/types";
import { EmptyPanel } from "./shared";
import "@xyflow/react/dist/style.css";
type GraphNode = Node<
  {
    record: AuthorityNode;
    removed: boolean;
    severity: string;
    active: boolean;
  },
  "authority"
>;
function AuthorityCard({ data, selected }: NodeProps<GraphNode>) {
  const Icon =
    data.record.kind === "wallet"
      ? Wallet
      : data.record.kind === "token"
        ? Coins
        : data.record.kind === "delegation"
          ? Code2
          : KeyRound;
  return (
    <div
      className={`kg-node kind-${data.record.kind} severity-${data.severity} ${data.removed ? "is-removed" : ""} ${!data.active ? "is-inactive" : ""} ${selected ? "is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <span>
        <Icon size={14} />
        {data.record.kind}
        {data.removed && <em>Modeled off</em>}
      </span>
      <strong>{data.record.label}</strong>
      <small>
        {data.record.address
          ? shortAddress(data.record.address)
          : !data.active
            ? "Inactive observation"
            : "Recorded permission"}
      </small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { authority: AuthorityCard };
function Canvas({
  analysis,
  removed,
  selected,
  onSelect,
}: {
  analysis: WalletAnalysis;
  removed: string[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const graph = analysis.graph;
  const { fitView, setCenter } = useReactFlow();
  const initial = useMemo<GraphNode[]>(
    () =>
      graph?.nodes.map((n) => ({
        id: n.id,
        type: "authority",
        position: n.position,
        data: {
          record: n,
          removed: false,
          severity:
            analysis.permissions.find((p) => p.id === n.permissionId)
              ?.severity || "none",
          active:
            analysis.permissions.find((p) => p.id === n.permissionId)?.active ??
            true,
        },
        ariaLabel: `${n.kind}: ${n.label}`,
      })) || [],
    [graph, analysis.permissions],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial);
  const currentNodes = useRef(nodes);
  currentNodes.current = nodes;
  useEffect(() => {
    setNodes(initial);
  }, [initial, setNodes]);
  useEffect(() => {
    setNodes((previous) =>
      previous.map((n) => ({
        ...n,
        selected: n.id === selected,
        style: {
          opacity:
            selected === "wallet" ||
            n.id === selected ||
            graph?.edges.some(
              (e) =>
                (e.source === selected && e.target === n.id) ||
                (e.target === selected && e.source === n.id),
            )
              ? 1
              : 0.35,
        },
        data: {
          ...n.data,
          removed:
            !!n.data.record.permissionId &&
            removed.includes(n.data.record.permissionId),
        },
      })),
    );
  }, [removed, selected, initial, setNodes]);
  useEffect(() => {
    const node = currentNodes.current.find((n) => n.id === selected);
    if (node && selected !== "wallet")
      void setCenter(node.position.x + 105, node.position.y + 48, {
        zoom: 1,
        duration: 0,
      });
  }, [selected, initial, setCenter]);
  const edges = useMemo(
    () =>
      graph?.edges.map((edge) => {
        const p = analysis.permissions.find((p) => p.id === edge.permissionId),
          disabled = removed.includes(edge.permissionId) || !p?.active;
        return {
          ...edge,
          style: {
            stroke: disabled
              ? "#b8c5c5"
              : p?.severity === "high"
                ? "#b56b58"
                : p?.severity === "review"
                  ? "#b28a43"
                  : "#5f9b9b",
            strokeWidth: 1.5,
            strokeDasharray: disabled ? "5 5" : undefined,
            opacity: disabled
              ? 0.4
              : selected !== "wallet" &&
                  edge.source !== selected &&
                  edge.target !== selected
                ? 0.2
                : 1,
          },
          labelStyle: { fontSize: 10, fill: "#647b7b" },
          labelBgStyle: { fill: "#f7fbfa" },
          animated: false,
        };
      }) || [],
    [graph, analysis.permissions, removed, selected],
  );
  if (!graph?.nodes.length)
    return (
      <EmptyPanel title="No authority graph was returned.">
        Available approval records can still be reviewed. Missing relationships
        are not inferred.
      </EmptyPanel>
    );
  return (
    <section className="kg-panel kg-graph-panel">
      <header className="kg-panel-heading">
        <div>
          <span className="kg-eyebrow">KUROKAGI / OBSERVED RELATIONSHIPS</span>
          <h2>Who can act?</h2>
        </div>
        <div className="kg-graph-controls">
          <button
            className="kg-secondary"
            onClick={() => void fitView({ padding: 0.18, duration: 0 })}
          >
            <Maximize2 size={14} /> Fit view
          </button>
          <button
            className="kg-secondary"
            onClick={() => {
              setNodes(
                initial.map((n) => ({
                  ...n,
                  selected: n.id === selected,
                  data: {
                    ...n.data,
                    removed:
                      !!n.data.record.permissionId &&
                      removed.includes(n.data.record.permissionId),
                  },
                })),
              );
              requestAnimationFrame(
                () => void fitView({ padding: 0.18, duration: 0 }),
              );
            }}
          >
            <RotateCcw size={14} /> Reset layout
          </button>
        </div>
      </header>
      <p className="kg-note">
        Select a node or relationship to inspect its evidence. An approval is
        authority, not a transfer.
      </p>
      <div className="kg-graph-legend">
        <span>
          <i className="wallet" />
          Wallet
        </span>
        <span>
          <i />
          Permission
        </span>
        <span>
          <i className="review" />
          Review
        </span>
        <span>
          <i className="inactive" />
          Inactive / modeled off
        </span>
      </div>
      <div className="kg-flow">
        <ReactFlow<GraphNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => onSelect(node.id)}
          onEdgeClick={(_, edge) => {
            const record = graph.edges.find((e) => e.id === edge.id);
            const node = graph.nodes.find(
              (n) =>
                n.permissionId === record?.permissionId &&
                (n.kind === "permission" || n.kind === "delegation"),
            );
            if (node) onSelect(node.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.15}
          maxZoom={1.6}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          onlyRenderVisibleElements
          colorMode="light"
          preventScrolling={false}
        >
          <Background color="#dbe6e5" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <label className="kg-label" htmlFor="kg-observation">
        Inspect a graph observation
      </label>
      <select
        id="kg-observation"
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
      >
        {graph.nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.kind}: {n.label}
            {n.address ? ` · ${shortAddress(n.address)}` : ""}
          </option>
        ))}
      </select>
    </section>
  );
}
export default function AuthorityGraph(props: {
  analysis: WalletAnalysis;
  removed: string[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
