import React from 'react';
import { useSelector } from 'react-redux';
import { AlertCircle } from 'lucide-react';
import {
  selectAnalysisJob,
  selectGraphStatus,
  selectGraphError,
  selectGraphData,
} from '../slices/graphSlice';
import AnalyzeForm from '../components/AnalyzeForm';
import GraphToolbar from '../components/GraphToolbar';
import GraphView from '../components/GraphView';
import JobProgressBar from '../../jobs/components/JobProgressBar';

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
          <JobProgressBar job={job} />
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
