import { performance } from 'perf_hooks';
import { EVALUATION_DATASET } from './dataset.js';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { MockLLMProvider } from '../providers/llm/mock.js';
import { MockSearchProvider } from '../providers/search/mock.js';
import { seedHistoricalConversations } from '../db/seed.js';

export async function runEvaluationSuite() {
  const refTime = '2026-11-11T12:00:00Z'; // Fixed Wednesday reference instant
  seedHistoricalConversations(refTime);

  const mockLLM = new MockLLMProvider();
  const mockSearch = new MockSearchProvider();
  const orchestrator = new AgentOrchestrator({
    llmProvider: mockLLM,
    searchProvider: mockSearch,
    timezone: 'Asia/Kolkata'
  });

  console.log('================================================================');
  console.log('       MINIMI CHAT AGENT --- EVALUATION BENCHMARK SUITE         ');
  console.log(`       Test cases: ${EVALUATION_DATASET.length} | Timezone: Asia/Kolkata`);
  console.log('================================================================\n');

  let passedCases = 0;
  let totalLatencyMs = 0;
  let toolBehaviorMatches = 0;
  let validCitationsCount = 0;
  let totalCitationsEvaluated = 0;

  const resultsTable: any[] = [];

  for (const tc of EVALUATION_DATASET) {
    mockSearch.searchCount = 0;
    const startTime = performance.now();

    const result = await orchestrator.handleMessage(`eval-conv-${tc.id}`, tc.prompt, refTime);
    const latency = Math.round(performance.now() - startTime);
    totalLatencyMs += latency;

    const toolUsed = mockSearch.searchCount > 0;
    const toolMatch = toolUsed === tc.expectedToolCall;
    if (toolMatch) toolBehaviorMatches++;

    // Check keyword containment
    const textToCheck = (result.response + ' ' + (result.citations.map((c) => c.url).join(' '))).toLowerCase();
    const keywordMatches = tc.expectedKeywords.every((kw) => textToCheck.includes(kw.toLowerCase()));

    // Citation validity
    let citationsValid = true;
    for (const cite of result.citations) {
      totalCitationsEvaluated++;
      if (!cite.url.startsWith('http://') && !cite.url.startsWith('https://')) {
        citationsValid = false;
      } else {
        validCitationsCount++;
      }
    }

    const passed = toolMatch && (tc.expectedKeywords.length === 0 || keywordMatches) && citationsValid;
    if (passed) passedCases++;

    resultsTable.push({
      ID: tc.id,
      Category: tc.category,
      'Tool Match': toolMatch ? 'PASS' : 'FAIL',
      'Content Match': keywordMatches ? 'PASS' : 'FAIL',
      'Latency (ms)': latency,
      Result: passed ? 'PASS' : 'FAIL'
    });
  }

  console.table(resultsTable);

  const avgLatency = Math.round(totalLatencyMs / EVALUATION_DATASET.length);
  const passRate = Math.round((passedCases / EVALUATION_DATASET.length) * 100);
  const toolAccuracy = Math.round((toolBehaviorMatches / EVALUATION_DATASET.length) * 100);
  const citationAccuracy = totalCitationsEvaluated > 0
    ? Math.round((validCitationsCount / totalCitationsEvaluated) * 100)
    : 100;

  console.log('----------------------------------------------------------------');
  console.log(`Total Cases Tested       : ${EVALUATION_DATASET.length}`);
  console.log(`Passed Cases              : ${passedCases} / ${EVALUATION_DATASET.length} (${passRate}%)`);
  console.log(`Tool-Call Accuracy        : ${toolAccuracy}%`);
  console.log(`Citation Validity Rate    : ${citationAccuracy}%`);
  console.log(`Average Latency           : ${avgLatency} ms`);
  console.log('================================================================\n');

  return {
    total: EVALUATION_DATASET.length,
    passed: passedCases,
    passRate,
    toolAccuracy,
    citationAccuracy,
    avgLatency
  };
}

if (process.argv[1] && process.argv[1].includes('runEvaluation.ts')) {
  runEvaluationSuite().then(() => process.exit(0)).catch((err) => {
    console.error('Evaluation suite failed:', err);
    process.exit(1);
  });
}
