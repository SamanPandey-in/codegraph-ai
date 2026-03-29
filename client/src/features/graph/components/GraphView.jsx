import React, { useCallback, useEffect, useMemo } from 'react';
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
import { AiPanel, QueryBar } from '../../ai';
import {
  selectNode,
  selectSelectedNodeId,
  selectGraphData,
} from '../slices/graphSlice';
import { selectDeadFiles, selectHighlightedNodeIds } from '../../ai/slices/aiSlice';

const TYPE_COLORS = {
  component: { bg: '#1A1A1A', border: '#404040' },
  page:      { bg: '#0B0B0B', border: '#D4AF37' }, // Premium Gold accent for pages
  hook:      { bg: '#262626', border: '#D4AF37' }, // Premium Gold accent for hooks
  service:   { bg: '#1A1A1A', border: '#404040' },
  util:      { bg: '#262626', border: '#404040' },
  config:    { bg: '#0B0B0B', border: '#666666' },
  module:    { bg: '#1A1A1A', border: '#404040' },
};

// Type legend data (map TYPE_COLORS to legend entries)
const TYPE_LEGEND = Object.entries(TYPE_COLORS).map(([type, { border }]) => [type, border]);

function typeStyle(type) {
  const { bg, border } = TYPE_COLORS[type] || TYPE_COLORS.module;
  return {
    background: bg,
    border: `1px solid ${border}`,
    color: '#E5E5E5',
    borderRadius: 8,
    fontSize: 11,
    padding: '6px 10px',
    maxWidth: 200,
    wordBreak: 'break-all',
  };
}

const NODE_W = 200;
const NODE_H = 42;
const EMPTY_GRAPH = {};

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

function graphToFlow(graph, highlightedNodeIds, deadFiles) {
  const highlightSet = new Set(highlightedNodeIds || []);
  const deadSet = new Set(deadFiles || []);

  const nodes = Object.entries(graph).map(([file, { type }]) => ({
    id: file,
    data: { label: file },
    position: { x: 0, y: 0 },
    style: {
      ...typeStyle(type),
      boxShadow: highlightSet.has(file)
        ? '0 0 0 2px rgba(251,191,36,0.95), 0 0 20px rgba(251,191,36,0.45)'
        : undefined,
      border: deadSet.has(file)
        ? '1px dashed rgba(248,113,113,0.9)'
        : typeStyle(type).border,
      opacity: deadSet.has(file) ? 0.75 : 1,
    },
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

export default function GraphView() {
  const dispatch = useDispatch();
  const rawData = useSelector(selectGraphData);
  const selectedNodeId = useSelector(selectSelectedNodeId);
  const highlightedNodeIds = useSelector(selectHighlightedNodeIds);
  const deadFiles = useSelector(selectDeadFiles);
  const graph = rawData?.graph ?? EMPTY_GRAPH;
  const jobId = rawData?.jobId;
  const emptyMessage =
    rawData?.message || 'No JS/TS files found in the selected directory.';

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => graphToFlow(graph, highlightedNodeIds, deadFiles),
    [graph, highlightedNodeIds, deadFiles],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialEdges, initialNodes, setEdges, setNodes]);

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
        {emptyMessage}
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
        style={{ background: 'transparent' }}
      >
        <MiniMap
          nodeColor={(n) => (TYPE_COLORS[graph[n.id]?.type] || TYPE_COLORS.module).border}
          maskColor="rgb(var(--background) / 0.7)"
          style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border) / 0.1)' }}
        />
        <Controls />
        <Background color="rgb(var(--foreground) / 0.05)" gap={20} />

        {/* Query Bar Panel */}
        <div className="absolute top-3 left-3 z-10 w-96 rounded-lg border border-border bg-card/90 backdrop-blur-sm shadow-lg p-0">
          <QueryBar jobId={jobId} />
        </div>

        {/* Type Legend */}
        <div className="absolute bottom-14 left-3 z-10 rounded-lg border border-border bg-card/90 backdrop-blur-sm p-3 text-[11px] shadow-lg">
          {TYPE_LEGEND.map(([type, color]) => (
            <div key={type} className="flex items-center gap-2 mb-1 last:mb-0">
              <span className="inline-block size-2.5 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-muted-foreground capitalize">{type}</span>
            </div>
          ))}
        </div>
      </ReactFlow>      

      <AiPanel
        nodeId={selectedNodeId}
        graph={graph}
        onClose={() => dispatch(selectNode(null))}
      />
    </div>
  );
}
