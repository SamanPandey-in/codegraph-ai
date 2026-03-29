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
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-base leading-none">{info.icon}</span>
        <p className="font-medium text-foreground">{info.label}</p>
        {overallConfidence !== null && (
          <p className="ml-auto text-xs text-muted-foreground">
            Confidence: {(overallConfidence * 100).toFixed(0)}%
          </p>
        )}
      </div>

      <div className="mt-1 text-xs text-muted-foreground">
        Stage: {stage}
      </div>

      {Number.isFinite(job?.fileCount) && (
        <div className="mt-1 text-xs text-muted-foreground">
          Files scanned: {job.fileCount}
        </div>
      )}

      {agentTrace.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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
                className={`rounded-full border px-2 py-0.5 text-[10px] ${confidenceClass(score)}`}
              >
                {label} {pct}%
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
