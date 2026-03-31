import React, { useEffect, useMemo, useRef, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Edit3,
  ExternalLink,
  GitBranch,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchRepositoryFile,
  fetchRepositoryStructure,
  saveRepositoryFile,
  selectAnalyzeFile,
  selectAnalyzeSelectedRepository,
  selectAnalyzeStructure,
} from '../slices/analyzeSlice';
import { AiPanel } from '@/features/ai';
import { loadSavedGraph, selectGraphData } from '@/features/graph';

function detectPrismLanguage(filePath = '') {
  const normalized = String(filePath).toLowerCase();

  if (normalized.endsWith('.ts')) return 'typescript';
  if (normalized.endsWith('.tsx')) return 'tsx';
  if (normalized.endsWith('.js')) return 'javascript';
  if (normalized.endsWith('.jsx')) return 'jsx';
  if (normalized.endsWith('.json')) return 'json';
  if (normalized.endsWith('.css')) return 'css';
  if (normalized.endsWith('.html')) return 'markup';
  if (normalized.endsWith('.md')) return 'markdown';
  if (normalized.endsWith('.yml') || normalized.endsWith('.yaml')) return 'yaml';
  if (normalized.endsWith('.py')) return 'python';
  if (normalized.endsWith('.sh')) return 'bash';

  return 'clike';
}

export default function AnalyzeFilePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const selectedRepository = useSelector(selectAnalyzeSelectedRepository);
  const structure = useSelector(selectAnalyzeStructure);
  const fileState = useSelector(selectAnalyzeFile);
  const graphData = useSelector(selectGraphData);

  const [editorValue, setEditorValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const editorGutterRef = useRef(null);
  const editorTextareaRef = useRef(null);
  const viewerGutterRef = useRef(null);
  const viewerCodeRef = useRef(null);

  const routeDirectory = useMemo(() => {
    const raw = params.dir_name ? decodeURIComponent(params.dir_name) : '';
    return raw.trim();
  }, [params.dir_name]);

  const currentPath = useMemo(() => {
    const queryPath = String(searchParams.get('path') || '').trim();
    if (queryPath) return queryPath;
    return routeDirectory;
  }, [routeDirectory, searchParams]);

  const selectedFilePath = useMemo(() => {
    return String(searchParams.get('file') || '').trim();
  }, [searchParams]);

  useEffect(() => {
    dispatch(fetchRepositoryStructure());
  }, [dispatch]);

  useEffect(() => {
    if (!selectedFilePath) return;
    dispatch(fetchRepositoryFile({ path: selectedFilePath }));
  }, [dispatch, selectedFilePath]);

  const analysisJobId = selectedRepository?.jobId || selectedRepository?.latestJobId || graphData?.jobId || null;

  useEffect(() => {
    if (!analysisJobId) return;
    if (graphData?.jobId === analysisJobId) return;

    dispatch(
      loadSavedGraph({
        jobId: analysisJobId,
        rootDir: selectedRepository?.fullName || null,
      }),
    );
  }, [analysisJobId, dispatch, graphData?.jobId, selectedRepository?.fullName]);

  useEffect(() => {
    const fileContent = fileState.data?.content;
    if (typeof fileContent !== 'string') return;
    setEditorValue(fileContent);
    setIsEditing(false);
  }, [fileState.data?.content, fileState.data?.path]);

  const codeLanguage = useMemo(
    () => detectPrismLanguage(fileState.data?.path || selectedFilePath),
    [fileState.data?.path, selectedFilePath],
  );

  const highlightedContent = useMemo(() => {
    const value = String(fileState.data?.content || '');
    const grammar = Prism.languages[codeLanguage] || Prism.languages.clike;
    return Prism.highlight(value, grammar, codeLanguage);
  }, [codeLanguage, fileState.data?.content]);

  const viewerLineCount = useMemo(() => {
    const value = String(fileState.data?.content || '');
    return Math.max(1, value.split('\n').length);
  }, [fileState.data?.content]);

  const editorLineCount = useMemo(() => {
    return Math.max(1, String(editorValue || '').split('\n').length);
  }, [editorValue]);

  const hasUnsavedChanges =
    typeof fileState.data?.content === 'string' &&
    editorValue !== fileState.data.content;

  const handleSaveFile = async () => {
    if (!fileState.data?.path || !fileState.data?.sha) return;

    await dispatch(
      saveRepositoryFile({
        path: fileState.data.path,
        content: editorValue,
        sha: fileState.data.sha,
        message: `Update ${fileState.data.path} via CodeGraph AI editor`,
      }),
    );

    setIsEditing(false);
  };



  const backToExplorer = `/analyze/${encodeURIComponent(routeDirectory)}?path=${encodeURIComponent(currentPath)}`;

  const aiGraph = useMemo(() => {
    const graphObject = graphData?.graph;

    if (graphObject && typeof graphObject === 'object' && !Array.isArray(graphObject)) {
      return graphObject;
    }

    const fallbackNodes = Array.isArray(graphData?.nodes) ? graphData.nodes : [];
    return fallbackNodes.reduce((acc, node) => {
      if (!node?.id) return acc;
      acc[node.id] = {
        deps: Array.isArray(node.deps) ? node.deps : [],
        type: node.type || 'file',
        summary: node.summary || null,
        declarations: Array.isArray(node.declarations) ? node.declarations : [],
      };
      return acc;
    }, {});
  }, [graphData?.graph, graphData?.nodes]);

  const hasNodeInsights = Boolean(selectedFilePath && aiGraph?.[selectedFilePath]);

  return (
    <section className="mx-auto w-full max-w-475 px-4 pb-10 pt-7 2xl:px-6">
      <div className="mb-5">
        <Link
          to={backToExplorer}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground/80 hover:text-foreground active-scale transition-all"
        >
          <ArrowLeft className="size-4" />
          Back to Explorer
        </Link>
      </div>

      <header className="rounded-2xl shadow-neu-inset border-none bg-background/40 px-5 py-6">
        {structure.repository?.fullName && (
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-bold tracking-tight">
            <span className="rounded-xl shadow-neu-inset border-none bg-background/60 px-3 py-1.5 ">
              {structure.repository.fullName}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl shadow-neu-inset border-none bg-background/60 px-3 py-1.5 ">
              <GitBranch className="size-3.5 text-primary" />
              {structure.repository.branch || structure.repository.defaultBranch || 'default'}
            </span>
            {fileState.data?.htmlUrl && (
              <a
                href={fileState.data.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground/80 hover:text-foreground active-scale transition-all"
              >
                View on GitHub
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        )}
      </header>

      {!selectedFilePath && (
        <div className="mt-6 rounded-xl border border-border/60 bg-card/60 px-4 py-4 text-sm text-muted-foreground">
          No file selected. Open a file from repository explorer first.
        </div>
      )}

      {selectedFilePath && (
        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_17.5rem] 2xl:grid-cols-[minmax(0,1fr)_18.5rem]">
          <div className="rounded-2xl shadow-neu-inset border-none bg-background/40">
          <div className="flex items-center justify-between gap-3 border-b border-border/10 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">File</p>
              <p className="truncate text-sm font-display font-bold tracking-tight">{selectedFilePath}</p>
            </div>

            <div className="flex items-center gap-2">
              {!isEditing ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  disabled={!fileState.canEdit || fileState.status === 'loading'}
                  className="rounded-xl shadow-neu-inset border-none bg-background/50 active-scale"
                >
                  <Edit3 className="size-3.5" />
                  Edit
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditorValue(fileState.data?.content || '');
                      setIsEditing(false);
                    }}
                    className="rounded-xl shadow-neu-inset border-none bg-background/50 active-scale"
                  >
                    <X className="size-3.5" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveFile}
                    disabled={!hasUnsavedChanges || fileState.saveStatus === 'loading'}
                    className="rounded-xl bg-gold text-white shadow-md active-scale"
                  >
                    <Save className="size-3.5" />
                    {fileState.saveStatus === 'loading' ? 'Saving...' : 'Save'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {fileState.status === 'loading' && (
            <div className="px-4 py-6 text-sm text-muted-foreground">Loading file content...</div>
          )}

          {fileState.status === 'failed' && fileState.error && (
            <div className="m-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {fileState.error}
            </div>
          )}

          {fileState.status === 'succeeded' && fileState.data && (
            <div className="p-4">
              {isEditing ? (
                <div className="flex rounded-2xl shadow-neu-inset border-none bg-background/60 overflow-x-auto custom-scrollbar">
                  <div className="flex min-w-full">
                    <pre
                      ref={editorGutterRef}
                      aria-hidden="true"
                      className="sticky left-0 z-10 w-14 shrink-0 border-r border-border/10 bg-background/20 px-2 py-3 text-right font-mono text-xs leading-5 text-muted-foreground/60"
                    >
                      {Array.from({ length: editorLineCount }, (_, i) => i + 1).join('\n')}
                    </pre>
                    <textarea
                      ref={editorTextareaRef}
                      value={editorValue}
                      onChange={(e) => setEditorValue(e.target.value)}
                      spellCheck={false}
                      rows={editorLineCount}
                      className="min-w-max flex-1 resize-none bg-transparent px-3 py-3 font-mono text-xs leading-5 outline-none whitespace-pre overflow-hidden text-foreground/90"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex rounded-2xl shadow-neu-inset border-none bg-background/60 overflow-x-auto custom-scrollbar">
                  <div className="flex min-w-full">
                    <pre
                      ref={viewerGutterRef}
                      aria-hidden="true"
                      className="sticky left-0 z-10 w-14 shrink-0 border-r border-border/10 bg-background/20 px-2 py-3 text-right font-mono text-xs leading-5 text-muted-foreground/60"
                    >
                      {Array.from({ length: viewerLineCount }, (_, i) => i + 1).join('\n')}
                    </pre>
                    <pre
                      ref={viewerCodeRef}
                      className="min-w-max flex-1 px-4 py-3 font-mono text-xs leading-5 overflow-visible whitespace-pre"
                    >
                      <code
                        className={`language-${codeLanguage}`}
                        dangerouslySetInnerHTML={{ __html: highlightedContent }}
                      />
                    </pre>
                  </div>
                </div>
              )}

              {!fileState.canEdit && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Read-only mode: sign in with GitHub and select an owned repository to edit files.
                </p>
              )}

              {fileState.saveStatus === 'succeeded' && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-600">
                  <Check className="size-3.5" />
                  Changes saved successfully.
                </p>
              )}

              {fileState.saveStatus === 'failed' && fileState.saveError && (
                <p className="mt-2 text-xs text-destructive">{fileState.saveError}</p>
              )}
            </div>
          )}
          </div>

          <div className="relative min-h-104 xl:justify-self-end xl:w-full">
            {hasNodeInsights ? (
              <AiPanel
                nodeId={selectedFilePath}
                graph={aiGraph}
                onClose={() => navigate(backToExplorer)}
              />
            ) : (
              <div className="rounded-xl border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
                Insight panel is available after graph data is loaded for this repository/job.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
