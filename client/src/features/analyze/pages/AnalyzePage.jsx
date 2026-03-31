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
  FileCode2,
  FolderTree,
  Folder,
  GitBranch,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchDirectoryContents,
  fetchRepositoryFile,
  fetchRepositoryStructure,
  saveRepositoryFile,
  selectAnalyzeContents,
  selectAnalyzeFile,
  selectAnalyzeSelectedRepository,
  selectAnalyzeStructure,
} from '../slices/analyzeSlice';

function formatCount(count) {
  const safe = Number.isFinite(count) ? count : 0;
  return `${safe} file${safe === 1 ? '' : 's'}`;
}

function formatSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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

export default function AnalyzePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedRepository = useSelector(selectAnalyzeSelectedRepository);
  const structure = useSelector(selectAnalyzeStructure);
  const contents = useSelector(selectAnalyzeContents);
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
    if (!routeDirectory) return;
    dispatch(fetchDirectoryContents({ path: currentPath }));
  }, [currentPath, dispatch, routeDirectory]);

  useEffect(() => {
    if (!routeDirectory || !selectedFilePath) return;
    dispatch(fetchRepositoryFile({ path: selectedFilePath }));
  }, [dispatch, routeDirectory, selectedFilePath]);

  useEffect(() => {
    const fileContent = fileState.data?.content;
    if (typeof fileContent !== 'string') return;
    setEditorValue(fileContent);
    setIsEditing(false);
  }, [fileState.data?.content, fileState.data?.path]);

  const showLocalSourceMessage = selectedRepository?.source === 'local';

  const handleCardOpen = (directoryPath) => {
    const encoded = encodeURIComponent(directoryPath);
    navigate(`/analyze/${encoded}`);
  };

  const openDirectory = (entryPath) => {
    setSearchParams({ path: entryPath });
  };

  const openFile = (entryPath) => {
    setSearchParams({ path: currentPath, file: entryPath });
  };

  const pathSegments = currentPath ? currentPath.split('/').filter(Boolean) : [];

  const hasUnsavedChanges =
    typeof fileState.data?.content === 'string' &&
    editorValue !== fileState.data.content;

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

  return (
    <section className="mx-auto w-full max-w-375 px-4 pb-10 pt-7">
      <div className="mb-5">
        <Link
          to="/upload-repo"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to Upload
        </Link>
      </div>

      <header className="rounded-2xl border border-border/60 bg-card/70 px-5 py-6">
        <h1 className="text-3xl font-bold tracking-tight">Analyze Repository Structure</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Top-level directories from the selected GitHub repository.
        </p>

        {structure.repository?.fullName && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-md border border-border/60 bg-background/60 px-2.5 py-1 font-semibold">
              {structure.repository.fullName}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 font-semibold">
              <GitBranch className="size-3.5" />
              {structure.repository.branch || structure.repository.defaultBranch || 'default'}
            </span>
            {structure.repository.htmlUrl && (
              <a
                href={structure.repository.htmlUrl}
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

      {showLocalSourceMessage && (
        <div className="mt-5 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
          This view currently supports GitHub repositories. Select a GitHub repository from Upload Repo, then return to Analyze.
        </div>
      )}

      {!routeDirectory && structure.status === 'loading' && (
        <div className="mt-6 rounded-xl border border-border/60 bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
          Loading repository directories...
        </div>
      )}

      {!routeDirectory && structure.status === 'failed' && structure.error && (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {structure.error}
        </div>
      )}

      {!routeDirectory && structure.status === 'succeeded' && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {structure.directories.map((directory) => (
            <button
              key={directory.path}
              type="button"
              onClick={() => handleCardOpen(directory.path)}
              className="group rounded-2xl border border-border/60 bg-card/70 p-4 text-left transition-all hover:border-primary/40 hover:bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-lg font-bold tracking-tight">
                    <FolderTree className="size-4 text-primary" />
                    {directory.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatCount(directory.fileCount)} | click to explore</p>
                </div>
              </div>

              <div className="mt-3 min-h-16 rounded-xl border border-border/40 bg-background/50 p-3">
                {directory.subdirectories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No nested directories</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {directory.subdirectories.slice(0, 8).map((subDir) => (
                      <span
                        key={`${directory.path}-${subDir}`}
                        className="rounded-md border border-border/60 bg-card px-2 py-1 text-[11px] font-medium"
                      >
                        {subDir}
                      </span>
                    ))}
                    {directory.subdirectories.length > 8 && (
                      <span className="rounded-md border border-border/60 bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
                        +{directory.subdirectories.length - 8} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {routeDirectory && (
        <div className="mt-6 rounded-2xl border border-border/60 bg-card/80">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Repository explorer</p>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-sm">
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => navigate('/analyze')}
              >
                root
              </button>
              {pathSegments.map((segment, index) => {
                const nextPath = pathSegments.slice(0, index + 1).join('/');
                return (
                  <React.Fragment key={nextPath}>
                    <span className="text-muted-foreground">/</span>
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 hover:bg-muted"
                      onClick={() => setSearchParams({ path: nextPath })}
                    >
                      {segment}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="px-2 py-2">
            {contents.status === 'loading' && (
              <div className="px-3 py-6 text-sm text-muted-foreground">Loading directory contents...</div>
            )}

            {contents.status === 'failed' && contents.error && (
              <div className="mx-2 my-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {contents.error}
              </div>
            )}

            {contents.status === 'succeeded' && (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-background/70">
                {contents.entries.map((entry) => {
                  const isDirectory = entry.type === 'dir';

                  return (
                    <div
                      key={entry.path}
                      className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        {isDirectory ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 text-left font-medium hover:text-primary"
                            onClick={() => openDirectory(entry.path)}
                          >
                            <Folder className="size-4 text-primary" />
                            <span className="truncate">{entry.name}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 text-left hover:text-primary"
                            onClick={() => openFile(entry.path)}
                          >
                            <FileCode2 className="size-4 text-muted-foreground" />
                            <span className="truncate">{entry.name}</span>
                          </button>
                        )}
                      </div>

                      <span className="shrink-0 text-xs text-muted-foreground">
                        {isDirectory ? 'dir' : formatSize(entry.size)}
                      </span>
                    </div>
                  );
                })}

                {contents.entries.length === 0 && (
                  <div className="px-3 py-6 text-sm text-muted-foreground">No files found in this directory.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {routeDirectory && selectedFilePath && (
        <div className="mt-6 rounded-2xl border border-border/60 bg-card/80">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File editor</p>
              <p className="truncate text-sm font-medium">{selectedFilePath}</p>
            </div>

            <div className="flex items-center gap-2">
              {fileState.data?.htmlUrl && (
                <a
                  href={fileState.data.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View on GitHub
                  <ExternalLink className="size-3.5" />
                </a>
              )}

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

      {structure.truncated && (
        <div className="mt-4 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
          This repository tree is large and GitHub returned a truncated tree. Directory counts may be partial.
        </div>
      )}

      {!selectedRepository && structure.status !== 'loading' && (
        <div className="mt-6 rounded-xl border border-border/60 bg-card/60 px-4 py-4 text-sm text-muted-foreground">
          <p>No selected repository detected yet.</p>
          <div className="mt-3">
            <Link to="/upload-repo">
              <Button size="sm">Go to Upload Repo</Button>
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
