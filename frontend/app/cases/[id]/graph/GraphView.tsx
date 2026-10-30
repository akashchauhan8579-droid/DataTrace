'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Case, Finding, EvidenceItem } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';
import { useCaseTab, useRedirectOnAuthError } from '@/lib/queries';

interface GraphNode {
  id: string;
  label: string;
  category: 'CONTROLLER' | 'PROCESSOR' | 'SUBJECT' | 'SYSTEM' | 'DATA_CATEGORY' | 'CONTRADICTION';
  details: string;
  findingCount: number;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  basis: string;
  state: string;
  findingId?: string;
  findingDisplayId?: string;
  evidenceId?: string;
  citationQuote?: string;
}

export default function GraphView({ caseId }: { caseId: string }) {
  const { data, isLoading, error } = useCaseTab(caseId, 'graph');
  useRedirectOnAuthError(error);

  const caseData: Case | null = data?.caseData ?? null;
  const findings: Finding[] = data?.findings ?? [];
  const evidenceList: EvidenceItem[] = data?.evidence ?? [];

  // Selection state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Derive Graph Nodes & Edges deterministically from Findings and Evidence
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeList: GraphEdge[] = [];

    // Always ensure Data Subject node exists
    nodeMap.set('subject-complainant', {
      id: 'subject-complainant',
      label: 'Data Subject (Complainant)',
      category: 'SUBJECT',
      details: 'Individual asserting GDPR / privacy rights and data erasure requests.',
      findingCount: 0,
    });

    // Default Controller node
    nodeMap.set('controller-target', {
      id: 'controller-target',
      label: caseData?.title?.split(' ')[0] || 'Target Controller',
      category: 'CONTROLLER',
      details: 'Principal entity responsible for data processing and GDPR Art 17 compliance.',
      findingCount: 0,
    });

    for (const f of findings) {
      const payload = (f.structured_payload || {}) as Record<string, any>;
      const type = (f.finding_type || '').toUpperCase();
      const firstCitation = f.citations?.[0];
      const quote = firstCitation?.quoted_text || undefined;

      if (type.includes('REQUEST') || type.includes('ERASURE')) {
        edgeList.push({
          id: `edge-${f.id}`,
          from: 'subject-complainant',
          to: 'controller-target',
          label: 'REQUESTED_ERASURE',
          basis: f.evidence_basis,
          state: f.verification_state,
          findingId: f.id,
          findingDisplayId: f.display_id,
          evidenceId: firstCitation?.evidence_id,
          citationQuote: quote,
        });
        nodeMap.get('controller-target')!.findingCount += 1;
      } else if (type.includes('RESPONSE') || type.includes('CONFIRMATION')) {
        edgeList.push({
          id: `edge-${f.id}`,
          from: 'controller-target',
          to: 'subject-complainant',
          label: 'CONFIRMED_ERASURE',
          basis: f.evidence_basis,
          state: f.verification_state,
          findingId: f.id,
          findingDisplayId: f.display_id,
          evidenceId: firstCitation?.evidence_id,
          citationQuote: quote,
        });
        nodeMap.get('controller-target')!.findingCount += 1;
      } else if (f.evidence_basis === 'CONFLICTING' || f.verification_state === 'CONTRADICTED') {
        const contraNodeId = `contra-${f.id}`;
        if (!nodeMap.has(contraNodeId)) {
          nodeMap.set(contraNodeId, {
            id: contraNodeId,
            label: `Contradiction (${f.display_id})`,
            category: 'CONTRADICTION',
            details: payload.summary || payload.description || f.statement || 'Active contradiction with claimed erasure',
            findingCount: 1,
          });
        }
        edgeList.push({
          id: `edge-${f.id}`,
          from: 'controller-target',
          to: contraNodeId,
          label: 'UNAUTHORIZED_RETAIN_OR_CONTACT',
          basis: f.evidence_basis,
          state: f.verification_state,
          findingId: f.id,
          findingDisplayId: f.display_id,
          evidenceId: firstCitation?.evidence_id,
          citationQuote: quote,
        });
      } else {
        // Third party, system, or category node
        const entityName = payload.entity || payload.system || payload.vendor || payload.category || `Entity (${f.display_id})`;
        const entityId = `node-${entityName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

        let cat: GraphNode['category'] = 'SYSTEM';
        if (type.includes('TRANSFER') || type.includes('VENDOR') || type.includes('PROCESSOR')) {
          cat = 'PROCESSOR';
        } else if (type.includes('CATEGORY') || type.includes('DATA')) {
          cat = 'DATA_CATEGORY';
        }

        if (!nodeMap.has(entityId)) {
          nodeMap.set(entityId, {
            id: entityId,
            label: entityName,
            category: cat,
            details: payload.summary || payload.description || f.statement || `Discovered entity via ${f.display_id}`,
            findingCount: 1,
          });
        } else {
          nodeMap.get(entityId)!.findingCount += 1;
        }

        edgeList.push({
          id: `edge-${f.id}`,
          from: 'controller-target',
          to: entityId,
          label: payload.action || 'DISCLOSED_OR_RETAINED',
          basis: f.evidence_basis,
          state: f.verification_state,
          findingId: f.id,
          findingDisplayId: f.display_id,
          evidenceId: firstCitation?.evidence_id,
          citationQuote: quote,
        });
      }
    }

    // Also populate nodes for evidence items if not already linked
    for (const ev of evidenceList) {
      if (ev.source_type === 'EMAIL' && !nodeMap.has('email-gateway')) {
        nodeMap.set('email-gateway', {
          id: 'email-gateway',
          label: 'Email Dispatch Gateway',
          category: 'SYSTEM',
          details: `RFC-822 email transmission layer (${ev.mime_type})`,
          findingCount: 1,
        });
        edgeList.push({
          id: `edge-ev-${ev.id}`,
          from: 'controller-target',
          to: 'email-gateway',
          label: 'TRANSMITTED_VIA',
          basis: 'OBSERVED',
          state: 'VERIFIED',
          evidenceId: ev.id,
          findingDisplayId: ev.display_id,
        });
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: edgeList,
    };
  }, [findings, caseData, evidenceList]);

  // Node positions on 2D canvas (computed deterministically in circular/tree layout)
  const nodePositions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const centerX = 400;
    const centerY = 280;
    const radius = 220;

    nodes.forEach((node) => {
      if (node.id === 'controller-target') {
        pos.set(node.id, { x: centerX, y: centerY });
      } else if (node.id === 'subject-complainant') {
        pos.set(node.id, { x: centerX - 260, y: centerY });
      } else {
        const otherNodes = nodes.filter(
          (n) => n.id !== 'controller-target' && n.id !== 'subject-complainant'
        );
        const otherIdx = otherNodes.findIndex((n) => n.id === node.id);
        const angle = ((otherIdx + 0.5) / Math.max(otherNodes.length, 1)) * 2 * Math.PI - Math.PI / 2;
        pos.set(node.id, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * (radius * 0.75),
        });
      }
    });

    return pos;
  }, [nodes]);

  const filteredNodes = nodes.filter((n) => {
    if (categoryFilter === 'ALL') return true;
    return n.category === categoryFilter;
  });

  return (
    <Shell currentCaseId={caseId} caseDisplayId={caseData?.displayId}>
      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 fade-in">
        {/* Header */}
        <div className="border-b border-hairline pb-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-copper font-semibold">
                  Principle 9 • Entity & Privacy Graph (P1-A)
                </span>
                <span className="text-muted-ink text-xs font-mono">•</span>
                <span className="text-xs font-mono text-muted-ink">
                  {caseData?.title || 'Case Dossier'}
                </span>
              </div>
              <h1 className="text-3xl font-serif font-normal text-ink">
                Entity & Data Flow Graph
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/cases/${caseId}/timeline`}
                className="px-3 py-1.5 border border-hairline rounded-sm text-xs font-mono text-ink bg-paper-2 hover:bg-paper transition-colors uppercase tracking-wider"
              >
                ← View Timeline
              </Link>
            </div>
          </div>
          <p className="text-xs font-sans text-muted-ink mt-2">
            Topological map of controllers, processors, data subjects, and contradictory communications. Nodes and relationships are grounded in immutable evidence citations with deterministic verification states.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error.message}
          </div>
        )}

        {/* Stats summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-4 bg-paper-2 border border-hairline rounded-sm">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">Discovered Entities</div>
            <div className="font-serif text-2xl font-semibold text-ink mt-1">{nodes.length}</div>
          </div>
          <div className="p-4 bg-paper-2 border border-hairline rounded-sm">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">Disclosed Flows</div>
            <div className="font-serif text-2xl font-semibold text-ink mt-1">{edges.length}</div>
          </div>
          <div className="p-4 bg-paper-2 border border-hairline rounded-sm">
            <div className="text-[10px] font-mono uppercase tracking-wider text-green-800">Verified Paths</div>
            <div className="font-serif text-2xl font-semibold text-green-900 mt-1">
              {edges.filter((e) => e.state === 'VERIFIED').length}
            </div>
          </div>
          <div className="p-4 bg-paper-2 border border-hairline rounded-sm">
            <div className="text-[10px] font-mono uppercase tracking-wider text-red-800">Contradictions</div>
            <div className="font-serif text-2xl font-semibold text-red-900 mt-1">
              {edges.filter((e) => e.basis === 'CONFLICTING' || e.state === 'CONTRADICTED').length}
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 p-3 bg-paper-2 border border-hairline rounded-sm mb-6 text-xs font-mono">
          <span className="text-muted-ink uppercase tracking-wider text-[11px] mr-1">
            Filter Entities:
          </span>
          {(['ALL', 'CONTROLLER', 'PROCESSOR', 'SUBJECT', 'SYSTEM', 'CONTRADICTION'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded text-[11px] uppercase tracking-wider transition-colors ${
                categoryFilter === cat
                  ? 'bg-ink text-paper font-semibold'
                  : 'bg-paper text-muted-ink hover:text-ink border border-hairline'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Interactive Graph Canvas and Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* SVG Canvas (2 cols on lg) */}
          <div className="lg:col-span-2 bg-paper-2 border border-hairline rounded-sm overflow-hidden relative min-h-[560px] flex items-center justify-center p-4">
            {isLoading ? (
              <div className="font-mono text-xs text-muted-ink">
                SYNTHESIZING GRAPH TOPOLOGY...
              </div>
            ) : (
              <svg
                viewBox="0 0 800 560"
                className="w-full h-full select-none"
                style={{ maxHeight: '600px' }}
              >
                {/* SVG Definitions for arrow markers */}
                <defs>
                  <marker
                    id="arrow-verified"
                    viewBox="0 0 10 10"
                    refX="20"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#234E32" />
                  </marker>
                  <marker
                    id="arrow-contradicted"
                    viewBox="0 0 10 10"
                    refX="20"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#8B2627" />
                  </marker>
                  <marker
                    id="arrow-default"
                    viewBox="0 0 10 10"
                    refX="20"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#B5562F" />
                  </marker>
                </defs>

                {/* Render Edges */}
                {edges.map((edge) => {
                  const fromPos = nodePositions.get(edge.from);
                  const toPos = nodePositions.get(edge.to);
                  if (!fromPos || !toPos) return null;

                  const isContradiction = edge.basis === 'CONFLICTING' || edge.state === 'CONTRADICTED';
                  const isVerified = edge.state === 'VERIFIED';
                  const isSelected = selectedEdge?.id === edge.id;

                  const strokeColor = isContradiction
                    ? '#8B2627'
                    : isVerified
                    ? '#234E32'
                    : '#B5562F';

                  const markerId = isContradiction
                    ? 'url(#arrow-contradicted)'
                    : isVerified
                    ? 'url(#arrow-verified)'
                    : 'url(#arrow-default)';

                  // Midpoint for label
                  const midX = (fromPos.x + toPos.x) / 2;
                  const midY = (fromPos.y + toPos.y) / 2;

                  return (
                    <g
                      key={edge.id}
                      onClick={() => {
                        setSelectedEdge(edge);
                        setSelectedNode(null);
                      }}
                      className="cursor-pointer group"
                    >
                      <line
                        x1={fromPos.x}
                        y1={fromPos.y}
                        x2={toPos.x}
                        y2={toPos.y}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : 1.5}
                        strokeDasharray={edge.basis === 'INFERRED' ? '4 4' : undefined}
                        markerEnd={markerId}
                        className="transition-all"
                      />
                      {/* Invisible wider hit area for click */}
                      <line
                        x1={fromPos.x}
                        y1={fromPos.y}
                        x2={toPos.x}
                        y2={toPos.y}
                        stroke="transparent"
                        strokeWidth={14}
                      />
                      <rect
                        x={midX - 40}
                        y={midY - 10}
                        width={80}
                        height={20}
                        fill="#F2E9D0"
                        stroke="#1B1814"
                        strokeWidth={0.5}
                        rx={2}
                      />
                      <text
                        x={midX}
                        y={midY + 3.5}
                        textAnchor="middle"
                        fill="#1B1814"
                        fontSize={8.5}
                        fontFamily="monospace"
                        fontWeight="600"
                        className="uppercase pointer-events-none"
                      >
                        {edge.label.slice(0, 14)}
                      </text>
                    </g>
                  );
                })}

                {/* Render Nodes */}
                {nodes.map((node) => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;
                  const isSelected = selectedNode?.id === node.id;

                  const isController = node.category === 'CONTROLLER';
                  const isSubject = node.category === 'SUBJECT';
                  const isContradiction = node.category === 'CONTRADICTION';

                  let fillBg = '#F2E9D0';
                  let strokeBorder = '#1B1814';

                  if (isController) {
                    fillBg = '#B5562F';
                  } else if (isSubject) {
                    fillBg = '#D98A4E';
                  } else if (isContradiction) {
                    fillBg = '#FEE2E2';
                    strokeBorder = '#8B2627';
                  }

                  return (
                    <g
                      key={node.id}
                      onClick={() => {
                        setSelectedNode(node);
                        setSelectedEdge(null);
                      }}
                      className="cursor-pointer group"
                    >
                      {/* Node Box */}
                      <rect
                        x={pos.x - 70}
                        y={pos.y - 25}
                        width={140}
                        height={50}
                        rx={3}
                        fill={isController ? '#B5562F' : isSubject ? '#6B645A' : fillBg}
                        stroke={isSelected ? '#1B1814' : strokeBorder}
                        strokeWidth={isSelected ? 2.5 : 1}
                        className="transition-all"
                      />

                      {/* Node Category Badge */}
                      <text
                        x={pos.x}
                        y={pos.y - 10}
                        textAnchor="middle"
                        fill={isController || isSubject ? '#F2E9D0' : '#6B645A'}
                        fontSize={7.5}
                        fontFamily="monospace"
                        fontWeight="700"
                        className="uppercase tracking-wider pointer-events-none"
                      >
                        {node.category}
                      </text>

                      {/* Node Label */}
                      <text
                        x={pos.x}
                        y={pos.y + 8}
                        textAnchor="middle"
                        fill={isController || isSubject ? '#FFFFFF' : '#1B1814'}
                        fontSize={10.5}
                        fontFamily="serif"
                        fontWeight="600"
                        className="pointer-events-none"
                      >
                        {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px] font-mono text-muted-ink bg-paper/90 px-3 py-1.5 rounded border border-hairline">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-copper inline-block" /> Controller
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-ink inline-block" /> Subject
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> Contradiction
              </span>
            </div>
          </div>

          {/* Details Sidebar (1 col on lg) */}
          <div className="bg-paper-2 border border-hairline rounded-sm p-6 space-y-6">
            <div className="border-b border-hairline pb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-copper font-semibold">
                Archival Inspector
              </span>
              <h2 className="text-xl font-serif text-ink mt-0.5">
                {selectedNode
                  ? selectedNode.label
                  : selectedEdge
                  ? `Relationship: ${selectedEdge.label}`
                  : 'Select Node or Edge'}
              </h2>
            </div>

            {selectedNode && (
              <div className="space-y-4">
                <div className="p-3 bg-paper border border-hairline rounded-sm space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">
                    Category Classification
                  </div>
                  <div className="font-mono text-xs font-semibold text-ink">
                    {selectedNode.category}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">
                    Entity Description
                  </div>
                  <p className="font-sans text-xs text-ink leading-relaxed">
                    {selectedNode.details}
                  </p>
                </div>

                <div className="p-3 bg-paper border border-hairline rounded-sm flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-ink">Associated Findings:</span>
                  <span className="font-semibold text-ink">{selectedNode.findingCount}</span>
                </div>
              </div>
            )}

            {selectedEdge && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-3 bg-paper border border-hairline rounded-sm">
                    <div className="text-[10px] text-muted-ink uppercase">Basis</div>
                    <div className="font-semibold text-ink mt-0.5">{selectedEdge.basis}</div>
                  </div>
                  <div className="p-3 bg-paper border border-hairline rounded-sm">
                    <div className="text-[10px] text-muted-ink uppercase">State</div>
                    <div
                      className={`font-semibold mt-0.5 ${
                        selectedEdge.state === 'VERIFIED'
                          ? 'text-green-800'
                          : selectedEdge.state === 'CONTRADICTED'
                          ? 'text-red-800'
                          : 'text-ink'
                      }`}
                    >
                      {selectedEdge.state}
                    </div>
                  </div>
                </div>

                {selectedEdge.findingDisplayId && (
                  <div className="p-3 bg-paper border border-hairline rounded-sm space-y-1">
                    <div className="text-[10px] font-mono text-muted-ink uppercase">Finding Ref</div>
                    <div className="font-mono text-xs font-semibold text-ink">
                      {selectedEdge.findingDisplayId}
                    </div>
                  </div>
                )}

                {selectedEdge.citationQuote && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">
                      Grounding Citation Quote
                    </div>
                    <blockquote className="p-3 bg-paper border-l-2 border-copper text-xs font-sans text-ink italic rounded-sm">
                      &quot;{selectedEdge.citationQuote}&quot;
                    </blockquote>
                  </div>
                )}

                {selectedEdge.evidenceId && (
                  <div className="pt-2">
                    <Link
                      href={`/cases/${caseId}/evidence/${selectedEdge.evidenceId}`}
                      className="block text-center py-2 px-3 bg-copper text-paper text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-umber transition-colors shadow-xs"
                    >
                      Examine Original Evidence Item →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {!selectedNode && !selectedEdge && (
              <div className="p-6 text-center text-xs font-mono text-muted-ink bg-paper border border-hairline rounded-sm space-y-2">
                <p>Click on any entity box or connecting edge in the graph to inspect its legal classification, citations, and verification status.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
