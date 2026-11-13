import { OpenAIProvider } from './openai.js';

export class GrokProvider extends OpenAIProvider {
  override name = 'grok';

  constructor(
    apiKey: string,
    model: string = 'grok-2-latest',
    baseUrl: string = 'https://api.x.ai/v1'
  ) {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new Error('xAI API key is required for Grok provider.');
    }
    super(apiKey.trim(), model, baseUrl);
  }
}
