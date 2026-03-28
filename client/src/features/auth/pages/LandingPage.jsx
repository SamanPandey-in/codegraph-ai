import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GitBranch, Network, Zap, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const FEATURES = [
  {
    icon: <GitBranch className="size-5 text-primary" />,
    title: 'AST Parsing',
    description: 'Deep static analysis of your JS/TS codebase using Babel parser.',
  },
  {
    icon: <Network className="size-5 text-primary" />,
    title: 'Dependency Graph',
    description: 'Interactive visual graph of every import relationship.',
  },
  {
    icon: <Zap className="size-5 text-primary" />,
    title: 'AI-Ready',
    description: 'Built for Phase 2 AI features — impact analysis, dead code, Q&A.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Code2 className="size-5 text-primary" />
            <span className="font-bold text-sm tracking-tight">
              CodeGraph<span className="text-primary">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-4 py-24 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
          Phase 1 — Parsing &amp; Graph Visualization
        </div>

        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Understand any{' '}
          <span className="text-primary">codebase</span>
          <br />
          in seconds
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
          Point CodeGraph AI at any local repository. It parses every import,
          builds a live dependency graph, and gives you a visual map you can
          actually navigate.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link to="/signup">
            <Button size="lg" className="gap-2">
              Start for free <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid w-full gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="text-left">
              <CardContent className="pt-6">
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} CodeGraph AI · Phase 1 Build
      </footer>
    </div>
  );
}
