import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

// ---------------------------------------------------------------------------
// Node colours by file type
// ---------------------------------------------------------------------------
const TYPE_COLORS = {
  component: { bg: '#1e3a5f', border: '#3b82f6' }, // blue
  page:      { bg: '#1a3a2a', border: '#22c55e' }, // green
  hook:      { bg: '#3a1e5f', border: '#a855f7' }, // purple
  service:   { bg: '#3a2a1e', border: '#f97316' }, // orange
  util:      { bg: '#1e3a3a', border: '#06b6d4' }, // cyan
  config:    { bg: '#3a3a1e', border: '#eab308' }, // yellow
  module:    { bg: '#1e1b4b', border: '#4f46e5' }, // indigo (default)
};

function typeStyle(type) {
  const { bg, border } = TYPE_COLORS[type] || TYPE_COLORS.module;
  return {
    background: bg,
    border: `1px solid ${border}`,
    color: '#e0e7ff',
    borderRadius: 8,
    fontSize: 11,
    padding: '6px 10px',
    maxWidth: 200,
    wordBreak: 'break-all',
  };
}

// ---------------------------------------------------------------------------
// Dagre layout
// ---------------------------------------------------------------------------
const NODE_WIDTH = 200;
const NODE_HEIGHT = 42;

/**
 * Apply a dagre left-to-right layout to an array of React Flow nodes/edges
 * and return new nodes with updated positions.
 */
function applyDagreLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    return {
      ...n,
      position: {
        // dagre centres the node; React Flow anchors top-left
        x: x - NODE_WIDTH / 2,
        y: y - NODE_HEIGHT / 2,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Graph → React Flow conversion
// ---------------------------------------------------------------------------

/**
 * Convert the backend dependency graph to React Flow nodes + edges.
 *
 * @param {Record<string, { deps: string[], type: string }>} graph
 * @returns {{ nodes: object[], edges: object[] }}
 */
function graphToFlow(graph) {
  // Build nodes (no position yet — dagre will set them)
  const nodes = Object.entries(graph).map(([file, { type }]) => ({
    id: file,
    data: { label: file },
    position: { x: 0, y: 0 },
    style: typeStyle(type),
  }));

  // Build edges — only draw edges where target is a known node
  const edges = [];
  for (const [source, { deps }] of Object.entries(graph)) {
    for (const target of deps) {
      if (graph[target] !== undefined) {
        const { border } = TYPE_COLORS[graph[target].type] || TYPE_COLORS.module;
        edges.push({
          id: `${source}->${target}`,
          source,
          target,
          animated: true,
          style: { stroke: border, strokeWidth: 1.5 },
        });
      }
    }
  }

  // Apply dagre layout to position nodes
  const positionedNodes = applyDagreLayout(nodes, edges);
  return { nodes: positionedNodes, edges };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Interactive React Flow graph for the dependency data.
 *
 * @param {{ graph: Record<string, { deps: string[], type: string }> }} props
 */
export default function GraphView({ graph }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => graphToFlow(graph),
    [graph],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No JS/TS files found in the selected directory.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      fitView
      style={{ background: '#030712' }}
    >
      <MiniMap
        nodeColor={(n) => {
          const type = graph[n.id]?.type;
          return (TYPE_COLORS[type] || TYPE_COLORS.module).border;
        }}
        maskColor="rgba(3,7,18,0.7)"
        style={{ background: '#111827' }}
      />
      <Controls />
      <Background color="#1f2937" gap={20} />

      {/* Legend */}
      <div className="absolute bottom-14 right-3 z-10 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs">
        {Object.entries(TYPE_COLORS).map(([type, { border }]) => (
          <div key={type} className="flex items-center gap-2 mb-1 last:mb-0">
            <span
              className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
              style={{ background: border }}
            />
            <span className="text-gray-300 capitalize">{type}</span>
          </div>
        ))}
      </div>
    </ReactFlow>
  );
}
