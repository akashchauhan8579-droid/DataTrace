'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import type { Case } from '../../lib/types';
import { Shell } from '../../components/Shell';
import { DisclaimerFooter } from '../../components/DisclaimerFooter';

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Case Form
  const [showNewModal, setShowNewModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.cases.list();
      setCases(data.cases || []);
    } catch (err: any) {
      if (err.code === 'UNAUTHENTICATED' || err.status === 401) {
        window.location.href = '/auth';
        return;
      }
      setError(err.message || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    try {
      await api.cases.create({
        title: title.trim(),
        description: description.trim() ? description.trim() : undefined,
      });
      setTitle('');
      setDescription('');
      setShowNewModal(false);
      await fetchCases();
    } catch (err: any) {
      setError(err.message || 'Failed to create case');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Shell>
      <div className="flex-1 max-w-6xl w-full mx-auto p-8">
        <div className="flex items-baseline justify-between border-b border-hairline pb-4 mb-8">
          <div>
            <span className="text-[11px] uppercase tracking-[0.14em] font-mono text-muted-ink">
              Matter Registry
            </span>
            <h1 className="text-3xl font-serif font-normal text-ink mt-1">Active Cases</h1>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="bg-ink text-paper px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors shadow-sm"
          >
            + New Case
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center font-mono text-xs text-muted-ink">
            Loading preserved case records...
          </div>
        ) : cases.length === 0 ? (
          <div className="py-24 text-center border border-dashed border-hairline rounded-sm bg-paper-2/40 max-w-xl mx-auto p-12">
            <h2 className="text-2xl font-serif text-ink italic mb-3">
              "No cases yet. Start with the evidence you already have."
            </h2>
            <p className="text-xs text-muted-ink font-sans max-w-md mx-auto mb-6">
              Create a designated case folder to securely ingest emails, letters, and responses. Originals remain untouched; every claim is deterministically verified.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="bg-ink text-paper px-5 py-2.5 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors"
            >
              Open First Case
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cases.map((c) => (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="group block p-6 bg-paper-2 border border-hairline rounded-sm hover:border-amber transition-colors shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-muted-ink mb-3">
                    <span className="font-semibold text-ink px-1.5 py-0.5 bg-paper rounded border border-hairline">
                      {c.displayId}
                    </span>
                    <span className="uppercase tracking-wider text-[10px]">{c.status}</span>
                  </div>
                  <h2 className="text-lg font-serif text-ink group-hover:text-copper transition-colors line-clamp-2 mb-2">
                    {c.title}
                  </h2>
                  {c.description && (
                    <p className="text-xs text-muted-ink font-sans line-clamp-3 mb-4 leading-relaxed">
                      {c.description}
                    </p>
                  )}
                </div>
                <div className="pt-4 border-t border-hairline/60 flex items-center justify-between text-[11px] font-mono text-muted-ink">
                  <span>Opened {new Date(c.createdAt).toLocaleDateString()}</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-night/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-paper border border-hairline p-6 rounded-sm shadow-xl">
            <h2 className="text-xl font-serif text-ink mb-1">Open a New Case</h2>
            <p className="text-xs font-sans text-muted-ink mb-4">
              Enter the entity name or privacy issue (e.g. "Acme Corp — Erasure Request").
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                  Case Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-paper-2 border border-hairline px-3 py-2 text-sm font-sans rounded-sm focus:outline-none focus:border-amber"
                  placeholder="Acme GDPR Deletion Follow-up"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                  Description / Context (Optional)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-paper-2 border border-hairline px-3 py-2 text-sm font-sans rounded-sm focus:outline-none focus:border-amber"
                  placeholder="Requested erasure on 12 Oct; received boilerplate denial claiming unspecified legal hold."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-mono uppercase text-muted-ink hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-ink text-paper px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DisclaimerFooter />
    </Shell>
  );
}
