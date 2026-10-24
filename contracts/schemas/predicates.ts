import type { Predicate } from './payloads';

export const PREDICATE_CUES: Record<Predicate, RegExp[]> = {
  deletes_data: [
    /\bdelet/i,
    /\beras/i,
    /\bremov/i,
    /\bpurg/i,
    /\bdestroy/i,
    /\bdestruct/i,
  ],
  retains_data: [
    /\bretain/i,
    /\bkeep\b/i,
    /\bkept\b/i,
    /\bpreserv/i,
    /\bremain/i,
  ],
  holds_data: [
    /\bhold/i,
    /\bstore/i,
    /\bprocess/i,
    /\bhave\b/i,
    /\bhas\b/i,
    /\bhad\b/i,
  ],
  shares_data_with: [
    /\bshar/i,
    /\bdisclos/i,
    /\btransmit/i,
    /\btransfer/i,
    /\bsent\s+to\b/i,
  ],
  acknowledges_request: [
    /\breceiv/i,
    /\backnowledg/i,
  ],
  extends_deadline: [
    /\bextend/i,
    /\bextension/i,
    /\badditional\s+time\b/i,
  ],
  requires_identity_verification: [
    /\bverify\s+your\s+identity\b/i,
    /\bproof\s+of\s+identity\b/i,
    /\bverify\b/i,
    /\bverification\b/i,
  ],
  provides_data: [
    /\bprovid/i,
    /\battach/i,
    /\benclos/i,
    /\bcopy\s+of\s+your\s+data\b/i,
  ],
};

export const NEGATION_CUES = [
  'not',
  'never',
  'no',
  'cannot',
  "n't",
  'without',
  'none',
  'nor',
] as const;

export const HEDGE_CUES = [
  'if',
  'unless',
  'would',
  'may',
  'might',
  'could',
  'should',
  'will',
  'subject to',
] as const;
