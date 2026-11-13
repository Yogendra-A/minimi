import { config } from '../config.js';
import { LLMProvider } from './llm/types.js';
import { GroqProvider } from './llm/groq.js';
import { GrokProvider } from './llm/grok.js';
import { OpenAIProvider } from './llm/openai.js';
import { GeminiProvider } from './llm/gemini.js';
import { MockLLMProvider } from './llm/mock.js';

import { SearchProvider } from './search/types.js';
import { TavilySearchProvider } from './search/tavily.js';
import { BraveSearchProvider } from './search/brave.js';
import { MockSearchProvider } from './search/mock.js';

export function getLLMProvider(overrideProvider?: string): LLMProvider {
  const provider = overrideProvider || config.LLM_PROVIDER;

  if (provider === 'groq') {
    if (!config.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is required when LLM_PROVIDER is set to groq.');
    }
    return new GroqProvider(config.GROQ_API_KEY, config.GROQ_MODEL, config.GROQ_BASE_URL);
  }
  if (provider === 'grok') {
    if (!config.XAI_API_KEY) {
      throw new Error('XAI_API_KEY is required when LLM_PROVIDER is set to grok.');
    }
    return new GrokProvider(config.XAI_API_KEY, config.GROK_MODEL, config.XAI_BASE_URL);
  }
  if (provider === 'openai' && config.OPENAI_API_KEY) {
    return new OpenAIProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  }
  if (provider === 'gemini' && config.GEMINI_API_KEY) {
    return new GeminiProvider(config.GEMINI_API_KEY, config.GEMINI_MODEL);
  }
  return new MockLLMProvider();
}

export function getSearchProvider(overrideProvider?: string): SearchProvider {
  const provider = overrideProvider || config.SEARCH_PROVIDER;

  if (provider === 'tavily') {
    if (!config.TAVILY_API_KEY) {
      throw new Error('TAVILY_API_KEY is required when SEARCH_PROVIDER is set to tavily.');
    }
    return new TavilySearchProvider(config.TAVILY_API_KEY);
  }
  if (provider === 'brave') {
    if (!config.BRAVE_API_KEY) {
      throw new Error('BRAVE_API_KEY is required when SEARCH_PROVIDER is set to brave.');
    }
    return new BraveSearchProvider(config.BRAVE_API_KEY);
  }
  return new MockSearchProvider();
}
