import React from 'react';
import { Conversation } from '../api/client.js';
import { MessageSquare, Plus, Trash2, Clock, Globe, Zap, ShieldCheck } from 'lucide-react';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  timezone: string;
  isLive?: boolean;
  llmProvider?: string;
  isLiveSearch?: boolean;
  searchProvider?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  timezone,
  isLive = false,
  llmProvider = 'mock',
  isLiveSearch = false,
  searchProvider = 'mock'
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <MessageSquare size={20} color="#38bdf8" />
          <span>minimi Agent</span>
        </div>
        <div className="sidebar-tagline">Temporal Memory & Verified Web Search</div>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <Plus size={18} />
        <span>New Chat</span>
      </button>

      <div className="conversation-list">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${conv.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(conv.id)}
          >
            <span className="conversation-item-title">{conv.title}</span>
            <button
              className="conversation-delete-btn"
              title="Delete conversation"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
          {isLive ? <Zap size={12} color="#22c55e" /> : <ShieldCheck size={12} color="#eab308" />}
          <span style={{ color: isLive ? '#4ade80' : '#fde047', fontWeight: 600 }}>
            {isLive ? `LLM: Live (${llmProvider.toUpperCase()})` : 'LLM: Mock Mode'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
          <Globe size={12} color={isLiveSearch ? '#22c55e' : '#94a3b8'} />
          <span style={{ color: isLiveSearch ? '#4ade80' : '#94a3b8', fontWeight: 600 }}>
            {isLiveSearch ? `Search: Live (${searchProvider.toUpperCase()})` : 'Search: Mock Provider'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Clock size={12} />
          <span>TZ: {timezone}</span>
        </div>
      </div>
    </aside>
  );
};
