export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  title: string;
  url: string;
  domain: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: {
    citations?: Citation[];
    searches?: Array<{ query: string; resultsCount: number }>;
  } | null;
}

export interface ChatResponse {
  messageId: string;
  response: string;
  citations: Citation[];
  searchesExecuted: Array<{ query: string; resultsCount: number }>;
  retrievedMemory: any[];
  temporal: any;
  isClarification?: boolean;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch('/api/conversations');
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function createConversation(title?: string): Promise<Conversation> {
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  return res.json();
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`/api/conversations/${conversationId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete conversation');
}

export async function sendMessage(conversationId: string, message: string): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, message })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to send message');
  }
  return res.json();
}

export interface HealthStatus {
  status: string;
  mode?: 'live' | 'mock';
  searchMode?: 'live' | 'mock';
  isLive?: boolean;
  isLiveLLM?: boolean;
  isLiveSearch?: boolean;
  timezone: string;
  llmProvider: string;
  llmModel?: string;
  searchProvider: string;
  uptime: number;
  timestamp: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}
