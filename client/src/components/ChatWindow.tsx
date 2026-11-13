import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../api/client.js';
import { MessageBubble } from './MessageBubble.js';
import { Send, Globe, Sparkles, AlertCircle } from 'lucide-react';

interface ChatWindowProps {
  conversationTitle: string;
  messages: Message[];
  isLoading: boolean;
  isSearching: boolean;
  onSendMessage: (text: string) => void;
  timezone: string;
  isLive?: boolean;
  llmProvider?: string;
  isLiveSearch?: boolean;
  searchProvider?: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationTitle,
  messages,
  isLoading,
  isSearching,
  onSendMessage,
  timezone,
  isLive = false,
  llmProvider = 'mock',
  isLiveSearch = false,
  searchProvider = 'mock'
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSearching, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSendMessage(suggestion);
  };

  return (
    <main className="chat-main">
      <header className="chat-header">
        <h2 className="chat-header-title">{conversationTitle}</h2>
        <div className="chat-header-meta">
          <span className={`badge ${isLive ? 'badge-live' : 'badge-mock'}`}>
            <Sparkles size={12} />
            <span>{isLive ? `LLM: Live (${llmProvider.toUpperCase()})` : 'LLM: Mock'}</span>
          </span>
          <span className={`badge ${isLiveSearch ? 'badge-live' : 'badge-mock'}`}>
            <Globe size={12} />
            <span>{isLiveSearch ? `Search: Live (${searchProvider.toUpperCase()})` : 'Search: Mock'}</span>
          </span>
          <span className="badge badge-info">{timezone}</span>
        </div>
      </header>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Sparkles size={40} color="#3b82f6" />
            </div>
            <h3>How can I help you today?</h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
              I remember your past discussions, interpret exact & relative dates in {timezone}, and verify live web evidence like-for-like.
            </p>

            <div className="empty-state-suggestions">
              <button
                className="suggestion-btn"
                onClick={() => handleSuggestionClick('On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?')}
              >
                <strong>Challenge #1:</strong> "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"
              </button>
              <button
                className="suggestion-btn"
                onClick={() => handleSuggestionClick('What did I ask you on 3 November? Is your answer still correct today?')}
              >
                <strong>Challenge #2:</strong> "What did I ask you on 3 November? Is your answer still correct today?"
              </button>
              <button
                className="suggestion-btn"
                onClick={() => handleSuggestionClick('Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?')}
              >
                <strong>Challenge #3:</strong> "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"
              </button>
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}

        {isSearching && (
          <div className="search-indicator">
            <Globe size={16} />
            <span>Searching live primary sources and verifying like-for-like evidence...</span>
          </div>
        )}

        {isLoading && !isSearching && (
          <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic', padding: '0.5rem' }}>
            Thinking and reviewing memory context...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form className="chat-input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="chat-input"
            placeholder={`Ask a question or verify past topics in ${timezone}...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className="chat-submit-btn" disabled={!input.trim() || isLoading}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </main>
  );
};
