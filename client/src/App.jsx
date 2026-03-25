import React, { useState } from 'react';
import Home from './pages/Home.jsx';
import GraphPage from './pages/GraphPage.jsx';

export default function App() {
  const [graph, setGraph] = useState(null);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {graph ? (
        <GraphPage graph={graph} onReset={() => setGraph(null)} />
      ) : (
        <Home onGraphReady={setGraph} />
      )}
    </div>
  );
}
