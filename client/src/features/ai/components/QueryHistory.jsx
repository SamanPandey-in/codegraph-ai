import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { ChevronDown, History, Loader2, RotateCw } from 'lucide-react';
import { queryGraph } from '../slices/aiSlice';
import { aiService } from '../services/aiService';

const HISTORY_LIMIT = 5;

function formatRelativeDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default function QueryHistory({ jobId }) {
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const [queries, setQueries] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const hasQueries = queries.length > 0;
  const isLoading = status === 'loading';

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!jobId) {
        if (!cancelled) {
          setQueries([]);
          setStatus('idle');
          setError('');
          setIsOpen(false);
        }
        return;
      }

      setStatus('loading');
      setError('');

      try {
        const data = await aiService.getQueryHistory({
          jobId,
          page: 1,
          limit: HISTORY_LIMIT,
        });

        if (cancelled) return;

        setQueries(data.queries || []);
        setStatus('succeeded');
        if ((data.queries || []).length === 0) {
          setIsOpen(false);
        }
      } catch (loadError) {
        if (cancelled) return;

        setQueries([]);
        setStatus('failed');
        setError(
          loadError?.response?.data?.error ||
          loadError?.message ||
          'Failed to load query history.',
        );
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const visibleQueries = useMemo(() => queries.slice(0, HISTORY_LIMIT), [queries]);

  if (!jobId) return null;

  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-background/40">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <History className="size-3.5" />
          Recent queries
        </span>
        <span className="flex items-center gap-2">
          {isLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {hasQueries && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {queries.length}
            </span>
          )}
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border/70 px-3 py-2">
          {error && (
            <p className="text-xs text-destructive/80">{error}</p>
          )}

          {!error && !isLoading && visibleQueries.length === 0 && (
            <p className="text-xs text-muted-foreground">No saved queries for this analysis yet.</p>
          )}

          {!error && visibleQueries.length > 0 && (
            <ul className="flex flex-col gap-1">
              {visibleQueries.map((queryItem) => (
                <li key={queryItem.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!queryItem.question) return;
                      dispatch(queryGraph({ question: queryItem.question, jobId }));
                    }}
                    className="group flex w-full items-start justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                  >
                    <span className="line-clamp-2 text-xs text-foreground/90">{queryItem.question}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelativeDate(queryItem.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!error && queries.length > HISTORY_LIMIT && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Showing most recent {HISTORY_LIMIT} queries.
            </p>
          )}

          {!error && !isLoading && (
            <button
              type="button"
              onClick={async () => {
                setStatus('loading');
                setError('');

                try {
                  const data = await aiService.getQueryHistory({
                    jobId,
                    page: 1,
                    limit: HISTORY_LIMIT,
                  });

                  setQueries(data.queries || []);
                  setStatus('succeeded');
                } catch (refreshError) {
                  setStatus('failed');
                  setError(
                    refreshError?.response?.data?.error ||
                    refreshError?.message ||
                    'Failed to refresh query history.',
                  );
                }
              }}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <RotateCw className="size-3" />
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}
