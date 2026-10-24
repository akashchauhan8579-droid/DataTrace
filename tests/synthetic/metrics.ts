/**
 * Layered metrics calculation — Spec 18.3
 *
 * Real measurements computed from synthetic pipeline runs.
 * Targets are benchmark goals; measurements reflect actual run data.
 */

export interface MetricEntry {
  layer: string;
  metric: string;
  target: string;
  measured: number | string;
  passed: boolean;
}

export interface PipelineMetrics {
  schemaAdherence: number;       // candidates passing Zod ÷ candidates returned (target >= 95%)
  citationResolution: number;    // citations resolved by the Gateway ÷ citations proposed (target >= 95%)
  citationPrecision: number;     // citations passing citation_integrity.v1 ÷ citations resolved (target >= 95%)
  extractionRecall: number;      // golden claims found ÷ golden claims (target >= 90%)
  ruleAccuracy: number;          // rule outcomes matching the golden suite (target 100%)
  falseVerifiedCount: number;    // golden claims wrongly VERIFIED (target 0)
  groundingIntegrity: number;    // exported assertions backed by valid findings (target 100%)
  crossCaseIsolation: number;    // unauthorized reads (target 0)
}

export interface MetricRunInput {
  candidatesReturned: number;
  candidatesPassedSchema: number;
  citationsProposed: number;
  citationsResolved: number;
  citationsValid: number;
  goldenClaimsTotal: number;
  goldenClaimsFound: number;
  ruleEvaluationsTotal: number;
  ruleEvaluationsMatchingGolden: number;
  falseVerifiedCount: number;
  exportedAssertionsTotal: number;
  exportedAssertionsValid: number;
  unauthorizedCrossCaseReads: number;
}

export function computeMetrics(input: MetricRunInput): PipelineMetrics {
  const schemaAdherence =
    input.candidatesReturned > 0
      ? input.candidatesPassedSchema / input.candidatesReturned
      : 1.0;

  const citationResolution =
    input.citationsProposed > 0
      ? input.citationsResolved / input.citationsProposed
      : 1.0;

  const citationPrecision =
    input.citationsResolved > 0
      ? input.citationsValid / input.citationsResolved
      : 1.0;

  const extractionRecall =
    input.goldenClaimsTotal > 0
      ? input.goldenClaimsFound / input.goldenClaimsTotal
      : 1.0;

  const ruleAccuracy =
    input.ruleEvaluationsTotal > 0
      ? input.ruleEvaluationsMatchingGolden / input.ruleEvaluationsTotal
      : 1.0;

  const groundingIntegrity =
    input.exportedAssertionsTotal > 0
      ? input.exportedAssertionsValid / input.exportedAssertionsTotal
      : 1.0;

  return {
    schemaAdherence,
    citationResolution,
    citationPrecision,
    extractionRecall,
    ruleAccuracy,
    falseVerifiedCount: input.falseVerifiedCount,
    groundingIntegrity,
    crossCaseIsolation: input.unauthorizedCrossCaseReads,
  };
}

export function evaluateMetricEntries(metrics: PipelineMetrics): MetricEntry[] {
  const toPct = (val: number): string => `${(val * 100).toFixed(1)}%`;

  return [
    {
      layer: 'Schema adherence',
      metric: 'candidates passing Zod ÷ candidates returned',
      target: '≥ 95%',
      measured: toPct(metrics.schemaAdherence),
      passed: metrics.schemaAdherence >= 0.95,
    },
    {
      layer: 'Citation resolution',
      metric: 'citations resolved by Gateway ÷ citations proposed',
      target: '≥ 95%',
      measured: toPct(metrics.citationResolution),
      passed: metrics.citationResolution >= 0.95,
    },
    {
      layer: 'Citation precision',
      metric: 'citations passing citation_integrity.v1 ÷ citations resolved',
      target: '≥ 95%',
      measured: toPct(metrics.citationPrecision),
      passed: metrics.citationPrecision >= 0.95,
    },
    {
      layer: 'Extraction recall',
      metric: 'golden claims found ÷ golden claims',
      target: '≥ 90%',
      measured: toPct(metrics.extractionRecall),
      passed: metrics.extractionRecall >= 0.90,
    },
    {
      layer: 'Rule accuracy',
      metric: 'rule outcomes matching golden suite',
      target: '100%',
      measured: toPct(metrics.ruleAccuracy),
      passed: metrics.ruleAccuracy === 1.0,
    },
    {
      layer: 'False VERIFIED',
      metric: 'golden claims wrongly VERIFIED',
      target: '0',
      measured: metrics.falseVerifiedCount,
      passed: metrics.falseVerifiedCount === 0,
    },
    {
      layer: 'Grounding integrity',
      metric: 'exported assertions backed by valid findings',
      target: '100%',
      measured: toPct(metrics.groundingIntegrity),
      passed: metrics.groundingIntegrity === 1.0,
    },
    {
      layer: 'Cross-case isolation',
      metric: 'unauthorized reads',
      target: '0',
      measured: metrics.crossCaseIsolation,
      passed: metrics.crossCaseIsolation === 0,
    },
  ];
}

export function formatMetricsReport(metrics: PipelineMetrics): string {
  const entries = evaluateMetricEntries(metrics);
  const lines: string[] = [
    '========================================================================',
    '                         DATATRACE PIPELINE METRICS                     ',
    '========================================================================',
    'Layer               | Metric Target | Measured | Result                 ',
    '--------------------+---------------+----------+------------------------',
  ];

  for (const e of entries) {
    const layer = e.layer.padEnd(19, ' ');
    const target = e.target.padEnd(13, ' ');
    const measured = String(e.measured).padEnd(8, ' ');
    const status = e.passed ? 'PASS' : 'FAIL';
    lines.push(`${layer} | ${target} | ${measured} | ${status}`);
  }

  lines.push('========================================================================');
  return lines.join('\n');
}
