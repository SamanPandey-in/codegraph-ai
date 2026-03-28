import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Github, Code2, GitBranch, Network, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '../context/AuthContext';

const FEATURE_LIST = [
  {
    icon: <GitBranch className="size-4 text-primary" />,
    title: 'Code Analysis',
    description: 'Deep insights into your codebase structure',
  },
  {
    icon: <Network className="size-4 text-primary" />,
    title: 'Dependency Graphs',
    description: 'Visualize every import relationship interactively',
  },
  {
    icon: <Zap className="size-4 text-primary" />,
    title: 'AI-Ready',
    description: 'Smart impact analysis and dead-code detection coming in Phase 2',
  },
];

export default function SignupPage() {
  const { loginWithGithub, loginWithDemo, demoAuthEnabled } = useAuth();
  const navigate = useNavigate();
  const [githubLoading, setGithubLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleGithubSignup = () => {
    setGithubLoading(true);
    loginWithGithub();
  };

  const handleDemoSignup = () => {
    setDemoLoading(true);
    loginWithDemo();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex flex-1 flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-6">
              <Code2 className="size-7 text-primary" />
              <span className="text-xl font-bold">
                CodeGraph<span className="text-primary">AI</span>
              </span>
            </Link>
            <h2 className="text-3xl font-bold text-foreground">
              Create your account
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Start visualizing your code in minutes — it&apos;s free.
            </p>
          </div>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Get started for free</CardTitle>
              <CardDescription>
                Connect with GitHub to create your account
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <Button
                onClick={handleGithubSignup}
                disabled={githubLoading}
                size="lg"
                className="w-full bg-[#24292f] hover:bg-[#24292f]/90 text-white"
              >
                <Github className="mr-2 size-4" />
                {githubLoading ? 'Redirecting…' : 'Sign up with GitHub'}
              </Button>

              {demoAuthEnabled && (
                <Button
                  onClick={handleDemoSignup}
                  disabled={demoLoading}
                  variant="outline"
                  size="lg"
                  className="w-full"
                >
                  {demoLoading ? 'Signing in…' : 'Use Demo Login (dev only)'}
                </Button>
              )}

              <Separator />

              <p className="text-center text-xs text-muted-foreground">
                By signing up you agree to our{' '}
                <Link
                  to="/terms"
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Terms
                </Link>{' '}
                and{' '}
                <Link
                  to="/privacy"
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Privacy Policy
                </Link>
                .
              </p>

              <p className="text-center text-sm">
                <span className="text-muted-foreground">
                  Already have an account?{' '}
                </span>
                <Link
                  to="/login"
                  className="font-medium text-primary hover:underline underline-offset-4"
                >
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>

          <ul className="mt-8 flex flex-col gap-4">
            {FEATURE_LIST.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">{f.icon}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="hidden lg:relative lg:flex lg:flex-1">
        <div className="absolute inset-0 bg-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,193,7,0.15),transparent)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-white">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
                <Code2 className="size-10 text-gold" />
              </div>
              <h2 className="text-4xl font-bold mb-4">
                Join Developers Who Ship Faster
              </h2>
              <p className="text-lg text-white/70 leading-relaxed mb-8">
                Transform how you understand and work with code using
                AI-powered dependency insights.
              </p>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-2">
                <Zap className="size-4 text-gold" />
                <span className="text-sm font-medium text-white/80">
                  Free to start · No credit card required
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
