import React, { useState } from 'react';
import { analyzeProject } from '../graphAPI.js';

/**
 * Home page – lets the user enter a local project path and trigger analysis.
 *
 * @param {{ onGraphReady: (graph: object) => void }} props
 */
export default function Home({ onGraphReady }) {
  const [projectPath, setProjectPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAnalyze(e) {
    e.preventDefault();
    if (!projectPath.trim()) return;

    setLoading(true);
    setError('');

    try {
      const data = await analyzeProject(projectPath);
      onGraphReady(data);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          'Something went wrong. Is the server running?',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      {/* Header */}
      <h1 className="text-4xl font-bold mb-2 tracking-tight">
        codegraph<span className="text-indigo-400">-ai</span>
      </h1>
      <p className="text-gray-400 mb-10 text-center">
        Visualize your codebase dependency graph in seconds.
      </p>

      {/* Input form */}
      <form
        onSubmit={handleAnalyze}
        className="w-full max-w-xl flex flex-col gap-4"
      >
        <input
          type="text"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="/absolute/path/to/your/project"
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white
                     placeholder-gray-500"
        />

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                     rounded-lg font-semibold transition-colors"
        >
          {loading ? 'Analyzing…' : 'Analyze Codebase'}
        </button>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
      </form>
    </div>
  );
}
