import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Github } from 'lucide-react';

const Signup = () => {
  const { loginWithGithub } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGithubSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    loginWithGithub();
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <h2 className="text-3xl font-display font-bold" style={{ color: 'var(--text)' }}>
              Create account
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <span className="font-medium" style={{ color: 'var(--primary-500)' }}>
                  Sign in
                </span>
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <button
              onClick={handleGithubSignup}
              disabled={loading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                backgroundColor: '#24292f',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '1rem',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              <Github size={20} />
              {loading ? 'Redirecting...' : 'Sign up with GitHub'}
            </button>

            <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>

      <div className="hidden lg:block relative w-0 flex-1">
        <div className="absolute inset-0 bg-linear-to-br from-primary-600 to-primary-800">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <div style={{ textAlign: 'center', color: 'white' }}>
              <h2 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>
                CodeGraph AI
              </h2>
              <p style={{ fontSize: '1.25rem', color: 'var(--primary-100)', maxWidth: '28rem' }}>
                Sign up with GitHub to get started
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;