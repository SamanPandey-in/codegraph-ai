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

/**
 * Convert the raw dependency graph object into React Flow nodes and edges.
 *
 * @param {Record<string, string[]>} graph - { "file.js": ["dep.js", ...] }
 * @returns {{ nodes: object[], edges: object[] }}
 */
function graphToFlow(graph) {
  const files = Object.keys(graph);

  // Simple grid layout: place nodes in rows of 4
  const COLS = 4;
  const X_GAP = 220;
  const Y_GAP = 100;

  const nodes = files.map((file, i) => ({
    id: file,
    data: { label: file },
    position: {
      x: (i % COLS) * X_GAP + 50,
      y: Math.floor(i / COLS) * Y_GAP + 50,
    },
    style: {
      background: '#1e1b4b',
      border: '1px solid #4f46e5',
      color: '#e0e7ff',
      borderRadius: 8,
      fontSize: 11,
      padding: '6px 10px',
      maxWidth: 200,
      wordBreak: 'break-all',
    },
  }));

  const edges = [];
  for (const [source, deps] of Object.entries(graph)) {
    for (const target of deps) {
      if (graph[target] !== undefined) {
        edges.push({
          id: `${source}->${target}`,
          source,
          target,
          animated: true,
          style: { stroke: '#6366f1' },
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Interactive React Flow graph of the dependency data.
 *
 * @param {{ graph: Record<string, string[]> }} props
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
        nodeColor="#4f46e5"
        maskColor="rgba(3,7,18,0.7)"
        style={{ background: '#111827' }}
      />
      <Controls />
      <Background color="#1f2937" gap={20} />
    </ReactFlow>
  );
}
