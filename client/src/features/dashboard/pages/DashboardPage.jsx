import React from 'react';
import { Link } from 'react-router-dom';
import {
  Network,
  GitBranch,
  Zap,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useAuth } from '@/features/auth/context/AuthContext';

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

export default function DashboardPage() {
  const { user } = useAuth();
  const displayName = user?.username || user?.email?.split('@')[0] || 'there';

  return (
    <div className="space-y-8">
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
                <ul className="space-y-1.5">
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
