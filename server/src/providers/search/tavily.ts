import { SearchProvider, SearchQuery, SearchResultItem } from './types.js';

export class TavilySearchProvider implements SearchProvider {
  name = 'tavily';
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new Error('Tavily API key is required for TavilySearchProvider.');
    }
    this.apiKey = apiKey.trim();
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
        max_results: 3
      };

      if (searchQuery.domains && searchQuery.domains.length > 0) {
        payload.include_domains = searchQuery.domains;
      }

      if (searchQuery.recency) {
        payload.time_range = searchQuery.recency;
      }

      let res: Response;
      try {
        res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError' || controller.signal.aborted) {
          throw new Error('Tavily search request timed out after 12000ms');
        }
        throw new Error(`Tavily network request failed: ${fetchErr.message}`);
      }

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) {
          throw new Error(`Tavily rate limit exceeded (429): ${text}`);
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Tavily authentication failed (${res.status}): ${text}`);
        }
        throw new Error(`Tavily search failed (${res.status}): ${text}`);
      }

      let data: any;
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        throw new Error(`Tavily returned invalid JSON response: ${jsonErr.message}`);
      }

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
