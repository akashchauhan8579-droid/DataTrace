'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase';
import './auth.css';

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

export default function AuthPage() {
  const [isFlipped, setIsFlipped] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign up form state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // Status feedback
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) throw error;
      window.location.href = '/cases';
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail.trim(),
        password: signupPassword,
        options: {
          data: {
            full_name: signupName.trim(),
          },
        },
      });

      if (error) throw error;

      if (data.session) {
        window.location.href = '/cases';
      } else {
        setStatusMessage('Account created! Please check your email or sign in below.');
        setIsFlipped(false);
        setLoginEmail(signupEmail);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  };

  const switchToSignup = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsFlipped(true);
  };

  const switchToLogin = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsFlipped(false);
  };

  return (
    <div className="login-page-container">
      {/* Brand logo top-left */}
      <Link href="/cases" className="brand-badge">
        <span className="brand-logo" />
        <span className="brand-text">DATATRACE</span>
      </Link>

      <div className="login-wrapper">
        <div className={`flip-scene ${isFlipped ? 'flipped' : ''}`} id="flipScene">
          <div className="flip-card">

            {/* FRONT FACE — LOGIN */}
            <div className="glass-circle front">
              <form onSubmit={handleLogin} className="login-form">
                <h1>Login</h1>
                <div className="subtitle">Sign in to your account</div>

                {errorMessage && !isFlipped && (
                  <div className="auth-alert error">{errorMessage}</div>
                )}
                {statusMessage && !isFlipped && (
                  <div className="auth-alert success">{statusMessage}</div>
                )}

                <div className="input-box">
                  <span className="input-icon">
                    <UserIcon />
                  </span>
                  <input
                    type="email"
                    placeholder="Email address"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="input-box">
                  <span className="input-icon">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    placeholder="Password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                <div className="forgot">
                  <div
                    className="remember"
                    onClick={() => setRememberMe((prev) => !prev)}
                  >
                    <div className={`switch ${rememberMe ? 'on' : ''}`} />
                    <span>Remember me</span>
                  </div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setErrorMessage('Please contact your administrator or reset via Supabase auth.');
                    }}
                  >
                    Forgot password?
                  </a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="action-btn"
                >
                  {loading ? 'Signing In…' : 'Sign In'}
                </button>

                <div className="signup-text">
                  Don&apos;t have an account?{' '}
                  <button type="button" onClick={switchToSignup} className="link-btn">
                    Sign up
                  </button>
                </div>
              </form>
            </div>

            {/* BACK FACE — SIGN UP */}
            <div className="glass-circle back">
              <form onSubmit={handleSignUp} className="login-form">
                <h1>Sign Up</h1>
                <div className="subtitle">Create your account</div>

                {errorMessage && isFlipped && (
                  <div className="auth-alert error">{errorMessage}</div>
                )}
                {statusMessage && isFlipped && (
                  <div className="auth-alert success">{statusMessage}</div>
                )}

                <div className="input-box">
                  <span className="input-icon">
                    <UserIcon />
                  </span>
                  <input
                    type="text"
                    placeholder="Full name"
                    required
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    autoComplete="name"
                  />
                </div>

                <div className="input-box">
                  <span className="input-icon">
                    <MailIcon />
                  </span>
                  <input
                    type="email"
                    placeholder="Email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="input-box" style={{ marginBottom: '22px' }}>
                  <span className="input-icon">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    required
                    minLength={6}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="action-btn"
                >
                  {loading ? 'Creating…' : 'Create Account'}
                </button>

                <div className="signup-text">
                  Already have an account?{' '}
                  <button type="button" onClick={switchToLogin} className="link-btn">
                    Login
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
