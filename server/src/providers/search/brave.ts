import { SearchProvider, SearchQuery, SearchResultItem } from './types.js';

export class BraveSearchProvider implements SearchProvider {
  name = 'brave';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(searchQuery: SearchQuery): Promise<SearchResultItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', searchQuery.query);
      url.searchParams.set('count', '5');

      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey
        },
        signal: controller.signal
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Brave search failed (${res.status}): ${text}`);
      }

      const data: any = await res.json();
      const retrievedAt = new Date().toISOString();

      return (data.web?.results || []).map((r: any) => {
        let domain = '';
        try {
          domain = new URL(r.url).hostname;
        } catch {
          domain = 'unknown';
        }

        return {
          title: r.title || 'Untitled',
          url: r.url,
          snippet: r.description || '',
          domain,
          published_at: r.page_age || null,
          retrieved_at: retrievedAt,
          raw_content: null
        };
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
