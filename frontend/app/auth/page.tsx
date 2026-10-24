'use client';

import { useState } from 'react';
import { createClient } from '../../lib/supabase';
import { DisclaimerFooter } from '../../components/DisclaimerFooter';
import Link from 'next/link';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const supabase = createClient();

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setStatusMessage('Account created! You can now sign in or check your email confirmation.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.href = '/cases';
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <header className="border-b border-hairline px-6 py-4 flex items-center justify-between">
        <Link href="/cases" className="text-sm font-semibold tracking-[0.18em] uppercase font-mono">
          DATATRACE
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-paper-2 border border-hairline p-8 rounded-sm shadow-sm">
          <div className="mb-6">
            <span className="text-[11px] uppercase tracking-[0.12em] font-mono text-muted-ink">Authentication</span>
            <h1 className="text-2xl font-serif mt-1 font-normal text-ink">
              {isSignUp ? 'Create your account' : 'Sign in to DataTrace'}
            </h1>
            <p className="text-xs font-sans text-muted-ink mt-2">
              Browser-side authentication only. Data remains strictly scoped to your case boundary.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-paper border border-hairline px-3 py-2 text-sm font-sans rounded-sm focus:outline-none focus:border-amber"
                placeholder="name@organization.com"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-paper border border-hairline px-3 py-2 text-sm font-sans rounded-sm focus:outline-none focus:border-amber"
                placeholder="••••••••"
              />
            </div>

            {statusMessage && (
              <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 text-xs font-sans rounded-sm">
                {statusMessage}
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ink text-paper py-2.5 px-4 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-hairline flex items-center justify-between text-xs font-sans text-muted-ink">
            <span>{isSignUp ? 'Already have an account?' : "Don't have an account?"}</span>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setStatusMessage(null);
                setErrorMessage(null);
              }}
              className="text-copper hover:underline font-mono"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
