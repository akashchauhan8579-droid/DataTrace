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
        {/* Matter Registry Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-hairline pb-5 mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-copper font-semibold">
                Case Management Registry
              </span>
              <span className="text-muted-ink text-xs">/</span>
              <span className="text-[10px] font-mono text-muted-ink uppercase">
                {cases.length} {cases.length === 1 ? 'Matter' : 'Matters'} Sealed
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-normal text-ink">Active Case Records</h1>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="self-start sm:self-auto bg-copper text-paper px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-umber transition-colors shadow-xs font-medium"
          >
            + New Case Record
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error}
          </div>
        )}

        {/* Skeleton Loaders (Avoids Trope 21: "no skeleton loaders") */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-paper-2 border border-hairline p-6 rounded-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div className="w-16 h-4 bg-hairline/40 rounded-sm" />
                  <div className="w-12 h-3 bg-hairline/30 rounded-sm" />
                </div>
                <div className="w-3/4 h-6 bg-hairline/50 rounded-sm" />
                <div className="w-full h-12 bg-hairline/25 rounded-sm" />
                <div className="pt-4 border-t border-hairline/40 flex justify-between">
                  <div className="w-20 h-3 bg-hairline/30 rounded-sm" />
                  <div className="w-4 h-3 bg-hairline/30 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="py-24 text-center border border-dashed border-hairline rounded-sm bg-paper-2/40 max-w-xl mx-auto p-12">
            <span className="text-xs font-mono uppercase tracking-widest text-copper block mb-2">Preserved Isolation</span>
            <h2 className="text-2xl font-serif text-ink italic mb-3">
              "No cases yet. Start with the evidence you already have."
            </h2>
            <p className="text-xs text-muted-ink font-sans max-w-md mx-auto mb-6 leading-relaxed">
              Create an isolated case dossier to securely ingest emails, documents, and letters. Original bytes remain preserved via SHA-256; claims are deterministically verified.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="bg-ink text-paper px-6 py-2.5 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors shadow-xs"
            >
              Open First Case Record
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cases.map((c) => (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="group block p-6 bg-paper-2 border border-hairline rounded-sm hover:border-copper transition-colors shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-muted-ink mb-3">
                    <span className="font-semibold text-ink px-1.5 py-0.5 bg-paper rounded border border-hairline">
                      {c.displayId}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded border border-hairline bg-paper/60 text-muted-ink">
                      {c.status}
                    </span>
                  </div>

                  <h2 className="text-xl font-serif text-ink group-hover:text-copper transition-colors line-clamp-2 mb-2 leading-snug">
                    {c.title}
                  </h2>

                  {c.description ? (
                    <p className="text-xs text-muted-ink font-sans line-clamp-3 mb-4 leading-relaxed">
                      {c.description}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-ink/60 italic font-sans mb-4">
                      No additional description provided.
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-hairline flex items-center justify-between text-[11px] font-mono text-muted-ink">
                  <span>Opened {new Date(c.createdAt).toLocaleDateString()}</span>
                  <span className="text-ink group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* New Case Creation Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-paper border border-hairline p-6 rounded-sm shadow-xl">
            <div className="flex items-center justify-between border-b border-hairline pb-2 mb-4">
              <span className="text-[10px] font-mono uppercase tracking-widest text-copper font-semibold">
                New Matter File
              </span>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-xs font-mono text-muted-ink hover:text-ink"
              >
                [CLOSE ✕]
              </button>
            </div>

            <h2 className="text-2xl font-serif text-ink mb-1">Open a Preserved Case</h2>
            <p className="text-xs font-sans text-muted-ink mb-5 leading-relaxed">
              Every case establishes an isolated boundary with a database-generated display ID. Evidence, findings, and audit trails remain strictly compartmentalized.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                  Case Title <span className="text-copper">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Acme Corp — Article 17 Erasure Dispute"
                  className="w-full bg-paper-2 border border-hairline px-3 py-2 text-xs font-sans rounded-sm focus:outline-none focus:border-copper"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                  Scope Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Key context, request dates, or specific dispute allegations..."
                  className="w-full bg-paper-2 border border-hairline px-3 py-2 text-xs font-sans rounded-sm focus:outline-none focus:border-copper"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 border border-hairline text-xs font-mono uppercase text-muted-ink hover:text-ink rounded-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-copper text-paper text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-umber transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create Case File'}
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
