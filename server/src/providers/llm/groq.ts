import { OpenAIProvider } from './openai.js';

export class GroqProvider extends OpenAIProvider {
  override name = 'groq';

  constructor(
    apiKey: string,
    model: string = 'qwen/qwen3.8-27b',
    baseUrl: string = 'https://api.groq.com/openai/v1'
  ) {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new Error('Groq API key is required for Groq provider.');
    }
    super(apiKey.trim(), model, baseUrl);
  }
}
