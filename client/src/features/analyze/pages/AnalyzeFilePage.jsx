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
  AlertTriangle,
  Check,
  Edit3,
  ExternalLink,
  GitBranch,
  Loader2,
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
import { aiService } from '@/features/ai/services/aiService';

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
  const [isAutoSnippetAnalyze, setIsAutoSnippetAnalyze] = useState(true);
  const [snippetState, setSnippetState] = useState({
    status: 'idle',
    error: '',
    selectedSnippet: '',
    lineStart: null,
    lineEnd: null,
    data: null,
  });

  const editorGutterRef = useRef(null);
  const editorTextareaRef = useRef(null);
  const viewerGutterRef = useRef(null);
  const viewerCodeRef = useRef(null);
  const snippetAbortRef = useRef(null);
  const snippetDebounceRef = useRef(null);

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
    setSnippetState({
      status: 'idle',
      error: '',
      selectedSnippet: '',
      lineStart: null,
      lineEnd: null,
      data: null,
    });
  }, [fileState.data?.content, fileState.data?.path]);

  useEffect(() => {
    return () => {
      if (snippetDebounceRef.current) {
        clearTimeout(snippetDebounceRef.current);
      }
      if (snippetAbortRef.current) {
        snippetAbortRef.current.abort();
      }
    };
  }, []);

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

  const getLineNumberFromOffset = (value, offset) => {
    const safeOffset = Math.max(0, Math.min(String(value || '').length, offset));
    const upToOffset = String(value || '').slice(0, safeOffset);
    return upToOffset.split('\n').length;
  };

  const triggerSnippetAnalysis = ({ snippet, lineStart, lineEnd, shouldAnalyze = true }) => {
    const normalizedSnippet = String(snippet || '').trim();

    if (!shouldAnalyze) {
      if (snippetDebounceRef.current) {
        clearTimeout(snippetDebounceRef.current);
      }
      if (snippetAbortRef.current) {
        snippetAbortRef.current.abort();
      }

      setSnippetState((prev) => ({
        ...prev,
        status: 'idle',
        error: '',
        selectedSnippet: normalizedSnippet,
        lineStart: Number.isInteger(lineStart) ? lineStart : null,
        lineEnd: Number.isInteger(lineEnd) ? lineEnd : null,
        data: null,
      }));
      return;
    }

    if (!normalizedSnippet || !analysisJobId || !selectedFilePath) {
      if (snippetAbortRef.current) {
        snippetAbortRef.current.abort();
      }

      setSnippetState((prev) => ({
        ...prev,
        status: 'idle',
        error: '',
        selectedSnippet: normalizedSnippet,
        lineStart: Number.isInteger(lineStart) ? lineStart : null,
        lineEnd: Number.isInteger(lineEnd) ? lineEnd : null,
        data: null,
      }));
      return;
    }

    if (snippetDebounceRef.current) {
      clearTimeout(snippetDebounceRef.current);
    }

    snippetDebounceRef.current = setTimeout(async () => {
      if (snippetAbortRef.current) {
        snippetAbortRef.current.abort();
      }

      const controller = new AbortController();
      snippetAbortRef.current = controller;

      setSnippetState((prev) => ({
        ...prev,
        status: 'loading',
        error: '',
        selectedSnippet: normalizedSnippet,
        lineStart: Number.isInteger(lineStart) ? lineStart : null,
        lineEnd: Number.isInteger(lineEnd) ? lineEnd : null,
      }));

      try {
        const result = await aiService.analyzeSnippetImpact({
          jobId: analysisJobId,
          filePath: selectedFilePath,
          snippet: normalizedSnippet,
          lineStart,
          lineEnd,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setSnippetState({
          status: 'succeeded',
          error: '',
          selectedSnippet: normalizedSnippet,
          lineStart: Number.isInteger(lineStart) ? lineStart : null,
          lineEnd: Number.isInteger(lineEnd) ? lineEnd : null,
          data: result,
        });
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'CanceledError' || error?.name === 'AbortError') {
          return;
        }

        setSnippetState((prev) => ({
          ...prev,
          status: 'failed',
          error:
            error?.response?.data?.error ||
            error?.message ||
            'Failed to analyze selected snippet.',
          data: null,
        }));
      }
    }, 450);
  };

  const handleTextareaSelection = (event) => {
    const target = event?.target;
    const value = String(target?.value || '');
    const start = Number.isInteger(target?.selectionStart) ? target.selectionStart : 0;
    const end = Number.isInteger(target?.selectionEnd) ? target.selectionEnd : 0;

    if (!value || end <= start) {
      triggerSnippetAnalysis({ snippet: '', lineStart: null, lineEnd: null, shouldAnalyze: false });
      return;
    }

    const selectedSnippet = value.slice(start, end).trim();
    const lineStart = getLineNumberFromOffset(value, start);
    const lineEnd = getLineNumberFromOffset(value, end);

    triggerSnippetAnalysis({
      snippet: selectedSnippet,
      lineStart,
      lineEnd,
      shouldAnalyze: isAutoSnippetAnalyze,
    });
  };

  const getRangeOffsetsFromCodeElement = (codeElement, selectionRange) => {
    if (!codeElement || !selectionRange) return null;

    const preRange = selectionRange.cloneRange();
    preRange.selectNodeContents(codeElement);
    preRange.setEnd(selectionRange.startContainer, selectionRange.startOffset);

    const selectionText = selectionRange.toString();
    const start = preRange.toString().length;
    const end = start + selectionText.length;

    return {
      start,
      end,
      text: selectionText,
    };
  };

  const handleViewerSelection = () => {
    const selection = window.getSelection();
    const codeContainer = viewerCodeRef.current;
    if (!selection || !codeContainer || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (!codeContainer.contains(range.commonAncestorContainer)) {
      return;
    }

    const codeElement = codeContainer.querySelector('code');
    const rawContent = String(fileState.data?.content || '');
    const rangeOffsets = getRangeOffsetsFromCodeElement(codeElement, range);

    if (!rangeOffsets || rangeOffsets.end <= rangeOffsets.start) {
      triggerSnippetAnalysis({ snippet: '', lineStart: null, lineEnd: null, shouldAnalyze: false });
      return;
    }

    const selectedSnippet = rawContent.slice(rangeOffsets.start, rangeOffsets.end).trim();
    const lineStart = getLineNumberFromOffset(rawContent, rangeOffsets.start);
    const lineEnd = getLineNumberFromOffset(rawContent, rangeOffsets.end);

    triggerSnippetAnalysis({
      snippet: selectedSnippet,
      lineStart,
      lineEnd,
      shouldAnalyze: isAutoSnippetAnalyze,
    });
  };

  const handleManualSnippetAnalyze = () => {
    if (!snippetState.selectedSnippet) return;

    triggerSnippetAnalysis({
      snippet: snippetState.selectedSnippet,
      lineStart: snippetState.lineStart,
      lineEnd: snippetState.lineEnd,
      shouldAnalyze: true,
    });
  };

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
                      onSelect={handleTextareaSelection}
                      onKeyUp={handleTextareaSelection}
                      onMouseUp={handleTextareaSelection}
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
                      onMouseUp={handleViewerSelection}
                      onKeyUp={handleViewerSelection}
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

              <div className="mt-4 rounded-xl border border-border/50 bg-background/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                    Snippet Analysis
                  </p>
                  <div className="flex items-center gap-2">
                    {snippetState.lineStart && snippetState.lineEnd && (
                      <p className="text-[10px] text-muted-foreground">
                        Lines {snippetState.lineStart}-{snippetState.lineEnd}
                      </p>
                    )}
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => setIsAutoSnippetAnalyze((prev) => !prev)}
                      className="h-7 rounded-lg px-2 text-[10px] shadow-neu-inset border-none bg-background/60"
                    >
                      {isAutoSnippetAnalyze ? 'Auto Analyze: ON' : 'Auto Analyze: OFF'}
                    </Button>
                    {!isAutoSnippetAnalyze && (
                      <Button
                        size="sm"
                        type="button"
                        onClick={handleManualSnippetAnalyze}
                        disabled={!snippetState.selectedSnippet || snippetState.status === 'loading'}
                        className="h-7 rounded-lg px-2 text-[10px]"
                      >
                        {snippetState.status === 'loading' ? 'Analyzing...' : 'Analyze Snippet'}
                      </Button>
                    )}
                  </div>
                </div>

                {!snippetState.selectedSnippet && (
                  <p className="text-xs text-muted-foreground">
                    Select a code snippet to analyze its purpose and impact across related files.
                    {!isAutoSnippetAnalyze && ' Then click Analyze Snippet.'}
                  </p>
                )}

                {snippetState.selectedSnippet && (
                  <pre className="mb-3 max-h-44 overflow-auto rounded-lg border border-border/60 bg-background/80 px-2 py-2 font-mono text-[11px] leading-5 text-foreground/90 custom-scrollbar">
                    {snippetState.selectedSnippet}
                  </pre>
                )}

                {snippetState.status === 'loading' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Analyzing snippet impact...
                  </div>
                )}

                {snippetState.status === 'failed' && snippetState.error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5" />
                    <span>{snippetState.error}</span>
                  </div>
                )}

                {snippetState.status === 'succeeded' && snippetState.data && (
                  <div className="space-y-3 text-xs">
                    {snippetState.data.whatItDoes && (
                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                          What It Does
                        </p>
                        <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {snippetState.data.whatItDoes}
                        </p>
                      </div>
                    )}

                    {snippetState.data.fileImpact && (
                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                          File Impact
                        </p>
                        <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {snippetState.data.fileImpact}
                        </p>
                      </div>
                    )}

                    {snippetState.data.codebaseImpact && (
                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                          Codebase Impact
                        </p>
                        <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {snippetState.data.codebaseImpact}
                        </p>
                      </div>
                    )}

                    <div className="rounded-lg border border-border/60 bg-background/70 px-2 py-2 text-[11px] text-muted-foreground">
                      Confidence: {snippetState.data.confidence || 'unknown'}
                      {typeof snippetState.data.confidenceScore === 'number' && (
                        <span>
                          {' '}
                          ({snippetState.data.confidenceScore.toFixed(2)})
                        </span>
                      )}
                      {snippetState.data.rerunTriggered && (
                        <span> · Re-run triggered due to low confidence</span>
                      )}
                    </div>

                    {Array.isArray(snippetState.data.directlyImpactedFiles) &&
                      snippetState.data.directlyImpactedFiles.length > 0 && (
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                            Directly Impacted Files ({snippetState.data.directlyImpactedFiles.length})
                          </p>
                          <ul className="space-y-1">
                            {snippetState.data.directlyImpactedFiles.map((file) => (
                              <li key={`direct-${file}`} className="font-mono text-foreground/90 break-all">
                                {file}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {Array.isArray(snippetState.data.transitivelyImpactedFiles) &&
                      snippetState.data.transitivelyImpactedFiles.length > 0 && (
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                            Transitively Impacted Files ({snippetState.data.transitivelyImpactedFiles.length})
                          </p>
                          <ul className="space-y-1">
                            {snippetState.data.transitivelyImpactedFiles.map((file) => (
                              <li key={`transitive-${file}`} className="font-mono text-foreground/90 break-all">
                                {file}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                )}
              </div>
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
