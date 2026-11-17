import { LLMProvider, LLMMessage, LLMToolDefinition, LLMResponse, LLMToolCall } from './types.js';
import { parseToolCallsFromText } from '../../agent/tools.js';

export class OpenAIProvider implements LLMProvider {
  name: string = 'openai';
  protected apiKey: string;
  protected model: string;
  protected baseUrl: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini', baseUrl: string = 'https://api.openai.com/v1') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async generate(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    const payload: Record<string, any> = {
      model: this.model,
      messages: messages.map((m) => {
        const item: Record<string, any> = {
          role: m.role,
          content: m.content
        };
        if (m.name) item.name = m.name;
        if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
        if (m.tool_calls) item.tool_calls = m.tool_calls;
        return item;
      }),
      temperature: 0.1
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError' || controller.signal.aborted) {
          throw new Error(`${this.name.toUpperCase()} request timed out after 30000ms`);
        }
        throw new Error(`${this.name.toUpperCase()} network request failed: ${fetchErr.message}`);
      }

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429) {
          throw new Error(`${this.name.toUpperCase()} rate limit exceeded (429): ${errText}`);
        }
        throw new Error(`${this.name.toUpperCase()} API error (${res.status}): ${errText}`);
      }

      let data: any;
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        throw new Error(`${this.name.toUpperCase()} returned invalid JSON response: ${jsonErr.message}`);
      }

      const choice = data.choices?.[0];
      if (!choice) {
        throw new Error(`${this.name.toUpperCase()} returned no completion choice.`);
      }

      const msg = choice.message;
      let toolCalls: LLMToolCall[] | undefined = msg.tool_calls;
      let content: string | null = msg.content || null;

      // Fallback: If model outputted tool call XML/JSON tags in text content
      if ((!toolCalls || toolCalls.length === 0) && content && content.includes('<tool_call>')) {
        const parsed = parseToolCallsFromText(content);
        if (parsed.length > 0) {
          toolCalls = parsed;
          const cleaned = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
          content = cleaned.length > 0 ? cleaned : null;
        }
      }

      return {
        content,
        tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        finish_reason: choice.finish_reason,
        usage: data.usage
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
