import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X, AlertTriangle } from 'lucide-react';
import {
  analyzeImpact,
  explainNode,
  selectAiExplainState,
  selectAiImpactState,
} from '../slices/aiSlice';

export default function AiPanel({ nodeId, graph, onClose }) {
  const dispatch = useDispatch();
  const jobId = useSelector((state) => state.graph.data?.jobId);
  const explainState = useSelector(selectAiExplainState);
  const impactState = useSelector(selectAiImpactState);

  const nodeData = nodeId ? graph?.[nodeId] : null;

  useEffect(() => {
    if (!nodeId || !jobId) return;

    dispatch(explainNode({ jobId, filePath: nodeId, nodeLabel: nodeId }));
  }, [dispatch, nodeId, jobId]);

  if (!nodeId || !nodeData) return null;

  const { deps = [], type, declarations = [], summary } = nodeData;
  const usedBy = Object.entries(graph)
    .filter(([, value]) => value.deps?.includes(nodeId))
    .map(([file]) => file);

  const explanation = explainState?.data?.answer || null;
  const impactedFiles = impactState?.data?.affectedFiles || [];
  const isImpactLoading = impactState?.status === 'loading';

  const handleSimulateImpact = () => {
    if (!jobId || !nodeId) return;
    dispatch(analyzeImpact({ jobId, filePath: nodeId }));
  };

  return (
    <div className="absolute top-2 right-2 z-10 w-80 max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card/95 backdrop-blur-sm p-4 text-xs shadow-xl transition-all">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono font-semibold text-foreground truncate">{nodeId}</span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <p className="mb-3 text-muted-foreground">
        Type: <span className="capitalize text-foreground/80">{type}</span>
      </p>

      {summary && (
        <div className="mb-3 rounded-lg border border-border bg-background/40 p-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Summary</p>
          <p className="text-foreground/90 leading-relaxed">{summary}</p>
        </div>
      )}

      {declarations.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">
            Declarations ({declarations.length})
          </p>
          <ul className="flex flex-wrap gap-1">
            {declarations.map((d) => (
              <li key={`${d.kind}:${d.name}`} className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                {d.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {explanation && (
        <div className="mb-3 rounded-lg border border-border bg-background/40 p-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">AI Explanation</p>
          <p className="text-foreground/90 leading-relaxed">{explanation}</p>
        </div>
      )}

      {deps.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Imports ({deps.length})</p>
          <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto custom-scrollbar">
            {deps.map((dep) => (
              <li key={dep} className="font-mono text-gold/80 truncate">{dep}</li>
            ))}
          </ul>
        </div>
      )}

      {usedBy.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Used By ({usedBy.length})</p>
          <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto custom-scrollbar">
            {usedBy.map((file) => (
              <li key={file} className="font-mono text-foreground/70 truncate">{file}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3">
        <button
          type="button"
          onClick={handleSimulateImpact}
          disabled={!jobId || isImpactLoading}
          className="w-full rounded-md border border-border bg-background/60 px-2.5 py-2 text-left text-[11px] text-foreground/85 transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isImpactLoading ? 'Simulating impact...' : 'Simulate change impact ->'}
        </button>
      </div>

      {impactedFiles.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300">
            <AlertTriangle className="size-3" />
            Impacted Files ({impactedFiles.length})
          </p>
          <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto custom-scrollbar">
            {impactedFiles.map((file) => (
              <li key={file} className="font-mono text-amber-200/80 truncate">{file}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
