import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../api/client.js';
import { MessageBubble } from './MessageBubble.js';
import {
  ArrowUp,
  Globe,
  Sparkles,
  Clock,
  Compass,
  Database,
  History,
  Shield,
  Layers,
  Search,
  CheckCircle2,
  Menu
} from 'lucide-react';

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
  onToggleSidebar?: () => void;
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
  searchProvider = 'mock',
  onToggleSidebar
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSearching, isLoading]);

  // Auto-resize input area
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSendMessage(suggestion);
  };

  const promptStarters = [
    {
      title: 'Exact Date Memory',
      tag: 'Challenge 2',
      query: 'What did I ask you on 3 November? Is your answer still correct today?',
      desc: 'Retrieves Nov 3 Neon Postgres baseline from SQLite and checks current web evidence.'
    },
    {
      title: 'Relative Time Continuity',
      tag: 'Challenge 3',
      query: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
      desc: 'Resolves relative calendar boundary in Asia/Kolkata and compares like-for-like plans.'
    },
    {
      title: 'CRM Shortlist Freshness',
      tag: 'Challenge 1',
      query: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
      desc: 'Recovers Monday shortlist and compares current tier pricing with citations.'
    }
  ];

  return (
    <main className="chat-main">
      {/* Top Application Bar */}
      <header className="chat-header">
        <div className="header-left">
          {onToggleSidebar && (
            <button className="mobile-menu-btn" onClick={onToggleSidebar} aria-label="Toggle navigation">
              <Menu size={18} />
            </button>
          )}
          <div className="header-title-wrap">
            <h1 className="chat-header-title">{conversationTitle || 'Discussion'}</h1>
            <div className="header-sub">
              <span>Timezone: {timezone}</span>
              <span className="dot-sep">•</span>
              <span>Single External Tool: web_search</span>
            </div>
          </div>
        </div>

        <div className="chat-header-meta">
          <div className={`status-pill ${isLive ? 'pill-live' : 'pill-mock'}`}>
            <span className="status-dot"></span>
            <span className="pill-text">LLM: {isLive ? llmProvider.toUpperCase() : 'Mock'}</span>
          </div>

          <div className={`status-pill ${isLiveSearch ? 'pill-live' : 'pill-mock'}`}>
            <span className="status-dot"></span>
            <span className="pill-text">Search: {isLiveSearch ? searchProvider.toUpperCase() : 'Mock'}</span>
          </div>
        </div>
      </header>

      {/* Message Feed Area */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state-wrapper">
            <div className="empty-state-card">
              <div className="empty-brand-badge">
                <span className="badge-pulsing-point"></span>
                <span>minimi Temporal Agent</span>
              </div>

              <h2 className="empty-headline">Your conversations have a memory.</h2>
              <p className="empty-subtext">
                Pick up where you left off. Revisit decisions, track changes, and verify what is true today using grounded SQLite persistence and live web citations.
              </p>

              {/* Verified Capabilities Checklist */}
              <div className="feature-grid">
                <div className="feature-item">
                  <div className="feature-icon-box">
                    <History size={14} />
                  </div>
                  <div className="feature-content">
                    <span className="feature-name">Exact & Relative Time</span>
                    <span className="feature-desc">Understands "3 November", "yesterday", or "last Tuesday" anchored to {timezone}.</span>
                  </div>
                </div>

                <div className="feature-item">
                  <div className="feature-icon-box">
                    <Database size={14} />
                  </div>
                  <div className="feature-content">
                    <span className="feature-name">Hybrid SQL + FTS5</span>
                    <span className="feature-desc">Recovers past discussions and facts without leaking internal database tools.</span>
                  </div>
                </div>

                <div className="feature-item">
                  <div className="feature-icon-box">
                    <Globe size={14} />
                  </div>
                  <div className="feature-content">
                    <span className="feature-name">Like-for-Like Verification</span>
                    <span className="feature-desc">Compares historical baselines against live primary sources with clickable links.</span>
                  </div>
                </div>
              </div>

              {/* Benchmark Prompts */}
              <div className="prompt-starters-section">
                <div className="starters-label">Hiring Challenge Verification Scenarios</div>
                <div className="starters-grid">
                  {promptStarters.map((item, idx) => (
                    <button
                      key={idx}
                      className="starter-card"
                      onClick={() => handleSuggestionClick(item.query)}
                    >
                      <div className="starter-card-top">
                        <span className="starter-tag">{item.tag}</span>
                        <span className="starter-title">{item.title}</span>
                      </div>
                      <div className="starter-query">"{item.query}"</div>
                      <div className="starter-desc">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="message-feed">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
        )}

        {/* Dynamic Activity Indicators */}
        {isSearching && (
          <div className="activity-banner search-active">
            <div className="activity-spinner">
              <Globe size={14} className="spin-icon" />
            </div>
            <div className="activity-text">
              <span className="activity-title">Executing live web search</span>
              <span className="activity-sub">Retrieving official documentation and comparing with historical records...</span>
            </div>
          </div>
        )}

        {isLoading && !isSearching && (
          <div className="activity-banner think-active">
            <div className="activity-spinner">
              <Sparkles size={14} className="pulse-icon" />
            </div>
            <div className="activity-text">
              <span className="activity-title">Recalling memory & reasoning</span>
              <span className="activity-sub">Reviewing SQLite conversational context in {timezone}...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Premium Message Composer */}
      <div className="chat-input-area">
        <div className="composer-wrapper">
          <form className="composer-form" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              rows={1}
              className="composer-textarea"
              placeholder={`Ask a question or verify past topics in ${timezone}... (Enter to send, Shift+Enter for new line)`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />

            <div className="composer-toolbar">
              <div className="composer-hints">
                <span className="composer-status-tip">
                  <span className="tip-dot"></span>
                  Single external tool: <code>web_search</code>
                </span>
              </div>

              <button
                type="submit"
                className={`composer-send-btn ${input.trim() ? 'active' : ''}`}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
};
