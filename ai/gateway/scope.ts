export interface ScopeEntry {
  evidenceId: string;                 // UUID, never sent to a model
  segmentId: string;                  // UUID, never sent to a model
  locatorType: string;
  locator: Record<string, unknown>;   // the STORED locator
}
export type ScopeMap = Map<string, ScopeEntry>;     // key: "EV-101#3"
export const scopeKey = (evidenceDisplayId: string, ordinal: number): string => `${evidenceDisplayId}#${ordinal}`;
