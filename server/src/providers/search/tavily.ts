import { SearchProvider, SearchQuery, SearchResultItem } from './types.js';

export class TavilySearchProvider implements SearchProvider {
  name = 'tavily';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(searchQuery: SearchQuery): Promise<SearchResultItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const payload: Record<string, any> = {
        api_key: this.apiKey,
        query: searchQuery.query,
        search_depth: 'basic',
        include_answer: false,
        max_results: 5
      };

      if (searchQuery.domains && searchQuery.domains.length > 0) {
        payload.include_domains = searchQuery.domains;
      }

      if (searchQuery.recency) {
        payload.time_range = searchQuery.recency;
      }

      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Tavily search failed (${res.status}): ${text}`);
      }

      const data: any = await res.json();
      const retrievedAt = new Date().toISOString();

      return (data.results || []).map((r: any) => {
        let domain = '';
        try {
          domain = new URL(r.url).hostname;
        } catch {
          domain = 'unknown';
        }

        return {
          title: r.title || 'Untitled',
          url: r.url,
          snippet: r.content || '',
          domain,
          published_at: r.published_date || null,
          retrieved_at: retrievedAt,
          raw_content: r.raw_content || null
        };
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
