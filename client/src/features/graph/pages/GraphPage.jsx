import React from 'react';
import GraphView from '../components/GraphView.jsx';

/**
 * Graph page – renders the dependency graph returned by the API.
 *
 * @param {{ graph: object, onReset: () => void }} props
 */
export default function GraphPage({ graph, onReset }) {
  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold">
            codegraph<span className="text-indigo-400">-ai</span>
          </h1>
          <p className="text-xs text-gray-400">
            {graph.fileCount} file{graph.fileCount !== 1 ? 's' : ''} scanned ·{' '}
            <span className="font-mono text-gray-500 text-xs truncate max-w-xs inline-block align-bottom">
              {graph.rootDir}
            </span>
          </p>
        </div>
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          ← New Analysis
        </button>
      </header>

      {/* Graph canvas */}
      <div className="flex-1 min-h-0">
        <GraphView graph={graph.graph} />
      </div>
    </div>
  );
}
