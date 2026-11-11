import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';
import { MockLLMProvider } from '../src/providers/llm/mock.js';
import { MockSearchProvider } from '../src/providers/search/mock.js';
import { seedHistoricalConversations } from '../src/db/seed.js';

describe('Bounded Agent Orchestrator', () => {
  let mockLLM: MockLLMProvider;
  let mockSearch: MockSearchProvider;
  let orchestrator: AgentOrchestrator;
  const refTime = '2026-11-11T12:00:00Z';

  beforeEach(() => {
    seedHistoricalConversations(refTime);
    mockLLM = new MockLLMProvider();
    mockSearch = new MockSearchProvider();
    orchestrator = new AgentOrchestrator({
      llmProvider: mockLLM,
      searchProvider: mockSearch,
      timezone: 'Asia/Kolkata'
    });
  });

  it('memory-only question does NOT invoke web_search', async () => {
    const res = await orchestrator.handleMessage(
      'conv-test-1',
      'What did I ask you on Monday?',
      refTime
    );

    expect(mockSearch.searchCount).toBe(0);
    expect(res.searchesExecuted.length).toBe(0);
    expect(res.response).toBeDefined();
  });

  it('"Is this still correct?" retrieves baseline and executes web_search', async () => {
    const res = await orchestrator.handleMessage(
      'conv-test-2',
      'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing since?',
      refTime
    );

    expect(mockSearch.searchCount).toBeGreaterThan(0);
    expect(res.searchesExecuted.length).toBeGreaterThan(0);
    expect(res.citations.length).toBeGreaterThan(0);
    expect(res.response).toContain('HubSpot');
    expect(res.response).toContain('http');
  });

  it('rejects invalid tool arguments server-side', async () => {
    // Queue a response with empty query in tool arguments
    mockLLM.customResponses = [
      {
        content: null,
        tool_calls: [
          {
            id: 'call_invalid_args',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: JSON.stringify({ query: '' }) // empty string violates zod schema
            }
          }
        ]
      },
      {
        content: 'I noticed the search arguments were invalid, so here is the explanation.'
      }
    ];

    const res = await orchestrator.handleMessage(
      'conv-test-3',
      'Check pricing updates for Postgres',
      refTime
    );

    // Search provider should not have executed the invalid query
    expect(mockSearch.searchCount).toBe(0);
    expect(res.response).toContain('explanation');
  });

  it('prevents duplicate searches for the exact same query in the same turn', async () => {
    mockLLM.customResponses = [
      {
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: JSON.stringify({ query: 'hubspot pricing 2026' })
            }
          },
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: JSON.stringify({ query: 'hubspot pricing 2026' }) // duplicate query!
            }
          }
        ]
      },
      {
        content: 'Final comparative answer after deduplicated search.'
      }
    ];

    await orchestrator.handleMessage(
      'conv-test-4',
      'Check HubSpot pricing changes',
      refTime
    );

    // Should only have executed 1 actual search, not 2
    expect(mockSearch.searchCount).toBe(1);
  });

  it('handles search provider failure/timeout gracefully without crashing', async () => {
    mockSearch.shouldTimeout = true;

    const res = await orchestrator.handleMessage(
      'conv-test-5',
      'Has Postgres pricing changed today?',
      refTime
    );

    expect(res).toBeDefined();
    expect(res.response).toBeDefined();
  });

  it('clearly explains when historical baseline is missing in memory', async () => {
    // Ask about a topic never discussed before
    const res = await orchestrator.handleMessage(
      'conv-test-6',
      'Is the pricing for Kubernetes clusters still what we discussed?',
      refTime
    );

    expect(res.response).toContain('historical baseline');
  });
});
