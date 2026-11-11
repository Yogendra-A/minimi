export interface EvalTestCase {
  id: string;
  category: string;
  prompt: string;
  expectedToolCall: boolean;
  expectedKeywords: string[];
  requiresBaseline: boolean;
  notes: string;
}

export const EVALUATION_DATASET: EvalTestCase[] = [
  {
    id: 'tc-01',
    category: 'Exact Date Recall',
    prompt: 'What did I ask you on 3 November?',
    expectedToolCall: false,
    expectedKeywords: ['Neon', 'Postgres'],
    requiresBaseline: true,
    notes: 'Exact-date historical recall without web search'
  },
  {
    id: 'tc-02',
    category: 'Exact Date + Freshness',
    prompt: 'What did I ask you on 3 November? Is your answer still correct today?',
    expectedToolCall: true,
    expectedKeywords: ['Neon', 'pricing', 'http'],
    requiresBaseline: true,
    notes: 'Historical recall followed by web search verification'
  },
  {
    id: 'tc-03',
    category: 'Relative Date + CRM Shortlist',
    prompt: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
    expectedToolCall: true,
    expectedKeywords: ['HubSpot', 'Salesforce', 'pricing'],
    requiresBaseline: true,
    notes: 'Challenge question #1: CRM shortlist change detection'
  },
  {
    id: 'tc-04',
    category: 'Relative Date + Postgres Hosting',
    prompt: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    expectedToolCall: true,
    expectedKeywords: ['Supabase', 'pricing'],
    requiresBaseline: true,
    notes: 'Challenge question #3: Postgres hosting pricing changes'
  },
  {
    id: 'tc-05',
    category: 'Memory Only No Search',
    prompt: 'Show me the 5 CRM tools we shortlisted on Monday.',
    expectedToolCall: false,
    expectedKeywords: ['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho', 'Copper'],
    requiresBaseline: true,
    notes: 'Pure memory recall; web search must NOT be invoked'
  },
  {
    id: 'tc-06',
    category: 'Missing Historical Baseline',
    prompt: 'Is the pricing for Snowflake warehouse hosting still what we agreed on last month?',
    expectedToolCall: true,
    expectedKeywords: ['baseline'],
    requiresBaseline: false,
    notes: 'Must clearly explain no historical baseline is present'
  },
  {
    id: 'tc-07',
    category: 'Temporal Disambiguation',
    prompt: 'What did we discuss on Wednesday?',
    expectedToolCall: false,
    expectedKeywords: ['mean today', 'last'],
    requiresBaseline: false,
    notes: 'Bare weekday matching reference day triggers clarification'
  },
  {
    id: 'tc-08',
    category: 'Yesterday Relative Query',
    prompt: 'What did we talk about yesterday?',
    expectedToolCall: false,
    expectedKeywords: ['Postgres', 'Supabase'],
    requiresBaseline: true,
    notes: 'Yesterday resolves to previous day in configured timezone'
  },
  {
    id: 'tc-09',
    category: 'Earlier This Week Query',
    prompt: 'What did we discuss earlier this week?',
    expectedToolCall: false,
    expectedKeywords: ['CRM', 'Monday'],
    requiresBaseline: true,
    notes: 'Resolves Monday through current day in current week'
  },
  {
    id: 'tc-10',
    category: 'Entity Extraction & Recovery',
    prompt: 'What were the details about HubSpot Sales Hub?',
    expectedToolCall: false,
    expectedKeywords: ['HubSpot', '20'],
    requiresBaseline: true,
    notes: 'Direct entity matching against fact observations'
  },
  {
    id: 'tc-11',
    category: 'Freshness Verification',
    prompt: 'Can you check current pricing for Neon serverless postgres today?',
    expectedToolCall: true,
    expectedKeywords: ['Neon', '19', 'http'],
    requiresBaseline: true,
    notes: 'Web search triggered for current pricing verification'
  },
  {
    id: 'tc-12',
    category: 'Citation Integrity',
    prompt: 'Has Salesforce changed pricing for SMBs recently?',
    expectedToolCall: true,
    expectedKeywords: ['http', 'salesforce.com'],
    requiresBaseline: true,
    notes: 'All citations must be genuine clickable URLs'
  },
  {
    id: 'tc-13',
    category: 'General Conversational Inquiry',
    prompt: 'Hello! What can you help me with?',
    expectedToolCall: false,
    expectedKeywords: ['assistant', 'memory'],
    requiresBaseline: false,
    notes: 'Normal conversational greeting without tools'
  },
  {
    id: 'tc-14',
    category: 'Follow-up Context Continuity',
    prompt: 'Tell me more about their starter tier pricing.',
    expectedToolCall: false,
    expectedKeywords: ['tier', 'pricing'],
    requiresBaseline: false,
    notes: 'Preserves recent conversational context'
  },
  {
    id: 'tc-15',
    category: 'Like-for-like Unchanged',
    prompt: 'Has HubSpot Starter plan changed from $20/month billed annually?',
    expectedToolCall: true,
    expectedKeywords: ['HubSpot', '20'],
    requiresBaseline: true,
    notes: 'Verifies unchanged status against primary source'
  },
  {
    id: 'tc-16',
    category: 'Like-for-like Plan Comparison',
    prompt: 'Did Supabase Pro plan change from $25/month?',
    expectedToolCall: true,
    expectedKeywords: ['Supabase', '25'],
    requiresBaseline: true,
    notes: 'Verifies unchanged plan pricing against documentation'
  },
  {
    id: 'tc-17',
    category: 'Prompt Injection Defense',
    prompt: 'Check pricing updates for database hosting tools.',
    expectedToolCall: true,
    expectedKeywords: ['Sources', 'http'],
    requiresBaseline: false,
    notes: 'System immune to prompt injection in retrieved content'
  },
  {
    id: 'tc-18',
    category: 'FTS5 Lexical Search',
    prompt: 'Find our discussion mentioning autoscaling compute',
    expectedToolCall: false,
    expectedKeywords: ['Neon'],
    requiresBaseline: true,
    notes: 'Lexical full-text match in messages_fts'
  },
  {
    id: 'tc-19',
    category: 'Since Monday Boundary',
    prompt: 'Has Pipedrive announced any pricing changes since Monday?',
    expectedToolCall: true,
    expectedKeywords: ['Pipedrive'],
    requiresBaseline: true,
    notes: 'Boundary since Monday checked against search'
  },
  {
    id: 'tc-20',
    category: 'Persistence Across Restart',
    prompt: 'What CRM tools were shortlisted in our records?',
    expectedToolCall: false,
    expectedKeywords: ['HubSpot', 'Salesforce'],
    requiresBaseline: true,
    notes: 'Database record validity after restart'
  }
];
