import { LLMProvider, LLMMessage, LLMToolDefinition, LLMResponse, LLMToolCall } from './types.js';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    const contents: any[] = [];
    let systemInstruction: any = undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = {
          parts: [{ text: msg.content }]
        };
      } else if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            let argsObj = {};
            try {
              argsObj = JSON.parse(tc.function.arguments);
            } catch {}
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: argsObj
              }
            });
          }
        }
        contents.push({ role: 'model', parts });
      } else if (msg.role === 'tool') {
        let responseContent = {};
        try {
          responseContent = JSON.parse(msg.content);
        } catch {
          responseContent = { result: msg.content };
        }
        contents.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'web_search',
                response: responseContent
              }
            }
          ]
        });
      }
    }

    const payload: any = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.1
      }
    };

    if (tools && tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters
          }))
        }
      ];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText}`);
      }

      const data: any = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error('Gemini returned no candidate.');
      }

      let content: string | null = null;
      const toolCalls: LLMToolCall[] = [];

      for (const part of candidate.content?.parts || []) {
        if (part.text) {
          content = (content ? content + '\n' : '') + part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {})
            }
          });
        }
      }

      return {
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        finish_reason: candidate.finishReason
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
