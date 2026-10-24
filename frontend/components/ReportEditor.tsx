'use client';

import { useState } from 'react';
import type { Report, Finding, ValidationDetails } from '../lib/types';
import { ReportBlock } from './ReportBlock';

interface ReportEditorProps {
  report: Report;
  findings: Finding[];
  onSave: (updatedReport: Report) => Promise<void>;
  onValidate: () => Promise<ValidationDetails>;
  onExport: () => Promise<void>;
  saving?: boolean;
  validating?: boolean;
}

export function ReportEditor({
  report,
  findings,
  onSave,
  onValidate,
  onExport,
  saving,
  validating,
}: ReportEditorProps) {
  const [blocks, setBlocks] = useState(report.content?.blocks || []);
  const [failingBlockIds, setFailingBlockIds] = useState<string[]>([]);
  const [validationPassed, setValidationPassed] = useState(
    report.validation_status === 'PASSED'
  );

  // Add assertion modal state
  const [showAddAssertion, setShowAddAssertion] = useState(false);
  const [assertionText, setAssertionText] = useState('');
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);

  // Add user note state
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState('');

  const handleRunValidation = async () => {
    try {
      const res = await onValidate();
      if (res.status === 'VALIDATED') {
        setValidationPassed(true);
        setFailingBlockIds([]);
      } else {
        setValidationPassed(false);
        setFailingBlockIds(res.failingBlockIds || []);
      }
    } catch (err: any) {
      alert(`Validation error: ${err.message}`);
    }
  };

  const handleAddAssertion = async () => {
    if (!assertionText.trim()) return;

    const newBlock = {
      id: `block-${Date.now()}`,
      kind: 'assertion' as const,
      text: assertionText.trim(),
      findingIds: selectedFindingIds,
    };

    const updatedBlocks = [...blocks, newBlock];
    setBlocks(updatedBlocks);
    setValidationPassed(false); // edits invalidate previous validation

    await onSave({
      ...report,
      content: {
        ...report.content,
        blocks: updatedBlocks,
      },
    });

    setAssertionText('');
    setSelectedFindingIds([]);
    setShowAddAssertion(false);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;

    const newBlock = {
      id: `block-${Date.now()}`,
      kind: 'user_note' as const,
      notes: noteText.trim(),
    };

    const updatedBlocks = [...blocks, newBlock];
    setBlocks(updatedBlocks);

    await onSave({
      ...report,
      content: {
        ...report.content,
        blocks: updatedBlocks,
      },
    });

    setNoteText('');
    setShowAddNote(false);
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-paper-2 border border-hairline rounded-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase text-muted-ink">Validation:</span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
              validationPassed
                ? 'bg-green-50 text-green-800 border-green-300'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
          >
            {validationPassed ? 'PASSED (GROUNDED)' : 'UNVALIDATED'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddAssertion(true)}
            className="px-3 py-1.5 bg-paper border border-hairline hover:border-ink text-xs font-mono uppercase rounded-sm text-ink transition-colors"
          >
            + Assertion
          </button>
          <button
            onClick={() => setShowAddNote(true)}
            className="px-3 py-1.5 bg-paper border border-hairline hover:border-ink text-xs font-mono uppercase rounded-sm text-ink transition-colors"
          >
            + Author Note
          </button>
          <button
            onClick={handleRunValidation}
            disabled={validating}
            className="px-3 py-1.5 bg-ink text-paper text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            {validating ? 'Checking…' : 'Validate Grounding'}
          </button>
          <button
            onClick={onExport}
            disabled={!validationPassed}
            title={!validationPassed ? 'Validation must pass before export' : 'Export document'}
            className="px-3 py-1.5 bg-copper text-paper text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-opacity-90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Export Markdown ↓
          </button>
        </div>
      </div>

      {/* Render draft blocks */}
      <div className="bg-paper p-6 border border-hairline rounded-sm space-y-2">
        {blocks.map((block, idx) => (
          <ReportBlock
            key={block.id || idx}
            block={block}
            index={idx}
            isFailing={block.id ? failingBlockIds.includes(block.id) : false}
          />
        ))}
      </div>

      {/* Add Assertion Modal */}
      {showAddAssertion && (
        <div className="fixed inset-0 bg-night/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-paper border border-hairline p-6 rounded-sm shadow-xl space-y-4">
            <h3 className="text-lg font-serif text-ink">Add Evidence-Backed Assertion</h3>

            <div>
              <label className="block text-xs font-mono uppercase text-muted-ink mb-1">
                Assertion Statement
              </label>
              <textarea
                rows={3}
                value={assertionText}
                onChange={(e) => setAssertionText(e.target.value)}
                placeholder="The organization confirmed receipt of erasure request on 2026-10-12."
                className="w-full bg-paper-2 border border-hairline p-2 text-xs font-sans rounded-sm focus:outline-none focus:border-amber"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-muted-ink mb-1">
                Select Backing Findings (Grounding Citations)
              </label>
              <div className="max-h-48 overflow-y-auto border border-hairline rounded-sm p-2 bg-paper-2 space-y-1.5">
                {findings.length === 0 ? (
                  <div className="text-xs font-mono text-muted-ink p-2">No findings available in case.</div>
                ) : (
                  findings.map((f) => {
                    const checked = selectedFindingIds.includes(f.id);
                    return (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-paper cursor-pointer text-xs font-sans"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFindingIds([...selectedFindingIds, f.id]);
                            } else {
                              setSelectedFindingIds(selectedFindingIds.filter((id) => id !== f.id));
                            }
                          }}
                        />
                        <span className="font-mono text-[10px] px-1 bg-paper border rounded">
                          {f.display_id}
                        </span>
                        <span className="truncate text-ink">{f.statement}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddAssertion(false)}
                className="px-3 py-1.5 text-xs font-mono uppercase text-muted-ink hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddAssertion}
                disabled={saving || !assertionText.trim()}
                className="bg-ink text-paper px-4 py-1.5 text-xs font-mono uppercase rounded-sm hover:bg-neutral-800 disabled:opacity-50"
              >
                Save Assertion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Note Modal */}
      {showAddNote && (
        <div className="fixed inset-0 bg-night/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-paper border border-hairline p-6 rounded-sm shadow-xl space-y-4">
            <h3 className="text-lg font-serif text-ink">Add Author Statement</h3>
            <p className="text-xs font-sans text-muted-ink">
              Will be explicitly labelled as "Author's statement (not evidence-backed)" in exported documents.
            </p>

            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="I have sent 3 follow-up reminders via email without acknowledgement."
              className="w-full bg-paper-2 border border-hairline p-2 text-xs font-sans rounded-sm focus:outline-none focus:border-amber"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddNote(false)}
                className="px-3 py-1.5 text-xs font-mono uppercase text-muted-ink hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddNote}
                disabled={saving || !noteText.trim()}
                className="bg-ink text-paper px-4 py-1.5 text-xs font-mono uppercase rounded-sm hover:bg-neutral-800 disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
