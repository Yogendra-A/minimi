export interface SearchQuery {
  query: string;
  recency?: 'day' | 'week' | 'month' | 'year';
  domains?: string[];
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  published_at?: string | null;
  retrieved_at: string;
  raw_content?: string | null;
}

export interface SearchProvider {
  name: string;
  search(query: SearchQuery): Promise<SearchResultItem[]>;
}
