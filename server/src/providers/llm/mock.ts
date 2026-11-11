import { LLMProvider, LLMMessage, LLMToolDefinition, LLMResponse, LLMToolCall } from './types.js';

export class MockLLMProvider implements LLMProvider {
  name = 'mock';
  public callCount = 0;
  public customResponses: LLMResponse[] = [];

  async generate(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    this.callCount++;

    if (this.customResponses.length > 0) {
      return this.customResponses.shift()!;
    }

    const lastMsg = messages[messages.length - 1];
    const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
    const userMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const qLower = userMsg.toLowerCase();
    const sysLower = systemMsg.toLowerCase();

    // If the last message is a tool response, synthesize the final comparative answer
    if (lastMsg.role === 'tool') {
      let toolData: any = {};
      try {
        toolData = JSON.parse(lastMsg.content);
      } catch {
        toolData = { results: [] };
      }

      const results = toolData.results || [];
      const sourcesText = results
        .map((r: any) => `* [${r.title}](${r.url}) (${r.domain})`)
        .join('\n');

      // Check if baseline for this specific query was present in context
      const hasBaseline = systemMsg.includes('Retrieved Conversation Memory:') &&
        !systemMsg.includes('(No matching conversation or factual records found') &&
        (!qLower.includes('kubernetes') || sysLower.includes('kubernetes')) &&
        (!qLower.includes('snowflake') || sysLower.includes('snowflake'));

      if (!hasBaseline) {
        return {
          content: `I searched for current information, but I do not have a prior conversation or historical baseline recorded in memory for this topic. Without a recorded baseline, I cannot determine what has changed.\n\n### Current Findings:\n${results.map((r: any) => `- **${r.title}**: ${r.snippet}`).join('\n')}\n\n**Sources:**\n${sourcesText}`
        };
      }

      return {
        content: `Based on a like-for-like comparison between your previous discussion and current primary sources:\n\n### Findings:\n${results.map((r: any) => `- **${r.title}**: ${r.snippet}`).join('\n\n')}\n\n### Comparison:\n- **Pricing & Status**: Verified against current official documentation. Both baseline and current primary sources indicate consistent terms for matching tiers.\n\n### Sources:\n${sourcesText}`
      };
    }

    // Inspect user question
    const isChangeOrFreshnessQuery =
      qLower.includes('change') ||
      qLower.includes('still correct') ||
      qLower.includes('update') ||
      qLower.includes('today') ||
      qLower.includes('since') ||
      (qLower.includes('still') && (qLower.includes('discussed') || qLower.includes('agreed') || qLower.includes('said'))) ||
      (qLower.includes('pricing') && (qLower.includes('check') || qLower.includes('current')));

    // Memory-only queries
    const isMemoryOnlyQuery =
      (qLower.includes('what did i ask') ||
       qLower.includes('what were') ||
       qLower.includes('show me') ||
       qLower.includes('find our discussion') ||
       qLower.includes('what about their') ||
       qLower.includes('what did we discuss') ||
       qLower.includes('what did we talk')) &&
      !qLower.includes('still correct') &&
      !qLower.includes('changed') &&
      !qLower.includes('change') &&
      !qLower.includes('today');

    if (isChangeOrFreshnessQuery && !isMemoryOnlyQuery && tools && tools.length > 0) {
      let searchQuery = 'pricing updates current';
      if (qLower.includes('postgres') || qLower.includes('neon') || qLower.includes('supabase')) {
        searchQuery = 'Postgres hosting pricing Neon Supabase';
      } else if (qLower.includes('crm') || qLower.includes('salesforce') || qLower.includes('hubspot') || qLower.includes('pipedrive')) {
        searchQuery = 'CRM tools pricing updates 2026';
      } else if (qLower.includes('kubernetes')) {
        searchQuery = 'Kubernetes cluster hosting pricing';
      } else if (qLower.includes('snowflake')) {
        searchQuery = 'Snowflake warehouse hosting pricing';
      } else if (sysLower.includes('neon') || sysLower.includes('postgres') || sysLower.includes('supabase')) {
        searchQuery = 'Postgres hosting pricing Neon Supabase';
      } else if (sysLower.includes('crm') || sysLower.includes('hubspot')) {
        searchQuery = 'CRM tools pricing updates 2026';
      } else {
        searchQuery = userMsg.replace(/(\?|what|did|i|ask|you|is|still|correct|today)/gi, '').trim() || 'updates';
      }

      const toolCall: LLMToolCall = {
        id: `call_${Date.now()}_mock`,
        type: 'function',
        function: {
          name: 'web_search',
          arguments: JSON.stringify({ query: searchQuery, recency: 'month' })
        }
      };

      return {
        content: null,
        tool_calls: [toolCall]
      };
    }

    // Memory-only or conversational response
    if (systemMsg.includes('Retrieved Conversation Memory:') && !systemMsg.includes('(No matching conversation or factual records found')) {
      const memorySlice = systemMsg.split('### Retrieved Conversation Memory:')[1]?.split('### Core Rules')[0]?.trim() || '';
      return {
        content: `Based on our previous conversation records:\n\n${memorySlice}\n\nThis reflects your recorded history and fact observations.`
      };
    }

    if (qLower.includes('starter tier') || qLower.includes('follow-up')) {
      return {
        content: 'Regarding the starter tier we discussed: the pricing plan begins at $20/user/month.'
      };
    }

    return {
      content: `Hello! I am your AI assistant with memory of our past conversations and real-time web search capabilities. How can I help you today?`
    };
  }
}
