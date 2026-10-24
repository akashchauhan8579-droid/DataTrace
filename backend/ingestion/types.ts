import type { LocatorType } from '../../contracts/schemas/locators';

export type SourceType = 'EMAIL' | 'DOCUMENT' | 'SCREENSHOT' | 'MANUAL_LOG';
export type ProcessingStatus = 'PENDING' | 'PROCESSED' | 'FAILED' | 'QUARANTINED';
export type ArtifactType = 'NORMALIZED_TEXT' | 'METADATA_JSON' | 'TRANSCRIPT';
export type ExtractionMethod = 'PARSER' | 'AI_VISION' | 'MANUAL';

export interface ExtractedSegment {
  ordinal: number;
  locatorType: LocatorType;
  locator: Record<string, unknown>;
  segmentText: string;
}

export interface ExtractedArtifact {
  artifactType: ArtifactType;
  extractionMethod: ExtractionMethod;
  version: number;
  rawContent: string;
  createdByProcess: string;
}

export interface IngestionResult {
  sourceType: SourceType;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  capturedAt?: string; // ISO date string if extracted from headers
  artifacts: ExtractedArtifact[];
  segments: ExtractedSegment[];
}

export interface ParsedEmailMetadata {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  messageId?: string;
  inReplyTo?: string;
  headers: Record<string, string | string[] | undefined>;
}
