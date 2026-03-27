import type { ClaudeJsonOutput } from '../types/agent';

/**
 * 5-level JSON parsing strategy for Claude CLI output.
 * Handles truncated/malformed JSON from timeouts and abnormal exits.
 */

export interface ParsedClaudeOutput {
  json: ClaudeJsonOutput | null;
  costUsd: number;
  source: 'exact' | 'result-marker' | 'tail-json' | 'truncated-fix' | 'stderr-fallback' | 'none';
}

/**
 * Parse Claude JSON output with 5-level fallback strategy:
 * 1. Exact match: entire stdout is valid JSON
 * 2. Result marker: regex for {"type":"result"...}
 * 3. Tail JSON: find matching {} from end of output
 * 4. Truncated fix: find {"type":"result" prefix and attempt to close brackets
 * 5. Stderr fallback: extract cost from stderr
 */
export function parseClaudeJson(stdout: string, stderr?: string): ParsedClaudeOutput {
  const trimmed = stdout.trim();

  // Level 1: Exact match — entire stdout is a JSON object
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && parsed.type === 'result') {
      return { json: parsed as ClaudeJsonOutput, costUsd: parsed.cost_usd ?? 0, source: 'exact' };
    }
  } catch {
    // Not valid JSON, continue to next level
  }

  // Level 2: Result marker — regex find {"type":"result"...}
  try {
    const match = trimmed.match(/\{[\s\S]*"type"\s*:\s*"result"[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { json: parsed as ClaudeJsonOutput, costUsd: parsed.cost_usd ?? 0, source: 'result-marker' };
    }
  } catch {
    // Parse failed, continue
  }

  // Level 3: Tail JSON — find matching {} from end of output
  try {
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace >= 0) {
      // Walk backwards to find the matching opening brace
      let depth = 0;
      let start = -1;
      for (let i = lastBrace; i >= 0; i--) {
        if (trimmed[i] === '}') depth++;
        if (trimmed[i] === '{') depth--;
        if (depth === 0) {
          start = i;
          break;
        }
      }
      if (start >= 0) {
        const candidate = trimmed.slice(start, lastBrace + 1);
        const parsed = JSON.parse(candidate);
        if (parsed && parsed.type === 'result') {
          return { json: parsed as ClaudeJsonOutput, costUsd: parsed.cost_usd ?? 0, source: 'tail-json' };
        }
      }
    }
  } catch {
    // Continue
  }

  // Level 4: Truncated fix — find {"type":"result" prefix and try to close it
  try {
    const idx = trimmed.indexOf('{"type":"result"');
    if (idx < 0) {
      // Also try with spaces
      const idxSpaced = trimmed.indexOf('"type": "result"');
      if (idxSpaced >= 0) {
        // backtrack to find the opening {
        const openBrace = trimmed.lastIndexOf('{', idxSpaced);
        if (openBrace >= 0) {
          const partial = trimmed.slice(openBrace);
          const fixed = tryFixTruncatedJson(partial);
          if (fixed) {
            return { json: fixed as ClaudeJsonOutput, costUsd: fixed.cost_usd ?? 0, source: 'truncated-fix' };
          }
        }
      }
    } else {
      const partial = trimmed.slice(idx);
      const fixed = tryFixTruncatedJson(partial);
      if (fixed) {
        return { json: fixed as ClaudeJsonOutput, costUsd: fixed.cost_usd ?? 0, source: 'truncated-fix' };
      }
    }
  } catch {
    // Continue
  }

  // Level 5: Stderr fallback — extract cost from stderr
  if (stderr) {
    const costUsd = extractCostFromStderr(stderr);
    return { json: null, costUsd, source: costUsd > 0 ? 'stderr-fallback' : 'none' };
  }

  return { json: null, costUsd: 0, source: 'none' };
}

/**
 * Try to fix truncated JSON by counting open braces/brackets and closing them.
 */
function tryFixTruncatedJson(partial: string): ClaudeJsonOutput | null {
  // Remove trailing incomplete strings (e.g., text after last complete value)
  let cleaned = partial;

  // Count unmatched braces and brackets
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  // If we're inside a string, try to close it
  if (inString) {
    cleaned += '"';
  }

  // Close any open brackets then braces
  while (brackets > 0) {
    cleaned += ']';
    brackets--;
  }
  while (braces > 0) {
    cleaned += '}';
    braces--;
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && parsed.type === 'result') {
      return parsed;
    }
  } catch {
    // Last attempt: try truncating to last complete key-value pair
    try {
      // Find last comma or colon that's not in a string
      const lastCleanBreak = findLastCleanBreak(partial);
      if (lastCleanBreak > 0) {
        let truncated = partial.slice(0, lastCleanBreak);
        // Close any open structures
        let b = 0, k = 0, s = false, esc = false;
        for (let i = 0; i < truncated.length; i++) {
          const c = truncated[i];
          if (esc) { esc = false; continue; }
          if (c === '\\' && s) { esc = true; continue; }
          if (c === '"') { s = !s; continue; }
          if (s) continue;
          if (c === '{') b++;
          else if (c === '}') b--;
          else if (c === '[') k++;
          else if (c === ']') k--;
        }
        while (k > 0) { truncated += ']'; k--; }
        while (b > 0) { truncated += '}'; b--; }
        const parsed2 = JSON.parse(truncated);
        if (parsed2 && parsed2.type === 'result') {
          return parsed2;
        }
      }
    } catch {
      // Give up
    }
  }

  return null;
}

/**
 * Find the position of the last comma that's not inside a string.
 */
function findLastCleanBreak(text: string): number {
  let lastComma = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === ',') lastComma = i;
  }

  return lastComma;
}

/**
 * Extract cost from stderr output.
 * Looks for patterns like "cost: $X.XX" or "Cost: $X.XXXX"
 */
export function extractCostFromStderr(stderr: string): number {
  // Pattern: cost: $0.1234 or Cost: $1.23 or total cost: $0.05
  const patterns = [
    /cost[:\s]+\$(\d+\.?\d*)/i,
    /\$(\d+\.\d{2,6})\s*(?:USD|total)/i,
    /total[:\s]+\$(\d+\.?\d*)/i,
  ];

  for (const pattern of patterns) {
    const match = stderr.match(pattern);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val >= 0) return val;
    }
  }

  return 0;
}
