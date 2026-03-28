import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FolderOpen, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { analyzeCodebase, selectGraphStatus } from '../slices/graphSlice';

export default function AnalyzeForm() {
  const dispatch = useDispatch();
  const status = useSelector(selectGraphStatus);
  const [path, setPath] = useState('');

  const isLoading = status === 'loading';

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) return;
    dispatch(analyzeCodebase(trimmed));
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-16">
      <div className="mb-2 flex size-14 items-center justify-center rounded-2xl border border-border bg-muted">
        <Sparkles className="size-6 text-primary" />
      </div>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-center">
        Analyze a Codebase
      </h1>
      <p className="mt-3 max-w-md text-center text-muted-foreground">
        Enter the absolute path to a local repository. The server will parse
        every&nbsp;JS/TS file and return its full dependency graph.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-10 w-full max-w-lg flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-path">Project path</Label>
          <div className="relative">
            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              id="project-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/absolute/path/to/your/project"
              className="pl-9 font-mono text-sm"
              disabled={isLoading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <Button type="submit" size="lg" disabled={isLoading || !path.trim()}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            'Analyze Codebase'
          )}
        </Button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground text-center max-w-sm">
        Tip: use an absolute path like{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          /home/user/my-project
        </code>{' '}
        or{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          C:\Users\user\my-project
        </code>
      </p>
    </div>
  );
}
