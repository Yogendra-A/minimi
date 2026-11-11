import { SearchProvider, SearchQuery, SearchResultItem } from './types.js';

export class MockSearchProvider implements SearchProvider {
  name = 'mock';
  public customResults: SearchResultItem[] | null = null;
  public searchCount = 0;
  public lastQuery: SearchQuery | null = null;
  public shouldTimeout = false;

  async search(searchQuery: SearchQuery): Promise<SearchResultItem[]> {
    this.searchCount++;
    this.lastQuery = searchQuery;

    if (this.shouldTimeout) {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('Search request timed out after 5000ms')), 50));
    }

    if (this.customResults !== null) {
      return this.customResults;
    }

    const q = searchQuery.query.toLowerCase();
    const retrievedAt = new Date().toISOString();

    // 1. CRM pricing / updates
    if (q.includes('crm') || q.includes('hubspot') || q.includes('salesforce') || q.includes('pipedrive')) {
      return [
        {
          title: 'HubSpot Sales Hub Pricing & Plans (Current)',
          url: 'https://www.hubspot.com/pricing/sales',
          snippet: 'HubSpot Sales Hub Starter remains $20/month per seat billed annually or $25/month billed monthly. Professional plan is $500/month for 5 seats.',
          domain: 'hubspot.com',
          published_at: '2026-10-15T08:00:00Z',
          retrieved_at: retrievedAt,
          raw_content: 'Official HubSpot pricing page: Starter plan $20/user/mo billed annually. Professional plan includes 5 paid users for $500/mo. No price change since September.'
        },
        {
          title: 'Salesforce Sales Cloud Pricing Update 2026',
          url: 'https://www.salesforce.com/editions-pricing/sales-cloud',
          snippet: 'Salesforce Starter Suite is $25/user/month. Pro Suite is $100/user/month. Enterprise tier is $165/user/month billed annually.',
          domain: 'salesforce.com',
          published_at: '2026-09-01T12:00:00Z',
          retrieved_at: retrievedAt,
          raw_content: 'Salesforce announced unified pricing for SMBs: Starter Suite at $25/user/month.'
        },
        {
          title: 'Pipedrive Pricing - Simple CRM Plans',
          url: 'https://www.pipedrive.com/en/pricing',
          snippet: 'Pipedrive Essential plan is $14/user/month (annual) or $24/user/month (monthly). Advanced plan is $34/user/month. No recent price increases.',
          domain: 'pipedrive.com',
          published_at: '2026-08-10T10:00:00Z',
          retrieved_at: retrievedAt
        }
      ];
    }

    // 2. Postgres hosting pricing / features
    if (q.includes('postgres') || q.includes('neon') || q.includes('supabase')) {
      return [
        {
          title: 'Neon Serverless Postgres Pricing',
          url: 'https://neon.tech/pricing',
          snippet: 'Neon Free tier includes 0.5 GB storage. Launch plan starts at $19/month with 10 GB storage and autoscaling compute.',
          domain: 'neon.tech',
          published_at: '2026-10-01T00:00:00Z',
          retrieved_at: retrievedAt,
          raw_content: 'Neon pricing: Free tier 0.5 GB storage. Launch tier $19/mo, Scale tier $69/mo. Autoscaling up to 8 CU.'
        },
        {
          title: 'Supabase Pricing & Database Compute',
          url: 'https://supabase.com/pricing',
          snippet: 'Supabase Pro tier starts at $25/month including 8 GB database storage, 500 MB egress, and 100,000 monthly active users.',
          domain: 'supabase.com',
          published_at: '2026-10-20T00:00:00Z',
          retrieved_at: retrievedAt
        }
      ];
    }

    // Default generic results
    return [
      {
        title: `Search findings for: ${searchQuery.query}`,
        url: `https://example.com/search?q=${encodeURIComponent(searchQuery.query)}`,
        snippet: `Current status and verified documentation regarding ${searchQuery.query}. Official release notes confirmed active.`,
        domain: 'example.com',
        published_at: '2026-10-15T00:00:00Z',
        retrieved_at: retrievedAt
      }
    ];
  }
}
