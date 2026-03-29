import React from 'react';
import { useSelector } from 'react-redux';
import { X, AlertTriangle } from 'lucide-react';
import { selectAiExplainState, selectAiImpactState } from '../slices/aiSlice';

export default function AiPanel({ nodeId, graph, onClose }) {
  if (!nodeId || !graph?.[nodeId]) return null;

  const { deps = [], type, declarations = [] } = graph[nodeId];
  const usedBy = Object.entries(graph)
    .filter(([, value]) => value.deps?.includes(nodeId))
    .map(([file]) => file);

  const explainState = useSelector(selectAiExplainState);
  const impactState = useSelector(selectAiImpactState);

  const explanation = explainState?.data?.answer || explainState?.data?.explanation || null;
  const impactedFiles = impactState?.data?.affectedFiles || [];

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
