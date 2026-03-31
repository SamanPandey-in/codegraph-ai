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
import UploadRepoForm from '../components/UploadRepoForm';
import JobProgressBar from '../../jobs/components/JobProgressBar';

export default function UploadRepoPage() {
  const status = useSelector(selectGraphStatus);
  const error = useSelector(selectGraphError);
  const data = useSelector(selectGraphData);
  const job = useSelector(selectAnalysisJob);

  return (
    <div className="min-h-screen bg-background">
      <UploadRepoForm />
      {data && status !== 'loading' && (
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-center justify-between gap-4 rounded-2xl shadow-neu-inset border-none bg-background/60 px-6 py-4 animate-in fade-in zoom-in-95 duration-500">
            <p className="text-sm text-muted-foreground/80 font-medium">
              Active graph ready for <span className="text-foreground font-bold">{data?.rootDir || 'the selected analysis'}</span>.
            </p>
            <Link to="/graph">
              <Button size="sm" variant="outline" className="rounded-xl shadow-neu-inset border-none bg-background/50 active-scale">Open graph</Button>
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
        <div className="mx-auto max-w-lg px-4 py-8">
          <div className="flex items-start gap-3 rounded-2xl shadow-neu-inset border-none bg-destructive/5 px-6 py-4 text-sm text-destructive animate-in shake duration-500">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
