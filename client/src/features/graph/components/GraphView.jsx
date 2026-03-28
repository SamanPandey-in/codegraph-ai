import React, { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
import { X } from 'lucide-react';
import {
  selectNode,
  selectSelectedNodeId,
  selectGraphData,
} from '../slices/graphSlice';

const TYPE_COLORS = {
  component: { bg: '#1e3a5f', border: '#3b82f6' },
  page:      { bg: '#1a3a2a', border: '#22c55e' },
  hook:      { bg: '#3a1e5f', border: '#a855f7' },
  service:   { bg: '#3a2a1e', border: '#f97316' },
  util:      { bg: '#1e3a3a', border: '#06b6d4' },
  config:    { bg: '#3a3a1e', border: '#eab308' },
  module:    { bg: '#1e1b4b', border: '#4f46e5' },
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

const NODE_W = 200;
const NODE_H = 42;

function applyDagreLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    return { ...n, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } };
  });
}

function graphToFlow(graph) {
  const nodes = Object.entries(graph).map(([file, { type }]) => ({
    id: file,
    data: { label: file },
    position: { x: 0, y: 0 },
    style: typeStyle(type),
  }));

  const edges = [];
  for (const [source, { deps }] of Object.entries(graph)) {
    for (const target of deps) {
      if (graph[target] !== undefined) {
        const { border } = TYPE_COLORS[graph[target].type] || TYPE_COLORS.module;
        edges.push({
          id: `${source}>${target}`,
          source,
          target,
          animated: true,
          style: { stroke: border, strokeWidth: 1.5 },
        });
      }
    }
  }

  return { nodes: applyDagreLayout(nodes, edges), edges };
}

function NodeDetail({ nodeId, graph, onClose }) {
  if (!nodeId || !graph[nodeId]) return null;
  const { deps = [], type } = graph[nodeId];
  const { border } = TYPE_COLORS[type] || TYPE_COLORS.module;
  const usedBy = Object.entries(graph)
    .filter(([, v]) => v.deps?.includes(nodeId))
    .map(([k]) => k);

  return (
    <div className="absolute top-2 right-2 z-10 w-72 rounded-xl border border-gray-700 bg-gray-950/95 backdrop-blur-sm p-4 text-xs shadow-xl">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block size-2.5 rounded-full shrink-0" style={{ background: border }} />
          <span className="font-mono font-semibold text-white/90 truncate">{nodeId}</span>
        </div>
        <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-white transition-colors" aria-label="Close">
          <X className="size-3.5" />
        </button>
      </div>

      <p className="mb-3 text-gray-400">
        Type: <span className="capitalize text-white/80">{type}</span>
      </p>

      {deps.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-gray-500 uppercase tracking-wider text-[10px]">Imports ({deps.length})</p>
          <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
            {deps.map((d) => <li key={d} className="font-mono text-blue-300 truncate">{d}</li>)}
          </ul>
        </div>
      )}

      {usedBy.length > 0 && (
        <div>
          <p className="mb-1 text-gray-500 uppercase tracking-wider text-[10px]">Used by ({usedBy.length})</p>
          <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
            {usedBy.map((d) => <li key={d} className="font-mono text-green-300 truncate">{d}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function GraphView() {
  const dispatch = useDispatch();
  const rawData = useSelector(selectGraphData);
  const selectedNodeId = useSelector(selectSelectedNodeId);
  const graph = rawData?.graph ?? {};

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

  const onNodeClick = useCallback(
    (_e, node) => dispatch(selectNode(node.id)),
    [dispatch],
  );

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No JS/TS files found in the selected directory.
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        fitView
        style={{ background: '#030712' }}
      >
        <MiniMap
          nodeColor={(n) => (TYPE_COLORS[graph[n.id]?.type] || TYPE_COLORS.module).border}
          maskColor="rgba(3,7,18,0.7)"
          style={{ background: '#111827' }}
        />
        <Controls />
        <Background color="#1f2937" gap={20} />

        <div className="absolute bottom-14 left-3 z-10 rounded-lg border border-gray-700 bg-gray-900/90 p-3 text-[11px]">
          {Object.entries(TYPE_COLORS).map(([type, { border }]) => (
            <div key={type} className="flex items-center gap-2 mb-1 last:mb-0">
              <span className="inline-block size-2.5 rounded-sm shrink-0" style={{ background: border }} />
              <span className="text-gray-300 capitalize">{type}</span>
            </div>
          ))}
        </div>
      </ReactFlow>

      <NodeDetail
        nodeId={selectedNodeId}
        graph={graph}
        onClose={() => dispatch(selectNode(null))}
      />
    </div>
  );
}
