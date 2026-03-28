import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Network,
  GitBranch,
  Zap,
  ArrowRight,
  Terminal,
  Database,
  RefreshCw,
  Clock3,
  FolderGit2,
  Search,
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
  selectAnalyzedRepositories,
  selectDashboardError,
  selectDashboardStatus,
  selectDashboardSummary,
} from '../index';

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

const formatDate = (value) => {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

function MetricCard({ icon, title, value, helper }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-md border border-border bg-muted">
            {icon}
          </span>
          <span>{title}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
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
  const dispatch = useDispatch();
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState('recent');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const status = useSelector(selectDashboardStatus);
  const error = useSelector(selectDashboardError);
  const repositories = useSelector(selectAnalyzedRepositories);
  const summary = useSelector(selectDashboardSummary);

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

  const refreshHistory = () => {
    if (!user?.id) return;
    dispatch(fetchAnalyzedRepositories({ userId: user.id, page: 1, limit: 50 }));
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {displayName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CodeGraph AI · Phase 1 — Parsing &amp; Graph Visualization
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Quick actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action) => (
            <Card key={action.title} className="group hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
                    {action.icon}
                  </div>
                  <CardTitle className="text-base">{action.title}</CardTitle>
                </div>
                <CardDescription>{action.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={action.href}>
                  <Button size="sm" className="gap-1.5 w-full sm:w-auto">
                    {action.cta}
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}

          <Card className="border-dashed bg-muted/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
                  <Terminal className="size-5 text-muted-foreground" />
                </div>
                <CardTitle className="text-base text-muted-foreground">
                  Server must be running
                </CardTitle>
              </div>
              <CardDescription>
                Start the backend before analyzing:{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  cd server &amp;&amp; npm run dev
                </code>
              </CardDescription>
            </CardHeader>
          </Card>
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((item) => (
            <MetricCard
              key={item.key}
              icon={item.icon}
              title={item.title}
              value={item.value}
              helper={item.helper}
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
                  The dashboard is wired to read analysis history from
                  <span className="font-mono"> GET /api/analyze/history </span>
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
              {visibleRepositories.map((repo) => (
                <Card key={repo.id}>
                  <CardContent className="flex flex-col gap-3 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          {repo.fullName || `${repo.owner}/${repo.name}`}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Source: {repo.source} · Branch: {repo.branch || 'unknown'}
                        </p>
                      </div>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {repo.status}
                      </span>
                    </div>

                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                      <p>
                        <span className="font-medium text-foreground">Analyzed:</span>{' '}
                        {formatDate(repo.analyzedAt)}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Nodes:</span>{' '}
                        {repo.nodeCount ?? '-'}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Edges:</span>{' '}
                        {repo.edgeCount ?? '-'}
                      </p>
                      <p className="truncate" title={repo.commitSha || ''}>
                        <span className="font-medium text-foreground">Commit:</span>{' '}
                        {repo.commitSha ? repo.commitSha.slice(0, 12) : '-'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Roadmap
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PHASE_ROADMAP.map(({ phase, label, status, items }) => (
            <Card key={phase}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{phase}</CardTitle>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status]}`}
                  >
                    {label}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1.5">
                  {items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      {status === 'active' ? (
                        <GitBranch className="size-3.5 text-green-400 shrink-0" />
                      ) : (
                        <Zap className="size-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                      {item}
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
