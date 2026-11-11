import { describe, it, expect } from 'vitest';
import { runEvaluationSuite } from '../src/eval/runEvaluation.js';

describe('System Evaluation & Benchmark Verification', () => {
  it('passes evaluation cases with high tool-call accuracy and citation validity', async () => {
    const stats = await runEvaluationSuite();
    expect(stats.total).toBeGreaterThanOrEqual(20);
    expect(stats.toolAccuracy).toBeGreaterThanOrEqual(90);
    expect(stats.citationAccuracy).toBe(100);
    expect(stats.passRate).toBeGreaterThanOrEqual(90);
  });
});
