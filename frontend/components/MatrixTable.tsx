import type { MatrixResult, MatrixStatus } from '../lib/types';

interface MatrixTableProps {
  matrix: MatrixResult;
}

const STATUS_LABELS: Record<MatrixStatus, { label: string; className: string }> = {
  ANSWERED: { label: 'Answered', className: 'text-green-800 bg-green-50 border-green-300' },
  PARTIAL: { label: 'Partial', className: 'text-amber-800 bg-amber-50 border-amber-300' },
  UNANSWERED: { label: 'No response found in case record', className: 'text-red-700 bg-red-50 border-red-200' },
  DEFLECTED: { label: 'Deflected', className: 'text-neutral-700 bg-neutral-100 border-neutral-300' },
  UNCLEAR: { label: 'Unclear', className: 'text-gray-600 bg-gray-50 border-gray-200' },
};

export function MatrixTable({ matrix }: MatrixTableProps) {
  return (
    <div className="space-y-6">
      {/* Links Table */}
      {matrix.links?.length > 0 && (
        <div className="border border-hairline rounded-sm overflow-hidden bg-paper-2">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-paper border-b border-hairline text-muted-ink uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Request Ref</th>
                <th className="p-3">Response Ref</th>
                <th className="p-3">Evaluated Status</th>
                <th className="p-3">Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {matrix.links.map((link, idx) => {
                const conf = STATUS_LABELS[link.status] || STATUS_LABELS.UNCLEAR;
                return (
                  <tr key={idx} className="hover:bg-paper/40 transition-colors">
                    <td className="p-3 font-semibold text-ink">{link.requestId}</td>
                    <td className="p-3 font-semibold text-ink">{link.responseId}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-medium ${conf.className}`}>
                        {conf.label}
                      </span>
                    </td>
                    <td className="p-3 font-sans text-muted-ink text-xs">{link.rationale}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Unanswered Requests (§13.2 mandatory wording: "No response found in case record") */}
      {matrix.unansweredRequests?.length > 0 && (
        <div className="border border-red-200/80 rounded-sm bg-red-50/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-red-800 font-semibold">
              Unanswered Privacy Inquiries
            </span>
            <span className="text-xs font-mono text-muted-ink">
              {matrix.unansweredRequests.length} pending
            </span>
          </div>

          <ul className="space-y-2">
            {matrix.unansweredRequests.map((reqId, i) => (
              <li
                key={i}
                className="flex items-center justify-between p-3 bg-paper rounded border border-hairline text-xs font-mono"
              >
                <span className="font-semibold text-ink">{reqId}</span>
                <span className="px-2 py-0.5 rounded border border-red-200 bg-red-50 text-[10px] text-red-700">
                  No response found in case record
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(!matrix.links || matrix.links.length === 0) && (!matrix.unansweredRequests || matrix.unansweredRequests.length === 0) && (
        <div className="p-12 text-center border border-dashed border-hairline rounded-sm bg-paper-2/40 text-xs font-mono text-muted-ink">
          No request-response pairs detected in case evidence yet.
        </div>
      )}
    </div>
  );
}
