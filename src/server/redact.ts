import { NormalizedEvent } from '../shared/events'

// Secret/blob patterns replaced with [REDACTED] before anything is stored or pushed.
// Order matters: credential prefixes first, then the greedy long-blob patterns.
const REDACT_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,           // GitHub CLI tokens (ghp_/gho_/ghu_/ghs_/ghr_)
  /github_pat_[A-Za-z0-9_]{20,}/g,         // fine-grained GitHub PATs
  /sk-[A-Za-z0-9]{20,}/g,                  // sk- style API keys
  /AKIA[0-9A-Z]{16}/g,                     // AWS access key ids
  /Bearer\s+[A-Za-z0-9._-]{10,}/g,         // authorization headers
  /[A-Za-z0-9+/]{32,}={0,2}/g,             // long base64 blobs
  /[0-9a-fA-F]{32,}/g                      // long hex blobs
]

export function redactText(s: string): string {
  let out = s
  for (const re of REDACT_PATTERNS) out = out.replace(re, '[REDACTED]')
  return out
}

// Keys allowed by the NormalizedEvent zod schema; everything else is stripped.
const KNOWN_KEYS = new Set(Object.keys(NormalizedEvent.shape))

const MAX_STRING_LENGTH = 300

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Recursively redact secrets in every string (values and object keys). */
function deepRedact(v: unknown): unknown {
  if (typeof v === 'string') return redactText(v)
  if (Array.isArray(v)) return v.map(deepRedact)
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[redactText(k)] = deepRedact(val)
    return out
  }
  return v
}

/** safeDetails is allowlisted to primitive values only — no nested raw payloads. */
function allowlistDetails(v: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(v)) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v)) {
    const t = typeof val
    if (t === 'string' || t === 'number' || t === 'boolean' || val === null) {
      out[redactText(k)] = t === 'string' ? redactText(val as string) : val
    }
    // nested objects/arrays are dropped: raw payloads never reach storage or the browser
  }
  return out
}

function hasOversizedString(v: unknown): boolean {
  if (typeof v === 'string') return v.length > MAX_STRING_LENGTH
  if (Array.isArray(v)) return v.some(hasOversizedString)
  if (isPlainObject(v)) return Object.values(v).some(hasOversizedString)
  return false
}

/**
 * Validate + sanitize an untrusted event candidate.
 * Returns a schema-valid NormalizedEvent (ingestSeq zeroed — the server assigns it)
 * or null when the input must not be forwarded (null/undefined, not an object,
 * any string over 300 chars, or failing the shared zod schema).
 * Unknown keys are stripped, strings are redacted, raw payloads never survive.
 */
export function sanitizeEvent(input: unknown): NormalizedEvent | null {
  if (input === null || input === undefined || !isPlainObject(input)) return null

  // 1. strip keys not in the schema
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!KNOWN_KEYS.has(key)) continue
    cleaned[key] = value
  }

  // 2. reject oversized strings before redaction could mask their length
  if (hasOversizedString(cleaned)) return null

  // 3. redact secrets everywhere; safeDetails is additionally allowlisted
  for (const key of Object.keys(cleaned)) {
    if (key === 'safeDetails') {
      const details = allowlistDetails(cleaned[key])
      if (details !== undefined) cleaned[key] = details
      continue
    }
    cleaned[key] = deepRedact(cleaned[key])
  }

  // ingestSeq is server-assigned; never trust a client-provided value
  cleaned.ingestSeq = 0

  // 4. final schema validation
  const parsed = NormalizedEvent.safeParse(cleaned)
  return parsed.success ? parsed.data : null
}
