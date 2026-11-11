import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Load root .env or server .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const configSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  TIMEZONE: z.string().default('Asia/Kolkata'),
  DATABASE_URL: z.string().default('./data/minimi.db'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // LLM settings
  LLM_PROVIDER: z.enum(['openai', 'gemini', 'mock']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),

  // Search settings
  SEARCH_PROVIDER: z.enum(['tavily', 'brave', 'serpapi', 'mock']).default('mock'),
  TAVILY_API_KEY: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),

  // Embeddings settings
  EMBEDDING_PROVIDER: z.enum(['openai', 'mock']).default('mock')
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

// Auto-select provider if API key is supplied and provider is default mock
const raw = parsed.data;
if (raw.LLM_PROVIDER === 'mock' && raw.OPENAI_API_KEY) {
  raw.LLM_PROVIDER = 'openai';
} else if (raw.LLM_PROVIDER === 'mock' && raw.GEMINI_API_KEY) {
  raw.LLM_PROVIDER = 'gemini';
}

if (raw.SEARCH_PROVIDER === 'mock' && raw.TAVILY_API_KEY) {
  raw.SEARCH_PROVIDER = 'tavily';
} else if (raw.SEARCH_PROVIDER === 'mock' && raw.BRAVE_API_KEY) {
  raw.SEARCH_PROVIDER = 'brave';
} else if (raw.SEARCH_PROVIDER === 'mock' && raw.SERPAPI_API_KEY) {
  raw.SEARCH_PROVIDER = 'serpapi';
}

export const config = raw;
export type Config = typeof config;
