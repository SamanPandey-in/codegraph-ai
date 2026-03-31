import React, { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  FileCode2,
  Folder,
  FolderTree,
  GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchDirectoryContents,
  fetchRepositoryStructure,
  selectAnalyzeContents,
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

export default function AnalyzePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedRepository = useSelector(selectAnalyzeSelectedRepository);
  const structure = useSelector(selectAnalyzeStructure);
  const contents = useSelector(selectAnalyzeContents);

  const routeDirectory = useMemo(() => {
    const raw = params.dir_name ? decodeURIComponent(params.dir_name) : '';
    return raw.trim();
  }, [params.dir_name]);

  const currentPath = useMemo(() => {
    const queryPath = String(searchParams.get('path') || '').trim();
    if (queryPath) return queryPath;
    return routeDirectory;
  }, [routeDirectory, searchParams]);

  const isFirstAnalyzePage = !routeDirectory;

  useEffect(() => {
    dispatch(fetchRepositoryStructure());
  }, [dispatch]);

  useEffect(() => {
    if (!routeDirectory) return;
    dispatch(fetchDirectoryContents({ path: currentPath }));
  }, [currentPath, dispatch, routeDirectory]);

  const showLocalSourceMessage = selectedRepository?.source === 'local';

  const handleCardOpen = (directoryPath) => {
    const encoded = encodeURIComponent(directoryPath);
    navigate(`/analyze/${encoded}`);
  };

  const openDirectory = (entryPath) => {
    setSearchParams({ path: entryPath });
  };

  const openFile = (entryPath) => {
    const encodedDir = encodeURIComponent(routeDirectory);
    const nextSearch = new URLSearchParams();
    nextSearch.set('path', currentPath);
    nextSearch.set('file', entryPath);
    navigate(`/analyze/${encodedDir}/file?${nextSearch.toString()}`);
  };

  const pathSegments = currentPath ? currentPath.split('/').filter(Boolean) : [];

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

      <header className="rounded-2xl shadow-neu-inset border-none bg-background/40 px-5 py-6">
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
          {isFirstAnalyzePage && 'Analyze Repository Structure'}
        </h1>
        {isFirstAnalyzePage && (
          <p className="mt-2 text-sm text-muted-foreground/80 font-medium">
            Top-level directories from the selected GitHub repository.
          </p>
        )}

        {!isFirstAnalyzePage && structure.repository?.fullName && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-xl shadow-neu-inset border-none bg-background/60 px-3 py-1.5 font-bold tracking-tight">
              {structure.repository.fullName}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl shadow-neu-inset border-none bg-background/60 px-3 py-1.5 font-bold tracking-tight">
              <GitBranch className="size-3.5 text-primary" />
              {structure.repository.branch || structure.repository.defaultBranch || 'default'}
            </span>
            {structure.repository.htmlUrl && (
              <a
                href={structure.repository.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground active-scale transition-all"
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
                className="group rounded-2xl shadow-neu-inset border-none bg-background/40 p-5 text-left transition-all hover:bg-background/60 active-scale duration-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-lg font-display font-bold tracking-tight text-foreground">
                      <FolderTree className="size-4 text-primary group-hover:scale-110 transition-transform" />
                      {directory.name}
                    </p>
                    <p className="mt-1 text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60">{formatCount(directory.fileCount)} | EXPLORE</p>
                  </div>
                </div>

                <div className="mt-4 min-h-16 rounded-xl shadow-neu-inset border-none bg-background/30 p-3">
                {directory.subdirectories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No nested directories</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {directory.subdirectories.slice(0, 8).map((subDir) => (
                      <span
                        key={`${directory.path}-${subDir}`}
                        className="rounded-lg shadow-neu-inset border-none bg-background/50 px-2 py-1 text-[10px] font-bold tracking-tight text-muted-foreground/80"
                      >
                        {subDir}
                      </span>
                    ))}
                    {directory.subdirectories.length > 8 && (
                      <span className="rounded-lg shadow-neu-inset border-none bg-background/50 px-2 py-1 text-[10px] font-bold tracking-tight text-muted-foreground/50">
                        +{directory.subdirectories.length - 8}
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
        <div className="mt-6 rounded-2xl shadow-neu-inset border-none bg-background/40">
          <div className="border-b border-border/10 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Repository explorer</p>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground active-scale transition-all"
                onClick={() => navigate('/analyze')}
              >
                root
              </button>
              {pathSegments.map((segment, index) => {
                const nextPath = pathSegments.slice(0, index + 1).join('/');
                return (
                  <React.Fragment key={nextPath}>
                    <span className="text-muted-foreground/40">/</span>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 hover:bg-muted/40 active-scale transition-all"
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
              <div className="overflow-hidden rounded-xl shadow-neu-inset border-none bg-background/30">
                {contents.entries.map((entry) => {
                  const isDirectory = entry.type === 'dir';

                  return (
                    <div
                      key={entry.path}
                      className="flex items-center justify-between gap-3 border-b border-border/10 px-4 py-2.5 text-sm last:border-b-0 hover:bg-background/20 transition-colors"
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
