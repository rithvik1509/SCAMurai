"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useReactFlow,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { RotateCcw, Maximize2, ArrowRight, Network } from "lucide-react";
import type { InvestigationResult, EvidenceNode } from "@/lib/yokai/types";
import "@xyflow/react/dist/style.css";
type FlowNode = Node<{ evidence: EvidenceNode }, "observation">;
function ObservationNode({ data, selected }: NodeProps<FlowNode>) {
  const item = data.evidence;
  return (
    <div
      className={`yk-graph-node tone-${item.tone} ${selected ? "node-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <span>{item.kind.toUpperCase()}</span>
      <strong>{item.label}</strong>
      <small>{item.description}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { observation: ObservationNode };
const colors = {
  normal: "#859d60",
  difference: "#b78a30",
  sensitive: "#be6150",
  unavailable: "#9ca3af",
};
function GraphCanvas({
  graph,
  onEvidence,
}: {
  graph: InvestigationResult["graph"];
  onEvidence: (ids: string[]) => void;
}) {
  const initial = useMemo<FlowNode[]>(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "observation",
        position: node.position,
        data: { evidence: node },
        ariaLabel: `${node.kind}: ${node.label}. ${node.tone} observation.`,
      })),
    [graph],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial);
  const [selected, setSelected] = useState<string>(graph.nodes[0]?.id || "");
  const { fitView } = useReactFlow();
  const edges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        style: { stroke: colors[edge.tone], strokeWidth: 1.5 },
        labelStyle: { fill: "#637057", fontSize: 10 },
        labelBgStyle: { fill: "#fafcf8", fillOpacity: 0.95 },
        animated: false,
      })),
    [graph],
  );
  useEffect(() => {
    setNodes(initial);
    setSelected(graph.nodes[0]?.id || "");
  }, [initial, setNodes, graph]);
  const select = useCallback(
    (id: string) => {
      setSelected(id);
      setNodes((previous) =>
        previous.map((node) => ({ ...node, selected: node.id === id })),
      );
    },
    [setNodes],
  );
  const detail = graph.nodes.find((node) => node.id === selected);
  if (!graph.nodes.length)
    return (
      <div className="yk-panel yk-empty">
        <Network size={28} />
        <h2>No relationship graph was returned.</h2>
        <p>Unavailable relationships are not inferred from domain names.</p>
      </div>
    );
  return (
    <div className="yk-graph-layout">
      <section className="yk-panel yk-graph-panel">
        <div className="yk-panel-heading">
          <div>
            <span className="yk-eyebrow">FOLLOW WHAT WAS OBSERVED</span>
            <h2>Behavioral divergence</h2>
          </div>
          <div className="yk-graph-actions">
            <button
              className="yk-secondary"
              onClick={() => void fitView({ padding: 0.18, duration: 0 })}
            >
              <Maximize2 size={14} /> Fit view
            </button>
            <button
              className="yk-secondary"
              onClick={() => {
                setNodes(initial);
                requestAnimationFrame(
                  () => void fitView({ padding: 0.18, duration: 0 }),
                );
              }}
            >
              <RotateCcw size={14} /> Reset layout
            </button>
          </div>
        </div>
        <p className="yk-muted">
          Drag nodes to arrange the evidence. Select one to inspect its recorded
          relationships.
        </p>
        <div className="yk-graph-legend">
          {Object.entries({
            normal: "Observation",
            difference: "Difference",
            sensitive: "Sensitive",
            unavailable: "Incomplete",
          }).map(([tone, label]) => (
            <span key={tone}>
              <i style={{ background: colors[tone as keyof typeof colors] }} />
              {label}
            </span>
          ))}
        </div>
        <div className="yk-flow-canvas">
          <ReactFlow<FlowNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => select(node.id)}
            onSelectionChange={({ nodes: selectedNodes }) => {
              if (selectedNodes[0]) setSelected(selectedNodes[0].id);
            }}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.2}
            maxZoom={1.5}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            onlyRenderVisibleElements
            colorMode="light"
            preventScrolling={false}
          >
            <Background color="#d9e0cf" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <p className="yk-field-note">
          Connections come only from supplied observation records. This view
          does not probe domains or execute requests.
        </p>
      </section>
      <aside className="yk-panel yk-graph-detail">
        <label className="yk-label" htmlFor="yk-node">
          Inspect an observation
        </label>
        <select
          id="yk-node"
          value={selected}
          onChange={(e) => select(e.target.value)}
        >
          {graph.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.kind}: {node.label}
            </option>
          ))}
        </select>
        {detail && (
          <>
            <span className={`yk-tag tone-${detail.tone}`}>{detail.tone}</span>
            <h3>{detail.label}</h3>
            <p className="yk-break">{detail.description}</p>
            <span className="yk-eyebrow">RECORDED RELATIONSHIPS</span>
            <ul>
              {graph.edges
                .filter(
                  (edge) =>
                    edge.source === detail.id || edge.target === detail.id,
                )
                .map((edge) => (
                  <li key={edge.id}>
                    <strong>{edge.label}</strong>
                    <small>
                      {
                        graph.nodes.find(
                          (node) =>
                            node.id ===
                            (edge.source === detail.id
                              ? edge.target
                              : edge.source),
                        )?.label
                      }
                    </small>
                  </li>
                ))}
            </ul>
            <button
              className="yk-secondary"
              onClick={() => onEvidence(detail.evidenceIds)}
            >
              Open supporting evidence <ArrowRight size={14} />
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
export default function BehavioralDivergenceGraph(props: {
  graph: InvestigationResult["graph"];
  onEvidence: (ids: string[]) => void;
}) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
