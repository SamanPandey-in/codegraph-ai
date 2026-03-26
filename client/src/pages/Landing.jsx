import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-16">
        <div className="mb-6 rounded-full border border-border bg-card px-4 py-1 text-sm text-muted-foreground">
          Demo Experience
        </div>

        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
          CodeGraph AI Demo Landing
        </h1>

        <p className="mt-4 max-w-2xl text-center text-lg text-muted-foreground">
          This is a simple demo entry page. Use the button below to continue to the GitHub login flow.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/login">
            <Button size="lg" className="w-full sm:w-auto">
              Go to Login
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
          <Link to="/signup">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Create Account
            </Button>
          </Link>
        </div>

        <Card className="mt-10 w-full max-w-xl">
          <CardHeader>
            <CardTitle className="text-lg">What this page is for</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Root route <strong>/</strong> now points to this basic landing page.</p>
            <p>2. Login route remains available at <strong>/login</strong>.</p>
            <p>3. GitHub OAuth still begins from the login page.</p>
            <div className="flex items-center pt-2 text-foreground">
              <Github className="mr-2 size-4" />
              Continue with GitHub from the Login screen
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Landing;
