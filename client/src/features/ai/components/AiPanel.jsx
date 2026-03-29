import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X, AlertTriangle, Loader2, Zap } from 'lucide-react';
import {
  analyzeImpact,
  selectAiImpactState,
} from '../slices/aiSlice';
import { selectGraphData } from '../../graph/slices/graphSlice';
import { aiService } from '../services/aiService';

export default function AiPanel({ nodeId, graph, onClose }) {
  const dispatch = useDispatch();
  const graphData = useSelector(selectGraphData);
  const impactState = useSelector(selectAiImpactState);
  const jobId = graphData?.jobId;
  const [streamedText, setStreamedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState('');

  const nodeData = nodeId ? graph?.[nodeId] : null;

  useEffect(() => {
    if (!nodeId || !jobId) {
      setStreamedText('');
      setIsStreaming(false);
      setStreamError('');
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();

    setStreamedText('');
    setIsStreaming(true);
    setStreamError('');

    aiService
      .streamExplain({
        question: `Explain the file ${nodeId} and include its purpose, key functions, dependencies, and risks.`,
        jobId,
        signal: controller.signal,
        onChunk: (text) => {
          if (isCancelled) return;
          setStreamedText((prev) => prev + text);
        },
        onDone: () => {
          if (isCancelled) return;
          setIsStreaming(false);
        },
        onError: (error) => {
          if (isCancelled) return;
          setStreamError(error?.message || 'Failed to load explanation');
          setIsStreaming(false);
        },
      })
      .catch(() => {
        // Errors are handled in onError callback.
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [nodeId, jobId]);

  if (!nodeId || !nodeData) return null;

  const { deps = [], type, declarations = [], summary } = nodeData;
  const usedBy = Object.entries(graph)
    .filter(([, value]) => value.deps?.includes(nodeId))
    .map(([file]) => file);

  const impactedFiles = impactState?.data?.affectedFiles || [];
  const isImpacting = impactState?.status === 'loading';

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

      {summary && !streamedText && !isStreaming && !streamError && (
        <div className="mb-3 rounded-lg border border-border bg-background/40 p-3">
          <p className="mb-1 text-muted-foreground/60 uppercase tracking-wider text-[10px]">Summary</p>
          <p className="text-foreground/90 leading-relaxed">{summary}</p>
        </div>
      )}

      <div className="mb-3 rounded-lg border border-border bg-background/40 p-3">
        <p className="mb-2 text-muted-foreground/60 uppercase tracking-wider text-[10px] flex items-center gap-1">
          <Zap className="size-3" /> AI Explanation
        </p>
        {isStreaming && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>Analyzing...</span>
          </div>
        )}
        {streamError && (
          <p className="text-red-400 flex items-center gap-1">
            <AlertTriangle className="size-3" /> {streamError}
          </p>
        )}
        {streamedText && (
          <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{streamedText}</p>
        )}
      </div>

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

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Impact Analysis</p>
          <button
            type="button"
            onClick={handleSimulateImpact}
            disabled={isImpacting || !jobId}
            className="text-[10px] text-amber-400/70 hover:text-amber-400 disabled:opacity-40 transition-colors"
          >
            {isImpacting ? 'Running...' : 'Simulate change ->'}
          </button>
        </div>

        {impactedFiles.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
            <ul className="flex flex-col gap-0.5 max-h-24 overflow-y-auto custom-scrollbar">
              {impactedFiles.map((file) => (
                <li key={file} className="font-mono text-amber-200/80 truncate">{file}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

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
    </div>
  );
}
