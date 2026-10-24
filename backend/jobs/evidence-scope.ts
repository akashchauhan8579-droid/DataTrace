export interface EvidenceScopeEntry {
  evidenceDisplayId: string;
  segmentOrdinals: number[] | null;
}

export function parseEvidenceScope(value: unknown): EvidenceScopeEntry[] {
  const entries: EvidenceScopeEntry[] = [];

  if (typeof value === 'string') {
    entries.push({ evidenceDisplayId: value, segmentOrdinals: null });
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        entries.push({ evidenceDisplayId: entry, segmentOrdinals: null });
        continue;
      }

      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('evidenceDisplayId' in entry) ||
        typeof entry.evidenceDisplayId !== 'string' ||
        !('segmentOrdinals' in entry) ||
        !Array.isArray(entry.segmentOrdinals) ||
        entry.segmentOrdinals.length === 0 ||
        !entry.segmentOrdinals.every(
          (ordinal: unknown) =>
            typeof ordinal === 'number' && Number.isSafeInteger(ordinal) && ordinal > 0
        )
      ) {
        throw new Error('Invalid input_evidence_scope entry');
      }

      entries.push({
        evidenceDisplayId: entry.evidenceDisplayId,
        segmentOrdinals: [...new Set(entry.segmentOrdinals as number[])],
      });
    }
  } else {
    throw new Error('input_evidence_scope must be a display ID or an array');
  }

  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.evidenceDisplayId.trim() || seen.has(entry.evidenceDisplayId)) {
      throw new Error('input_evidence_scope contains an empty or duplicate evidence ID');
    }
    seen.add(entry.evidenceDisplayId);
  }

  return entries;
}
