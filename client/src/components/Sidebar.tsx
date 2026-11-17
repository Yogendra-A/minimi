import React, { useState } from 'react';
import { Conversation } from '../api/client.js';
import {
  Plus,
  Trash2,
  Clock,
  Globe,
  Zap,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft,
  Search,
  Calendar,
  Layers,
  ChevronDown
} from 'lucide-react';

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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
  searchProvider = 'mock',
  collapsed = false,
  onToggleCollapse
}) => {
  const [searchFilter, setSearchFilter] = useState('');

  // Group conversations by relative timeframe
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const getGroup = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return 'This Week';
      if (diffDays < 30) return 'Earlier this Month';
      return 'Prior Discussions';
    } catch {
      return 'Recent';
    }
  };

  const grouped: Record<string, Conversation[]> = {};
  filteredConversations.forEach((conv) => {
    const groupName = getGroup(conv.updated_at || conv.created_at);
    if (!grouped[groupName]) grouped[groupName] = [];
    grouped[groupName].push(conv);
  });

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier this Month', 'Prior Discussions', 'Recent'];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <span className="brand-dot"></span>
          </div>
          <div className="brand-text">
            <div className="brand-name">minimi</div>
            <div className="brand-edition">Memory & Research</div>
          </div>
        </div>

        {onToggleCollapse && (
          <button
            className="sidebar-toggle-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar (Ctrl+\\)'}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      {/* New Thread CTA */}
      <div className="sidebar-action-wrap">
        <button className="new-chat-btn" onClick={onNewChat}>
          <Plus size={15} strokeWidth={2.25} />
          <span>New Discussion</span>
          <kbd className="shortcut-hint">⌘N</kbd>
        </button>
      </div>

      {/* Quick Search in threads */}
      {conversations.length > 5 && (
        <div className="sidebar-search-box">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            placeholder="Filter discussions..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      )}

      {/* Conversation Thread History */}
      <div className="conversation-list">
        {filteredConversations.length === 0 ? (
          <div className="empty-threads-note">
            {searchFilter ? 'No matching discussions found.' : 'No saved conversations.'}
          </div>
        ) : (
          groupOrder.map((group) => {
            const items = grouped[group];
            if (!items || items.length === 0) return null;
            return (
              <div key={group} className="conversation-group">
                <div className="group-header">
                  <span>{group}</span>
                  <span className="group-count">{items.length}</span>
                </div>
                {items.map((conv) => {
                  const isActive = conv.id === activeId;
                  return (
                    <div
                      key={conv.id}
                      className={`conversation-item ${isActive ? 'active' : ''}`}
                      onClick={() => onSelect(conv.id)}
                      title={conv.title}
                    >
                      <div className="conversation-item-main">
                        <span className="conversation-item-title">{conv.title}</span>
                      </div>
                      <button
                        className="conversation-delete-btn"
                        title="Delete conversation"
                        aria-label={`Delete ${conv.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Infrastructure Telemetry Footer */}
      <div className="sidebar-footer">
        <div className="telemetry-card">
          <div className="telemetry-header">
            <span className="telemetry-label">Runtime Engine</span>
            <span className="telemetry-status-pill online">Active</span>
          </div>

          <div className="telemetry-row">
            <div className="telemetry-item">
              <span className="telemetry-k">Model</span>
              <span className="telemetry-v">
                {isLive ? (
                  <span className="tag-live">
                    <Zap size={10} className="tag-icon" />
                    {llmProvider.toUpperCase()}
                  </span>
                ) : (
                  <span className="tag-mock">Mock Mode</span>
                )}
              </span>
            </div>

            <div className="telemetry-item">
              <span className="telemetry-k">Search</span>
              <span className="telemetry-v">
                {isLiveSearch ? (
                  <span className="tag-live">
                    <Globe size={10} className="tag-icon" />
                    {searchProvider.toUpperCase()}
                  </span>
                ) : (
                  <span className="tag-mock">Mock Web</span>
                )}
              </span>
            </div>
          </div>

          <div className="telemetry-meta">
            <div className="meta-cell" title={`Calculated calendar timezone: ${timezone}`}>
              <Clock size={11} className="meta-icon" />
              <span>{timezone}</span>
            </div>
            <div className="meta-cell" title="Internal SQLite FTS5 Engine">
              <Layers size={11} className="meta-icon" />
              <span>SQLite · FTS5</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
