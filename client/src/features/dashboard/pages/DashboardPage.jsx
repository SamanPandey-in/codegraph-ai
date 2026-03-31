import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Network,
  GitBranch,
  Zap,
  ArrowRight,
  Database,
  RefreshCw,
  Clock3,
  FolderGit2,
  Search, History,
  ChevronDown,
  ChevronUp,
  Loader2,
  Star,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  fetchAnalyzedRepositories,
  fetchRepositoryJobs,
  toggleRepositoryStar,
  selectAnalyzedRepositories,
  selectDashboardError,
  selectRepositoryJobsById,
  selectDashboardStatus,
  selectDashboardSummary,
} from '../index';
import { analyzeCodebase } from '@/features/graph/slices/graphSlice';

const QUICK_ACTIONS = [
  {
    icon: <Network className="size-5 text-primary" />,
    title: 'Analyze a repository',
    description: 'Parse a local project and render its dependency graph.',
    href: '/analyze',
    cta: 'Start analysis',
  },
];

const PHASE_ROADMAP = [
  {
    phase: 'Phase 1',
    label: 'Current',
    status: 'active',
    items: ['AST parsing (JS/TS)', 'Dependency graph', 'Interactive visualization'],
  },
  {
    phase: 'Phase 2',
    label: 'Upcoming',
    status: 'upcoming',
    items: ['AI code summaries', 'Natural language Q&A', 'Dead code detection'],
  },
  {
    phase: 'Phase 3',
    label: 'Future',
    status: 'future',
    items: ['Impact analysis', 'Refactor suggestions', 'GitHub PR integration'],
  },
];

const STATUS_STYLES = {
  active:   'bg-green-500/20 text-green-400 border-green-500/30',
  upcoming: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  future:   'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'biggest', label: 'Biggest repo first' },
  { value: 'smallest', label: 'Smallest repo first' },
];

const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All analyzed repos' },
  { value: 'github-owned', label: 'My GitHub fetched repos' },
  { value: 'github-public', label: 'Public repos analyzed' },
  { value: 'local', label: 'Local repos analyzed' },
];

const DEFAULT_SORT = 'recent';
const DEFAULT_SOURCE_FILTER = 'all';

const parseSortFromQuery = (value) => {
  return SORT_OPTIONS.some((option) => option.value === value)
    ? value
    : DEFAULT_SORT;
};

const parseSourceFromQuery = (value) => {
  return SOURCE_FILTER_OPTIONS.some((option) => option.value === value)
    ? value
    : DEFAULT_SOURCE_FILTER;
};

const formatDate = (value) => {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

function MetricCard({ icon, title, value, helper, index = 0 }) {
  return (
    <Card 
      className="shadow-neu-inset border-none bg-background/60 rounded-2xl animate-in fade-in zoom-in-95 duration-700 fill-mode-both"
      style={{ animationDelay: `${200 + index * 100}ms` }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 text-xs uppercase tracking-widest font-bold text-muted-foreground/70">
          <div className="flex size-9 items-center justify-center rounded-xl bg-background shadow-sm border border-border/20">
            {icon}
          </div>
          <span>{title}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-3xl font-display font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-2 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/50">{helper}</p>
      </CardContent>
    </Card>
  );
}

function RepositoryListSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={`repo-skeleton-${index}`} className="border-dashed">
          <CardContent className="py-4">
            <div className="flex flex-col gap-2">
              <div className="h-4 w-56 rounded bg-muted" />
              <div className="h-3 w-40 rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState(() =>
    parseSortFromQuery(searchParams.get('sort')),
  );
  const [sourceFilter, setSourceFilter] = useState(() =>
    parseSourceFromQuery(searchParams.get('source')),
  );
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') || '');
  const [expandedRepos, setExpandedRepos] = useState({});
  const [starringRepoId, setStarringRepoId] = useState(null);
  const [reanalyzingRepoId, setReanalyzingRepoId] = useState(null);

  const status = useSelector(selectDashboardStatus);
  const error = useSelector(selectDashboardError);
  const repositories = useSelector(selectAnalyzedRepositories);
  const summary = useSelector(selectDashboardSummary);
  const repositoryJobsById = useSelector(selectRepositoryJobsById);

  const displayName = user?.username || user?.email?.split('@')[0] || 'there';

  useEffect(() => {
    if (!user?.id) return;

    dispatch(
      fetchAnalyzedRepositories({
        userId: user.id,
        page: 1,
        limit: 50,
      }),
    );
  }, [dispatch, user?.id]);

  useEffect(() => {
    const nextParams = new URLSearchParams();

    if (sortBy !== DEFAULT_SORT) {
      nextParams.set('sort', sortBy);
    }

    if (sourceFilter !== DEFAULT_SOURCE_FILTER) {
      nextParams.set('source', sourceFilter);
    }

    const trimmed = searchTerm.trim();
    if (trimmed) {
      nextParams.set('q', trimmed);
    }

    setSearchParams(nextParams, { replace: true });
  }, [searchTerm, setSearchParams, sortBy, sourceFilter]);

  const stats = useMemo(
    () => [
      {
        key: 'total',
        icon: <Database className="size-4 text-primary" />,
        title: 'Analyzed repositories',
        value: summary.totalAnalyzed,
        helper: 'Stored for this user in the analysis history table.',
      },
      {
        key: 'owners',
        icon: <FolderGit2 className="size-4 text-primary" />,
        title: 'Unique owners',
        value: summary.uniqueOwners,
        helper: 'Distinct repository owners represented in history.',
      },
      {
        key: 'last',
        icon: <Clock3 className="size-4 text-primary" />,
        title: 'Last analyzed',
        value: summary.lastAnalyzedAt ? formatDate(summary.lastAnalyzedAt) : 'No analyses yet',
        helper: 'Most recent analysis timestamp returned by the backend.',
      },
    ],
    [summary.lastAnalyzedAt, summary.totalAnalyzed, summary.uniqueOwners],
  );

  const isLoadingFirstTime = status === 'loading' && repositories.length === 0;
  const isRefreshing = status === 'loading' && repositories.length > 0;
  const backendNotReady = error?.code === 'NOT_READY';

  const visibleRepositories = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const getAnalysisTime = (repo) => {
      const timestamp = repo.analyzedAt ? new Date(repo.analyzedAt).getTime() : NaN;
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    const getRepoSize = (repo) => {
      if (Number.isFinite(repo.nodeCount)) return repo.nodeCount;
      if (Number.isFinite(repo.edgeCount)) return repo.edgeCount;
      return 0;
    };

    const filtered = repositories.filter((repo) => {
      if (sourceFilter !== 'all' && repo.sourceCategory !== sourceFilter) return false;

      if (!query) return true;

      const target = `${repo.fullName || ''} ${repo.name || ''}`.toLowerCase();
      return target.includes(query);
    });

    return filtered.toSorted((a, b) => {
      if (a.isStarred !== b.isStarred) {
        return a.isStarred ? -1 : 1;
      }

      if (sortBy === 'oldest') {
        return getAnalysisTime(a) - getAnalysisTime(b);
      }

      if (sortBy === 'biggest') {
        const bySize = getRepoSize(b) - getRepoSize(a);
        return bySize !== 0 ? bySize : getAnalysisTime(b) - getAnalysisTime(a);
      }

      if (sortBy === 'smallest') {
        const bySize = getRepoSize(a) - getRepoSize(b);
        return bySize !== 0 ? bySize : getAnalysisTime(b) - getAnalysisTime(a);
      }

      // Default order: most recently analyzed repositories first.
      return getAnalysisTime(b) - getAnalysisTime(a);
    });
  }, [repositories, searchTerm, sortBy, sourceFilter]);

  const hasActiveFilters =
    sortBy !== DEFAULT_SORT ||
    sourceFilter !== DEFAULT_SOURCE_FILTER ||
    searchTerm.trim().length > 0;

  const refreshHistory = () => {
    if (!user?.id) return;
    dispatch(fetchAnalyzedRepositories({ userId: user.id, page: 1, limit: 50 }));
  };

  const clearFilters = () => {
    setSortBy(DEFAULT_SORT);
    setSourceFilter(DEFAULT_SOURCE_FILTER);
    setSearchTerm('');
  };

  const getGraphLink = (repo) => {
    if (!repo?.jobId) return null;

    return {
      to: `/graph?jobId=${encodeURIComponent(repo.jobId)}`,
      state: {
        jobId: repo.jobId,
        rootDir: repo.fullName || `${repo.owner}/${repo.name}`,
        fileCount: repo.nodeCount,
        analyzedAt: repo.analyzedAt,
      },
    };
  };

  const toggleJobs = (repoId) => {
    setExpandedRepos((prev) => {
      const next = { ...prev, [repoId]: !prev[repoId] };
      return next;
    });

    const jobsState = repositoryJobsById[repoId];
    if (!jobsState || (jobsState.status !== 'loading' && jobsState.status !== 'succeeded')) {
      dispatch(fetchRepositoryJobs({ repositoryId: repoId, page: 1, limit: 20 }));
    }
  };

  const getJobGraphLink = (repo, job) => {
    if (!job?.id || job?.status !== 'completed') return null;

    return {
      to: `/graph?jobId=${encodeURIComponent(job.id)}`,
      state: {
        jobId: job.id,
        rootDir: repo.fullName || `${repo.owner}/${repo.name}`,
        fileCount: job.nodeCount,
        analyzedAt: job.completedAt || job.createdAt,
      },
    };
  };

  const handleToggleStar = async (repoId, e) => {
    e?.preventDefault();
    setStarringRepoId(repoId);
    try {
      await dispatch(toggleRepositoryStar({ repositoryId: repoId })).unwrap();
    } catch (error) {
      console.error('Failed to toggle star:', error);
    } finally {
      setStarringRepoId(null);
    }
  };

  const handleReanalyze = (repo, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setReanalyzingRepoId(repo.id);

    const config =
      repo.source === 'local'
        ? {
            source: 'local',
            localPath: repo.fullName,
          }
        : {
            source: 'github',
            github: {
              mode:
                repo.githubMode ||
                (repo.sourceCategory === 'github-public' ? 'public' : 'owned'),
              owner: repo.owner,
              repo: repo.name,
              branch: repo.branch || 'main',
            },
          };

    dispatch(analyzeCodebase(config));
    navigate('/graph');
    setReanalyzingRepoId(null);
  };

  return (
    <div className="flex flex-col gap-10 py-6">
      <div className="animate-in fade-in slide-in-from-top-4 duration-700">
        <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
          Welcome back, <span className="text-gold">{displayName}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/80 font-medium tracking-wide">
          CodeGraph <span className="text-gold">AI</span> · Phase 1 Visualization Engine
        </p>
      </div>

      <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
        <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 opacity-70">
          Quick actions
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action, idx) => (
            <Card 
              key={action.title} 
              className="group rounded-2xl shadow-neu-inset border-none bg-background/40 hover:bg-background/60 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
              style={{ animationDelay: `${300 + idx * 100}ms` }}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-gold/10 shadow-sm border border-gold/20 group-hover:scale-110 transition-transform duration-300">
                    {action.icon}
                  </div>
                  <CardTitle className="text-base font-display font-bold tracking-tight">{action.title}</CardTitle>
                </div>
                <CardDescription className="text-xs leading-relaxed opacity-70 mt-1">{action.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={action.href}>
                  <Button size="sm" className="gap-2 w-full sm:w-auto bg-gold text-white hover:bg-gold/90 shadow-md rounded-xl font-bold tracking-wide transition-all group-hover:-translate-y-0.5">
                    {action.cta}
                    <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Analyzed repositories
          </h2>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refreshHistory}
            disabled={status === 'loading'}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh history
          </Button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((item, idx) => (
            <MetricCard
              key={item.key}
              icon={item.icon}
              title={item.title}
              value={item.value}
              helper={item.helper}
              index={idx}
            />
          ))}
        </div>

        <div className="mt-4">
          <Card className="mb-4">
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="relative lg:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by repository name"
                    className="pl-9"
                  />
                </div>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger aria-label="Sort analyzed repositories" className="w-full">
                    <SelectValue placeholder="Select sorting" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger aria-label="Filter analyzed repositories by source" className="w-full">
                    <SelectValue placeholder="Select source filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {SOURCE_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground">
                Showing {visibleRepositories.length} of {repositories.length} analyzed repositories.
              </p>

              {hasActiveFilters ? (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-7 px-2 text-xs"
                  >
                    Clear filters
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {isLoadingFirstTime ? (
            <RepositoryListSkeleton />
          ) : null}

          {!isLoadingFirstTime && backendNotReady ? (
            <Card className="border-dashed bg-muted/30">
              <CardHeader>
                <CardTitle className="text-base">Database history integration pending</CardTitle>
                <CardDescription>
                  The dashboard is wired to read repositories and job history from
                  <span className="font-mono"> GET /api/repositories </span>
                  and
                  <span className="font-mono"> GET /api/repositories/:id/jobs </span>
                  once that endpoint is connected to your database.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {!isLoadingFirstTime && !backendNotReady && error?.message ? (
            <Card className="border-destructive/40 bg-destructive/10">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Could not load repository history</CardTitle>
                <CardDescription className="text-destructive/90">{error.message}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {!isLoadingFirstTime && !error?.message && repositories.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No repositories analyzed yet</CardTitle>
                <CardDescription>
                  Once the user runs an analysis, this section will list each analyzed repository
                  from database-backed history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/analyze">
                  <Button size="sm" className="gap-1.5">
                    Analyze a repository
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : null}

          {!isLoadingFirstTime && !error?.message && repositories.length > 0 && visibleRepositories.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No repositories match your filters</CardTitle>
                <CardDescription>
                  Try clearing the search term or changing the source and sorting options.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {!isLoadingFirstTime && !error?.message && visibleRepositories.length > 0 ? (
            <div className="grid gap-3">
              {visibleRepositories.map((repo) => {
                const graphLink = getGraphLink(repo);

                return (
                  <Card
                    key={repo.id}
                    className="rounded-2xl shadow-neu-inset border-none bg-background/40 transition-all duration-300 animate-in fade-in slide-in-from-right-4 fill-mode-both"
                    style={{ animationDelay: `${400 + repositories.indexOf(repo) * 50}ms` }}
                  >
                    <CardContent className="flex flex-col gap-4 py-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          {graphLink ? (
                            <Link
                              to={graphLink.to}
                              state={graphLink.state}
                              className="text-left text-base font-display font-bold text-foreground hover:text-gold transition-colors cursor-pointer tracking-tight"
                            >
                              {repo.fullName || `${repo.owner}/${repo.name}`}
                            </Link>
                          ) : (
                            <span className="text-left text-base font-display font-bold text-foreground/70 tracking-tight">
                              {repo.fullName || `${repo.owner}/${repo.name}`}
                            </span>
                          )}
                          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60">
                            {repo.source} <span className="mx-1 opacity-30">|</span> {repo.branch || 'unknown'}
                          </p>
                        </div>
                        <span className="rounded-xl border border-border/20 bg-background/50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground shadow-sm">
                          {repo.status}
                        </span>
                      </div>

                      <div className="grid gap-4 text-[11px] text-muted-foreground/80 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-border/10">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase font-bold tracking-tighter opacity-40">Analyzed</span>
                          <span className="font-semibold text-foreground/70">{formatDate(repo.analyzedAt)}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase font-bold tracking-tighter opacity-40">Nodes</span>
                          <span className="font-semibold text-foreground/70">{repo.nodeCount ?? '-'}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase font-bold tracking-tighter opacity-40">Edges</span>
                          <span className="font-semibold text-foreground/70">{repo.edgeCount ?? '-'}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase font-bold tracking-tighter opacity-40">Scans</span>
                          <span className="font-semibold text-foreground/70">{repo.scanCount ?? 0}</span>
                        </div>
                      </div>

                      <div className="grid gap-2 border-t border-border/10 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase font-bold tracking-tighter opacity-40">Last scanned</span>
                          <span className="font-semibold text-foreground/70">{formatDate(repo.lastScannedAt || repo.analyzedAt)}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase font-bold tracking-tighter opacity-40">Confidence</span>
                          <span className="font-semibold text-foreground/70">{repo.latestConfidence ?? '-'}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase font-bold tracking-tighter opacity-40">Latest job</span>
                          <span className="font-semibold text-foreground/70 truncate" title={repo.latestJobId || ''}>
                            {repo.latestJobId ? repo.latestJobId.slice(0, 12) : '-'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleToggleStar(repo.id, e)}
                          disabled={starringRepoId === repo.id}
                          className="gap-1.5"
                          title={repo.isStarred ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star
                            className={`size-3.5 ${
                              repo.isStarred
                                ? 'fill-gold text-gold'
                                : 'text-muted-foreground'
                            } transition-all`}
                          />
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleReanalyze(repo, e)}
                          disabled={reanalyzingRepoId === repo.id}
                          className="gap-1.5"
                        >
                          <RotateCcw className={`size-3.5 ${reanalyzingRepoId === repo.id ? 'animate-spin' : ''}`} />
                          Re-analyze
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleJobs(repo.id)}
                          className="gap-1.5"
                        >
                          <History className="size-3.5" />
                          Job history
                          {expandedRepos[repo.id] ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </Button>

                        {graphLink ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link to={graphLink.to} state={graphLink.state}>Open graph</Link>
                          </Button>
                        ) : null}
                      </div>

                      {expandedRepos[repo.id] ? (
                        <div className="rounded-xl border border-border/20 bg-background/50 p-3">
                          {repositoryJobsById[repo.id]?.status === 'loading' ? (
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              Loading job history...
                            </p>
                          ) : null}

                          {repositoryJobsById[repo.id]?.status === 'failed' ? (
                            <p className="text-xs text-destructive">
                              {repositoryJobsById[repo.id]?.error?.message || 'Failed to load repository jobs.'}
                            </p>
                          ) : null}

                          {repositoryJobsById[repo.id]?.status === 'succeeded' && (repositoryJobsById[repo.id]?.jobs || []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No jobs found for this repository yet.</p>
                          ) : null}

                          {repositoryJobsById[repo.id]?.status === 'succeeded' && (repositoryJobsById[repo.id]?.jobs || []).length > 0 ? (
                            <div className="grid gap-2">
                              {(repositoryJobsById[repo.id]?.jobs || []).map((job) => {
                                const jobGraphLink = getJobGraphLink(repo, job);

                                return (
                                  <div
                                    key={job.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/20 bg-background/60 px-3 py-2"
                                  >
                                    <div className="flex min-w-0 flex-col gap-0.5 text-[11px] text-muted-foreground">
                                      <span className="font-semibold text-foreground/80">
                                        {job.id.slice(0, 12)} • {job.status}
                                      </span>
                                      <span>
                                        {job.branch || repo.branch || 'unknown'} • {formatDate(job.completedAt || job.createdAt)} • nodes {job.nodeCount ?? '-'}
                                      </span>
                                    </div>

                                    {jobGraphLink ? (
                                      <Button size="sm" variant="outline" asChild>
                                        <Link to={jobGraphLink.to} state={jobGraphLink.state}>Open graph</Link>
                                      </Button>
                                    ) : (
                                      <Button type="button" size="sm" variant="outline" disabled>
                                        Not restorable
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Roadmap
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {PHASE_ROADMAP.map(({ phase, label, status, items }, idx) => (
            <Card 
              key={phase} 
              className="rounded-2xl shadow-neu-inset border-none bg-background/40 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
              style={{ animationDelay: `${500 + idx * 100}ms` }}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider opacity-60">{phase}</CardTitle>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${STATUS_STYLES[status]}`}
                  >
                    {label}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3">
                  {items.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-xs font-medium text-foreground/70 group/item">
                      {status === 'active' ? (
                        <div className="flex size-5 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20 shadow-sm">
                          <GitBranch className="size-2.5 text-green-500" />
                        </div>
                      ) : (
                        <div className="flex size-5 items-center justify-center rounded-full bg-muted/50 border border-border/20 shadow-sm">
                          <Zap className="size-2.5 text-muted-foreground/40" />
                        </div>
                      )}
                      <span className="group-hover/item:text-gold transition-colors">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
