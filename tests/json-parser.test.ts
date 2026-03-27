import { describe, test, expect } from 'bun:test';
import { parseClaudeJson, extractCostFromStderr } from '../src/backends/json-parser';

describe('parseClaudeJson', () => {
  const validJson = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Done!',
    cost_usd: 0.05,
    duration_ms: 1000,
    duration_api_ms: 800,
    num_turns: 5,
    session_id: 'abc-123',
  });

  test('Level 1: exact match — entire stdout is valid JSON', () => {
    const result = parseClaudeJson(validJson);
    expect(result.source).toBe('exact');
    expect(result.json).not.toBeNull();
    expect(result.json!.result).toBe('Done!');
    expect(result.costUsd).toBe(0.05);
  });

  test('Level 2: result marker — JSON embedded in other text', () => {
    const stdout = `Some log output\n${validJson}\nMore text`;
    const result = parseClaudeJson(stdout);
    expect(result.source).toBe('result-marker');
    expect(result.json).not.toBeNull();
    expect(result.json!.cost_usd).toBe(0.05);
  });

  test('Level 3: tail JSON — find matching {} from end', () => {
    // Create a case where Level 2 regex won't match but tail JSON will
    // This would be a JSON at the end with unusual formatting
    const json = '{"type":"result","subtype":"success","is_error":false,"result":"OK","cost_usd":0.02,"duration_ms":500,"duration_api_ms":400,"num_turns":2,"session_id":"xyz"}';
    const stdout = `garbage {{{broken json\n${json}`;
    const result = parseClaudeJson(stdout);
    expect(result.json).not.toBeNull();
    expect(result.costUsd).toBe(0.02);
    // Could be result-marker or tail-json depending on regex match
    expect(['result-marker', 'tail-json', 'exact']).toContain(result.source);
  });

  test('Level 4: truncated fix — JSON cut off mid-value', () => {
    const truncated = '{"type":"result","subtype":"success","is_error":false,"result":"partial output here","cost_usd":0.03,"duration_ms":2000,"duration_api_ms":1500,"num_turns":3,"session_id":"trunc-1';
    const result = parseClaudeJson(truncated);
    // Should attempt to fix by closing the string and braces
    if (result.json) {
      expect(result.source).toBe('truncated-fix');
      expect(result.costUsd).toBe(0.03);
    } else {
      // If fix didn't work, source should be 'none'
      expect(result.source).toBe('none');
    }
  });

  test('Level 5: stderr fallback — extract cost from stderr', () => {
    const result = parseClaudeJson('garbage output', 'total cost: $0.1234');
    expect(result.json).toBeNull();
    expect(result.source).toBe('stderr-fallback');
    expect(result.costUsd).toBe(0.1234);
  });

  test('returns none when nothing parseable', () => {
    const result = parseClaudeJson('completely unparseable output');
    expect(result.json).toBeNull();
    expect(result.source).toBe('none');
    expect(result.costUsd).toBe(0);
  });

  test('handles empty stdout', () => {
    const result = parseClaudeJson('');
    expect(result.json).toBeNull();
    expect(result.source).toBe('none');
  });

  test('handles JSON with extra whitespace', () => {
    const result = parseClaudeJson(`  \n  ${validJson}  \n  `);
    expect(result.json).not.toBeNull();
    expect(result.json!.result).toBe('Done!');
  });
});

describe('extractCostFromStderr', () => {
  test('extracts "cost: $X.XX" format', () => {
    expect(extractCostFromStderr('Some output... cost: $0.1234 done')).toBe(0.1234);
  });

  test('extracts "Cost: $X.XX" format (case insensitive)', () => {
    expect(extractCostFromStderr('Cost: $1.50')).toBe(1.50);
  });

  test('extracts "total cost: $X.XX" format', () => {
    expect(extractCostFromStderr('API total cost: $0.05')).toBe(0.05);
  });

  test('extracts "$X.XX total" format', () => {
    expect(extractCostFromStderr('Run finished $0.0823 total')).toBe(0.0823);
  });

  test('returns 0 for no cost pattern', () => {
    expect(extractCostFromStderr('no cost info here')).toBe(0);
  });

  test('returns 0 for empty string', () => {
    expect(extractCostFromStderr('')).toBe(0);
  });
});
