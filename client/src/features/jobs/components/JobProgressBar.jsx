import React from 'react';

const STAGE_LABELS = {
  queued: { label: 'Queued for analysis', icon: 'Q' },
  ingesting: { label: 'Fetching repository', icon: 'I' },
  scanning: { label: 'Scanning files', icon: 'S' },
  parsing: { label: 'Parsing AST', icon: 'P' },
  building: { label: 'Building graph', icon: 'B' },
  enriching: { label: 'AI enrichment', icon: 'E' },
  embedding: { label: 'Generating embeddings', icon: 'M' },
  persisting: { label: 'Saving results', icon: 'V' },
  completed: { label: 'Analysis complete', icon: 'OK' },
  failed: { label: 'Analysis failed', icon: 'X' },
  partial: { label: 'Analysis completed with warnings', icon: '!' },
};

function confidenceClass(confidence) {
  if (confidence >= 0.85) return 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5';
  if (confidence >= 0.65) return 'border-amber-500/30 text-amber-400 bg-amber-500/5';
  return 'border-red-500/30 text-red-400 bg-red-500/5';
}

export default function JobProgressBar({ job }) {
  const stage = job?.status || 'queued';
  const info = STAGE_LABELS[stage] || { label: stage, icon: '...' };

  const overallConfidence = Number.isFinite(job?.overallConfidence)
    ? job.overallConfidence
    : null;

  const agentTrace = Array.isArray(job?.agentTrace) ? job.agentTrace : [];

  return (
    <section className="rounded-2xl shadow-neu-inset border-none bg-background/50 p-6 animate-in fade-in zoom-in duration-500">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex size-8 items-center justify-center rounded-xl shadow-neu-inset border-none bg-background/60 font-black text-gold/80">
          {info.icon}
        </div>
        <div>
          <p className="font-bold tracking-tight text-foreground/90">{info.label}</p>
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/40 mt-0.5">
            Stage: {stage}
          </p>
        </div>
        {overallConfidence !== null && (
          <div className="ml-auto text-right">
            <p className="text-xl font-display font-black tracking-tighter text-gold/80 leading-none">
              {(overallConfidence * 100).toFixed(0)}%
            </p>
            <p className="text-[9px] uppercase font-bold tracking-tighter text-muted-foreground/30 mt-1">
              Confidence
            </p>
          </div>
        )}
      </div>

      {Number.isFinite(job?.fileCount) && (
        <div className="mt-4 flex items-center justify-between text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/40">
          <span>Files scanned: {job.fileCount}</span>
        </div>
      )}

      {agentTrace.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {agentTrace.map((result, index) => {
            const confidence = Number(result?.confidence);
            const score = Number.isFinite(confidence) ? confidence : 0;
            const pct = Number.isFinite(confidence)
              ? (confidence * 100).toFixed(0)
              : '?';

            const label = typeof result?.agentId === 'string'
              ? result.agentId.replace('-agent', '')
              : `agent-${index + 1}`;

            return (
              <span
                key={result?.agentId || `${label}-${index}`}
                className={`rounded-xl px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest shadow-neu-inset border-none bg-background/40 ${confidenceClass(score)}`}
              >
                {label} <span className="opacity-40 mx-1">|</span> {pct}%
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
