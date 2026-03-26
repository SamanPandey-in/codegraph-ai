import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Github, Code2, Zap, GitBranch, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const Signup = () => {
  const { loginWithGithub } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGithubSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    loginWithGithub();
  };

  const features = [
    {
      icon: <GitBranch className="size-5 text-primary" />,
      title: 'Code Analysis',
      description: 'Deep insights into your codebase structure'
    },
    {
      icon: <Network className="size-5 text-primary" />,
      title: 'Dependency Graphs',
      description: 'Visualize relationships and dependencies'
    },
    {
      icon: <Zap className="size-5 text-primary" />,
      title: 'AI-Powered',
      description: 'Smart suggestions and automated refactoring'
    }
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Side - Signup Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-6">
              <Code2 className="size-8 text-primary" />
              <h1 className="text-2xl font-bold font-display">CodeGraph AI</h1>
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground">
              Create your account
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start visualizing your code in minutes
            </p>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Get started for free</CardTitle>
              <CardDescription>
                Connect with GitHub to create your account
              </CardDescription>
            </CardHeader>
            <CardContent className="gap-6 flex flex-col">
              <Button
                onClick={handleGithubSignup}
                disabled={loading}
                size="lg"
                className="w-full bg-[#24292f] hover:bg-[#24292f]/90 text-white"
              >
                <Github className="mr-2 size-5" />
                {loading ? 'Redirecting...' : 'Sign up with GitHub'}
              </Button>

              <Separator />

              <p className="text-center text-xs text-muted-foreground">
                By signing up, you agree to our{' '}
                <Link to="/terms" className="underline underline-offset-4 hover:text-primary">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="underline underline-offset-4 hover:text-primary">
                  Privacy Policy
                </Link>
              </p>

              <div className="text-center text-sm">
                <span className="text-muted-foreground">Already have an account? </span>
                <Link to="/login" className="font-medium text-primary hover:underline underline-offset-4">
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Features Preview */}
          <div className="mt-8 gap-4 flex flex-col">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {feature.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-foreground">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Brand Hero */}
      <div className="hidden lg:block relative w-0 flex-1">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/80">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent"></div>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-white">
            <div className="max-w-md text-center">
              <div className="inline-flex items-center justify-center size-20 rounded-2xl bg-white/10 backdrop-blur-sm mb-6">
                <Code2 className="size-10" />
              </div>
              <h2 className="text-4xl font-display font-bold mb-4">
                Join Thousands of Developers
              </h2>
              <p className="text-lg text-white/90 leading-relaxed mb-8">
                Transform how you understand and work with code using AI-powered insights
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm">
                <Zap className="size-4" />
                <span className="text-sm font-medium">Free to start • No credit card required</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;