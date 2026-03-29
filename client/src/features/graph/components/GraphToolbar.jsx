import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Code2, FolderOpen, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearGraph, selectGraphData } from '../slices/graphSlice';

export default function GraphToolbar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const data = useSelector(selectGraphData);

  if (!data) return null;

  const { rootDir, fileCount } = data;

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <Code2 className="size-4 text-primary" />
          <span className="font-bold text-sm">
            CodeGraph<span className="text-primary">AI</span>
          </span>
        </div>

        <span className="text-muted-foreground hidden sm:inline">·</span>

        <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground min-w-0">
          <FolderOpen className="size-3.5 shrink-0" />
          <span className="font-mono truncate max-w-xs">{rootDir}</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <FileCode2 className="size-3.5" />
          <span>
            {fileCount} file{fileCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          dispatch(clearGraph());
          navigate('/analyze');
        }}
        className="shrink-0 gap-1.5"
      >
        <RotateCcw className="size-3.5" />
        New analysis
      </Button>
    </header>
  );
}
