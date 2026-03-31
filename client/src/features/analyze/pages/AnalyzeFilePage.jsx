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

  const syncEditorScroll = () => {
    if (!editorGutterRef.current || !editorTextareaRef.current) return;
    editorGutterRef.current.scrollTop = editorTextareaRef.current.scrollTop;
  };

  const syncViewerScroll = () => {
    if (!viewerGutterRef.current || !viewerCodeRef.current) return;
    viewerGutterRef.current.scrollTop = viewerCodeRef.current.scrollTop;
  };

  const backToExplorer = `/analyze/${encodeURIComponent(routeDirectory)}?path=${encodeURIComponent(currentPath)}`;

  return (
    <section className="mx-auto w-full max-w-375 px-4 pb-10 pt-7">
      <div className="mb-5">
        <Link
          to={backToExplorer}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to Explorer
        </Link>
      </div>

      <header className="rounded-2xl border border-border/60 bg-card/70 px-5 py-6">
        {structure.repository?.fullName && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-md border border-border/60 bg-background/60 px-2.5 py-1 font-semibold">
              {structure.repository.fullName}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 font-semibold">
              <GitBranch className="size-3.5" />
              {structure.repository.branch || structure.repository.defaultBranch || 'default'}
            </span>
            {fileState.data?.htmlUrl && (
              <a
                href={fileState.data.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
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
        <div className="mt-6 rounded-2xl border border-border/60 bg-card/80">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File</p>
              <p className="truncate text-sm font-medium">{selectedFilePath}</p>
            </div>

            <div className="flex items-center gap-2">
              {!isEditing ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  disabled={!fileState.canEdit || fileState.status === 'loading'}
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
                  >
                    <X className="size-3.5" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveFile}
                    disabled={!hasUnsavedChanges || fileState.saveStatus === 'loading'}
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
            <div className="p-3">
              {isEditing ? (
                <div className="flex h-96 overflow-hidden rounded-xl border border-border/60 bg-background/90">
                  <pre
                    ref={editorGutterRef}
                    aria-hidden="true"
                    className="w-14 shrink-0 overflow-hidden border-r border-border/60 bg-muted/50 px-2 py-3 text-right font-mono text-xs leading-5 text-muted-foreground"
                  >
                    {Array.from({ length: editorLineCount }, (_, i) => i + 1).join('\n')}
                  </pre>
                  <textarea
                    ref={editorTextareaRef}
                    value={editorValue}
                    onChange={(e) => setEditorValue(e.target.value)}
                    onScroll={syncEditorScroll}
                    spellCheck={false}
                    className="h-full w-full resize-none bg-transparent px-3 py-3 font-mono text-xs leading-5 outline-none"
                  />
                </div>
              ) : (
                <div className="flex h-96 overflow-hidden rounded-xl border border-border/60 bg-background/90">
                  <pre
                    ref={viewerGutterRef}
                    aria-hidden="true"
                    className="w-14 shrink-0 overflow-hidden border-r border-border/60 bg-muted/50 px-2 py-3 text-right font-mono text-xs leading-5 text-muted-foreground"
                  >
                    {Array.from({ length: viewerLineCount }, (_, i) => i + 1).join('\n')}
                  </pre>
                  <pre
                    ref={viewerCodeRef}
                    onScroll={syncViewerScroll}
                    className="h-full w-full overflow-auto px-3 py-3 font-mono text-xs leading-5"
                  >
                    <code
                      className={`language-${codeLanguage}`}
                      dangerouslySetInnerHTML={{ __html: highlightedContent }}
                    />
                  </pre>
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
      )}
    </section>
  );
}
