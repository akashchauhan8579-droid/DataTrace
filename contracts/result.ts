export type Result<T, R extends string = string> =
  | { ok: true; value: T }
  | { ok: false; reason: R; detail?: string };
