import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Code2, FolderOpen, FileCode2, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearGraph, selectGraphData } from '../slices/graphSlice';

export default function GraphToolbar({ graphContainerId = 'graph-container' }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const data = useSelector(selectGraphData);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!data) return null;

  const { rootDir, fileCount } = data;

  const handleFullscreen = async () => {
    const element = document.getElementById(graphContainerId);
    if (!element) return;

    try {
      if (isFullscreen) {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      } else {
        await element.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (error) {
      console.error('Fullscreen request failed:', error);
    }
  };

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

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={handleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="gap-1.5"
        >
          {isFullscreen ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
          {isFullscreen ? 'Exit' : 'Fullscreen'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            dispatch(clearGraph());
            navigate('/analyze');
          }}
          className="gap-1.5"
        >
          <RotateCcw className="size-3.5" />
          New analysis
        </Button>
      </div>
    </header>
  );
}
