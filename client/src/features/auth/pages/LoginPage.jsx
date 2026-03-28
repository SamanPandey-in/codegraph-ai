import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Github, Code2, Sparkles } from 'lucide-react';
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

export default function LoginPage() {
  const { loginWithGithub, loginWithDemo, demoAuthEnabled, demoCredentials } =
    useAuth();
  const navigate = useNavigate();
  const [githubLoading, setGithubLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleGithubLogin = () => {
    setGithubLoading(true);
    loginWithGithub();
  };

  const handleDemoLogin = () => {
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
            <h2 className="text-3xl font-bold text-foreground">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Use your GitHub account to sign in</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <Button
                onClick={handleGithubLogin}
                disabled={githubLoading}
                size="lg"
                className="w-full bg-[#24292f] hover:bg-[#24292f]/90 text-white"
              >
                <Github className="mr-2 size-4" />
                {githubLoading ? 'Redirecting…' : 'Continue with GitHub'}
              </Button>

              {demoAuthEnabled && (
                <>
                  <Button
                    onClick={handleDemoLogin}
                    disabled={demoLoading}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    {demoLoading ? 'Signing in…' : 'Use Demo Login (dev only)'}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Demo credentials:{' '}
                    <strong>{demoCredentials.username}</strong> /{' '}
                    <strong>{demoCredentials.password}</strong>
                  </p>
                </>
              )}

              <Separator />

              <p className="text-center text-xs text-muted-foreground">
                By signing in you agree to our{' '}
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
                  Don&apos;t have an account?{' '}
                </span>
                <Link
                  to="/signup"
                  className="font-medium text-primary hover:underline underline-offset-4"
                >
                  Sign up
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="hidden lg:relative lg:flex lg:flex-1">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-white">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
                <Sparkles className="size-10" />
              </div>
              <h2 className="text-4xl font-bold mb-4">Visualize Your Codebase</h2>
              <p className="text-lg text-white/90 leading-relaxed">
                AI-powered code intelligence that helps you understand, navigate,
                and optimize your projects with ease.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
