'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Report, Finding, EvidenceDetail, ReportLens } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { ReportEditor } from '@/components/ReportEditor';
import { SegmentView } from '@/components/SegmentView';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const caseId = resolvedParams.id;

  const [reports, setReports] = useState<Report[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [evidenceList, setEvidenceList] = useState<{ id: string; display_id: string }[]>([]);
  const [selectedEvidenceDetail, setSelectedEvidenceDetail] = useState<EvidenceDetail | null>(null);

  const [lens, setLens] = useState<ReportLens>('EVIDENCE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportsData, findingsData, evData] = await Promise.all([
        api.reports.list(caseId).catch(() => ({ reports: [] })),
        api.findings.list(caseId).catch(() => ({ findings: [] })),
        api.evidence.list(caseId).catch(() => ({ evidence: [] })),
      ]);

      setReports(reportsData.reports || []);
      setFindings(findingsData.findings || []);
      setEvidenceList(evData.evidence || []);

      if (reportsData.reports?.length > 0) {
        setActiveReport(reportsData.reports[0]);
      }

      if (evData.evidence?.length > 0) {
        const detail = await api.evidence.get(evData.evidence[0].id).catch(() => null);
        setSelectedEvidenceDetail(detail);
      }
    } catch (err: any) {
      if (err.code === 'UNAUTHENTICATED' || err.status === 401) {
        window.location.href = '/auth';
        return;
      }
      setError(err.message || 'Error loading reports data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [caseId]);

  const handleCreateReport = async () => {
    try {
      const res = await api.reports.create(caseId, {
        lens,
        framework: 'GDPR',
      });
      setActiveReport(res.report);
      await loadData();
    } catch (err: any) {
      alert(`Draft generation failed: ${err.message}`);
    }
  };

  const handleSaveReport = async (updated: Report) => {
    setSaving(true);
    try {
      const res = await api.reports.update(updated.id, updated.content);
      setActiveReport(res.report);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleValidateReport = async () => {
    if (!activeReport) throw new Error('No active report');
    setValidating(true);
    try {
      const res = await api.reports.validate(activeReport.id);
      setActiveReport({
        ...activeReport,
        validation_status: res.validationStatus as any,
      });
      return res.details;
    } finally {
      setValidating(false);
    }
  };

  const handleExport = async () => {
    if (!activeReport) return;
    try {
      const res = await api.reports.export(activeReport.id);
      // Trigger download
      const blob = new Blob([res.markdown], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `datatrace-report-${activeReport.id.slice(0, 8)}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Export blocked: ${err.message}`);
    }
  };

  const handleSelectEvidence = async (evId: string) => {
    try {
      const detail = await api.evidence.get(evId);
      setSelectedEvidenceDetail(detail);
    } catch {
      // ignore
    }
  };

  return (
    <Shell currentCaseId={caseId}>
      <div className="flex-1 max-w-7xl w-full mx-auto p-8">
        <div className="border-b border-hairline pb-4 mb-6">
          <Link
            href={`/cases/${caseId}`}
            className="text-xs font-mono text-muted-ink hover:text-ink uppercase tracking-wider mb-2 inline-block"
          >
            ← Back to Case
          </Link>
          <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4">
            <div>
              <h1 className="text-3xl font-serif font-normal text-ink">Action Report Studio</h1>
              <p className="text-xs font-sans text-muted-ink mt-1">
                Split workspace: structured draft assertions on the left, primary preserved segments on the right.
              </p>
            </div>

            {/* Lens selection & draft trigger */}
            <div className="flex items-center gap-2">
              <select
                value={lens}
                onChange={(e) => setLens(e.target.value as ReportLens)}
                className="bg-paper-2 border border-hairline px-3 py-1.5 text-xs font-mono rounded-sm"
              >
                <option value="EVIDENCE">Evidence Lens</option>
                <option value="FINDINGS">Findings Lens</option>
                <option value="COMPLAINT">Complaint Lens</option>
              </select>

              <button
                onClick={handleCreateReport}
                className="bg-ink text-paper px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors"
              >
                + Draft New Lens
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center font-mono text-xs text-muted-ink">
            Loading draft reports and groundings...
          </div>
        ) : !activeReport ? (
          <div className="py-24 text-center border border-dashed border-hairline rounded-sm bg-paper-2/40 max-w-md mx-auto p-8">
            <h2 className="text-xl font-serif text-ink mb-2">No Report Drafted Yet</h2>
            <p className="text-xs font-sans text-muted-ink mb-4">
              Select a lens above and click "+ Draft New Lens" to compose an evidence-grounded report.
            </p>
            <button
              onClick={handleCreateReport}
              className="bg-ink text-paper px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-sm"
            >
              Draft Initial Report
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Report Editor */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-muted-ink mb-3 pb-1 border-b border-hairline">
                <span>DRAFT EDITOR · {activeReport.active_lens} LENS</span>
                <span>STATUS: {activeReport.status}</span>
              </div>

              <ReportEditor
                report={activeReport}
                findings={findings}
                onSave={handleSaveReport}
                onValidate={handleValidateReport}
                onExport={handleExport}
                saving={saving}
                validating={validating}
              />
            </div>

            {/* Right: Preserved Evidence Viewer */}
            <div className="border-l border-hairline pl-8 space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-muted-ink pb-1 border-b border-hairline">
                <span>EVIDENCE REFERENCE PANEL</span>
                {evidenceList.length > 0 && (
                  <select
                    onChange={(e) => handleSelectEvidence(e.target.value)}
                    className="bg-paper-2 border border-hairline px-2 py-1 text-[11px] font-mono rounded-sm"
                  >
                    {evidenceList.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.display_id}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedEvidenceDetail ? (
                <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
                  <div className="text-xs font-mono text-muted-ink mb-2">
                    {selectedEvidenceDetail.item.original_filename} (
                    <strong className="text-ink">{selectedEvidenceDetail.item.display_id}</strong>)
                  </div>
                  {selectedEvidenceDetail.segments.map((seg: any) => (
                    <SegmentView key={seg.id} segment={seg} />
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-paper-2/40 border border-hairline text-xs font-mono text-muted-ink">
                  Select an evidence item to review its preserved text segments side-by-side.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
