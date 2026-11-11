import { config } from '../config.js';
import { LLMProvider } from './llm/types.js';
import { OpenAIProvider } from './llm/openai.js';
import { GeminiProvider } from './llm/gemini.js';
import { MockLLMProvider } from './llm/mock.js';

import { SearchProvider } from './search/types.js';
import { TavilySearchProvider } from './search/tavily.js';
import { BraveSearchProvider } from './search/brave.js';
import { MockSearchProvider } from './search/mock.js';

export function getLLMProvider(overrideProvider?: string): LLMProvider {
  const provider = overrideProvider || config.LLM_PROVIDER;

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

  if (provider === 'tavily' && config.TAVILY_API_KEY) {
    return new TavilySearchProvider(config.TAVILY_API_KEY);
  }
  if (provider === 'brave' && config.BRAVE_API_KEY) {
    return new BraveSearchProvider(config.BRAVE_API_KEY);
  }
  return new MockSearchProvider();
}
