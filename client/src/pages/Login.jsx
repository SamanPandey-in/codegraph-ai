import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Github, Code2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const Login = () => {
  const { loginWithGithub } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGithubLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    loginWithGithub();
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Side - Login Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-6">
              <Code2 className="size-8 text-primary" />
              <h1 className="text-2xl font-bold font-display">CodeGraph AI</h1>
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription>
                Use your GitHub account to sign in
              </CardDescription>
            </CardHeader>
            <CardContent className="gap-6 flex flex-col">
              <Button
                onClick={handleGithubLogin}
                disabled={loading}
                size="lg"
                className="w-full bg-[#24292f] hover:bg-[#24292f]/90 text-white"
              >
                <Github className="mr-2 size-5" />
                {loading ? 'Redirecting...' : 'Continue with GitHub'}
              </Button>

              <Separator />

              <p className="text-center text-xs text-muted-foreground">
                By signing in, you agree to our{' '}
                <Link to="/terms" className="underline underline-offset-4 hover:text-primary">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="underline underline-offset-4 hover:text-primary">
                  Privacy Policy
                </Link>
              </p>

              <div className="text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link to="/signup" className="font-medium text-primary hover:underline underline-offset-4">
                  Sign up
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Side - Brand Hero */}
      <div className="hidden lg:block relative w-0 flex-1">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/80">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent"></div>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-white">
            <div className="max-w-md text-center">
              <div className="inline-flex items-center justify-center size-20 rounded-2xl bg-white/10 backdrop-blur-sm mb-6">
                <Sparkles className="size-10" />
              </div>
              <h2 className="text-4xl font-display font-bold mb-4">
                Visualize Your Codebase
              </h2>
              <p className="text-lg text-white/90 leading-relaxed">
                AI-powered code intelligence that helps you understand, navigate, and optimize your projects with ease
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;