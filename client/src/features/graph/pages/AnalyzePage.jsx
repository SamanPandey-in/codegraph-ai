import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  selectAnalysisJob,
  selectGraphStatus,
  selectGraphError,
  selectGraphData,
} from '../slices/graphSlice';
import AnalyzeForm from '../components/AnalyzeForm';
import JobProgressBar from '../../jobs/components/JobProgressBar';

export default function AnalyzePage() {
  const status = useSelector(selectGraphStatus);
  const error = useSelector(selectGraphError);
  const data = useSelector(selectGraphData);
  const job = useSelector(selectAnalysisJob);

  return (
    <div className="min-h-screen bg-background">
      <AnalyzeForm />
      {data && status !== 'loading' && (
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/70 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Active graph ready for {data?.rootDir || 'the selected analysis'}.
            </p>
            <Link to="/graph">
              <Button size="sm" variant="outline">Open graph</Button>
            </Link>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="mx-auto max-w-lg px-4 py-6">
          <JobProgressBar job={job} />
        </div>
      )}

      {status === 'failed' && error && (
        <div className="mx-auto max-w-lg px-4 py-6">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
