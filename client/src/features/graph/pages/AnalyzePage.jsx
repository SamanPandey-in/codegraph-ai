import React from 'react';
import { useSelector } from 'react-redux';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  selectAnalysisJob,
  selectGraphStatus,
  selectGraphError,
  selectGraphData,
} from '../slices/graphSlice';
import AnalyzeForm from '../components/AnalyzeForm';
import GraphToolbar from '../components/GraphToolbar';
import GraphView from '../components/GraphView';

export default function AnalyzePage() {
  const status = useSelector(selectGraphStatus);
  const error = useSelector(selectGraphError);
  const data = useSelector(selectGraphData);
  const job = useSelector(selectAnalysisJob);

  if (status === 'succeeded' && data) {
    return (
      <div className="flex flex-col h-screen">
        <GraphToolbar />
        <GraphView />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {status === 'loading' && (
        <div className="mx-auto max-w-lg px-4 pt-6">
          <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
            <div>
              <p className="font-medium text-foreground">
                Analyzing with the multi-agent pipeline...
              </p>
              <p className="text-muted-foreground">
                Current stage: {job?.status || 'queued'}
              </p>
              {Number.isFinite(job?.fileCount) && (
                <p className="text-muted-foreground">
                  Files scanned: {job.fileCount}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'failed' && error && (
        <div className="mx-auto max-w-lg px-4 pt-6">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}
      <AnalyzeForm />
    </div>
  );
}
