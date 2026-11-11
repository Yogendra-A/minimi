import { LLMProvider, LLMMessage, LLMToolDefinition, LLMResponse } from './types.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

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
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errText}`);
      }

      const data: any = await res.json();
      const choice = data.choices?.[0];
      if (!choice) {
        throw new Error('OpenAI returned no completion choice.');
      }

      const msg = choice.message;
      return {
        content: msg.content || null,
        tool_calls: msg.tool_calls,
        finish_reason: choice.finish_reason,
        usage: data.usage
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
