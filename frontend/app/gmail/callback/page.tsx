'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Shell } from '@/components/Shell';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

function GmailCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !state) {
      setStatus('error');
      setErrorMessage('Missing OAuth authorization code or cryptographic state parameter.');
      return;
    }

    let isMounted = true;

    async function exchangeOAuthCode() {
      try {
        const res = await apiFetch<{ connected: boolean; googleEmail?: string }>('gmail/callback', {
          method: 'POST',
          body: JSON.stringify({ code, state }),
        });

        if (!isMounted) return;

        if (res.connected) {
          setEmail(res.googleEmail || 'Connected Google Account');
          setStatus('success');
          // Check if return case ID was preserved in sessionStorage
          const returnCaseId = typeof window !== 'undefined' ? sessionStorage.getItem('gmail_import_return_case') : null;
          setTimeout(() => {
            if (returnCaseId) {
              sessionStorage.removeItem('gmail_import_return_case');
              router.push(`/cases/${returnCaseId}/evidence`);
            } else {
              router.push('/cases');
            }
          }, 2500);
        } else {
          setStatus('error');
          setErrorMessage('OAuth exchange completed but connection could not be verified.');
        }
      } catch (err: any) {
        if (!isMounted) return;
        setStatus('error');
        setErrorMessage(err.message || 'Failed to exchange authorization token with Google identity vault.');
      }
    }

    exchangeOAuthCode();

    return () => {
      isMounted = false;
    };
  }, [code, state, router]);

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-paper-2 border border-ink/20 shadow-sm p-8 rounded-sm">
        <div className="flex items-center justify-between border-b border-ink/10 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-copper animate-pulse" />
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
              Gmail Ingestion Authorizer
            </h1>
          </div>
          <span className="font-mono text-xs text-muted-ink uppercase tracking-wider">
            Spec §10.6 / §15.9
          </span>
        </div>

        {status === 'verifying' && (
          <div className="space-y-4">
            <div className="p-4 bg-paper border border-ink/10 font-mono text-sm text-ink space-y-2">
              <div className="flex items-center gap-2 text-copper font-medium">
                <span className="inline-block animate-spin">◒</span>
                <span>VERIFYING CRYPTOGRAPHIC STATE & TOKEN EXCHANGE...</span>
              </div>
              <p className="text-xs text-muted-ink">
                Exchanging temporary authorization grant for scoped access tokens. Refresh credentials will be sealed with AES-256-GCM prior to archival storage.
              </p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6">
            <div className="p-4 bg-green-50/80 border border-green-500/30 text-green-950 font-mono text-sm space-y-2">
              <div className="flex items-center gap-2 font-semibold text-green-900">
                <span>✓</span>
                <span>AUTHENTICATION SUCCEEDED</span>
              </div>
              <p className="text-xs text-green-800">
                Connected mailbox: <strong className="font-semibold">{email}</strong>
              </p>
              <p className="text-xs text-green-700">
                Refresh token sealed with AES-256-GCM; short-lived access tokens stay in server memory. Read-only scope (<code className="font-mono">gmail.readonly</code>) verified.
              </p>
              <p className="text-xs text-amber-800">
                Testing only: use synthetic test accounts, not a personal or production mailbox.
              </p>
            </div>

            <p className="font-mono text-xs text-muted-ink">
              Redirecting to evidence repository in 2 seconds...
            </p>

            <div className="pt-2">
              <Link
                href="/cases"
                className="inline-flex items-center px-4 py-2 border border-ink text-xs font-mono font-medium text-ink bg-paper hover:bg-paper-2 transition-colors uppercase tracking-wider"
              >
                Return to Dossiers Immediately →
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="p-4 bg-red-50/80 border border-red-500/30 text-red-950 font-mono text-sm space-y-2">
              <div className="flex items-center gap-2 font-semibold text-red-900">
                <span>✕</span>
                <span>AUTHENTICATION FAILED (FAIL-CLOSED)</span>
              </div>
              <p className="text-xs text-red-800">
                {errorMessage || 'An error occurred during verification.'}
              </p>
              <p className="text-xs text-red-700">
                No unauthorized tokens were persisted. System integrity checks remain intact.
              </p>
            </div>

            <div className="pt-2 flex gap-4">
              <Link
                href="/cases"
                className="inline-flex items-center px-4 py-2 border border-ink text-xs font-mono font-medium text-ink bg-paper hover:bg-paper-2 transition-colors uppercase tracking-wider"
              >
                Return to Case Dossiers
              </Link>
            </div>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-ink/10 flex items-center justify-between text-[11px] font-mono text-muted-ink">
          <span>TOKEN VAULT: AES-256-GCM</span>
          <span>INGESTION SOURCE: GMAIL_IMPORT</span>
        </div>
      </div>
    </div>
  );
}

export default function GmailCallbackPage() {
  return (
    <Shell>
      <Suspense
        fallback={
          <div className="max-w-2xl mx-auto py-12 px-4 text-center font-mono text-xs text-muted-ink">
            INITIALIZING OAUTH RECEIVER...
          </div>
        }
      >
        <GmailCallbackInner />
      </Suspense>
      <DisclaimerFooter />
    </Shell>
  );
}
