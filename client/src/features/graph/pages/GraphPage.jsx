import React, { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GraphToolbar from '../components/GraphToolbar';
import GraphView from '../components/GraphView';
import {
  loadSavedGraph,
  selectGraphData,
  selectGraphError,
  selectGraphStatus,
} from '../slices/graphSlice';

function toFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export default function GraphPage() {
  const dispatch = useDispatch();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const status = useSelector(selectGraphStatus);
  const error = useSelector(selectGraphError);
  const data = useSelector(selectGraphData);

  const requestedJobId = useMemo(() => {
    const stateJobId = location.state?.jobId;
    const queryJobId = searchParams.get('jobId');
    return stateJobId || queryJobId || null;
  }, [location.state, searchParams]);

  useEffect(() => {
    if (!requestedJobId) return;
    if (data?.jobId === requestedJobId) return;

    dispatch(
      loadSavedGraph({
        jobId: requestedJobId,
        rootDir: location.state?.rootDir || null,
        fileCount: toFiniteNumber(location.state?.fileCount),
        analyzedAt: location.state?.analyzedAt || null,
      }),
    );
  }, [data?.jobId, dispatch, location.state, requestedJobId]);

  if (!data && status === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center text-sm text-muted-foreground">
        Loading saved analysis graph...
      </div>
    );
  }

  if (!data && status === 'failed' && error) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-8">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">No active graph yet</h2>
        <p className="text-sm text-muted-foreground">
          Choose a repository from Dashboard history or run a new analysis.
        </p>
        <div className="flex items-center gap-2">
          <Link to="/dashboard">
            <Button variant="outline">Open dashboard</Button>
          </Link>
          <Link to="/analyze">
            <Button>New analysis</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6.75rem)] flex-col">
      <GraphToolbar />
      <GraphView />
    </div>
  );
}
