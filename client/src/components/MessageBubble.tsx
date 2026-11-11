import React from 'react';
import { Message, Citation } from '../api/client.js';
import { ExternalLink, Search, User, Bot } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const citations = message.metadata?.citations || [];
  const searches = message.metadata?.searches || [];

  const formatContent = (text: string) => {
    // Process markdown-style links [Text](url)
    const parts = [];
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontWeight: 600 }}
        >
          {match[1]}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return (
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {parts.map((p, i) => (typeof p === 'string' ? p : <React.Fragment key={i}>{p}</React.Fragment>))}
      </div>
    );
  };

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className={`message-bubble-wrapper ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-sender">
        {isUser ? <User size={14} /> : <Bot size={14} color="#2563eb" />}
        <span>{isUser ? 'You' : 'minimi Agent'}</span>
        {searches.length > 0 && (
          <span className="badge badge-tool">
            <Search size={10} />
            <span>{searches.length} {searches.length === 1 ? 'search' : 'searches'}</span>
          </span>
        )}
      </div>

      <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
        {formatContent(message.content)}

        {citations.length > 0 && (
          <div className="citations-tray">
            <div style={{ width: '100%', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
              Sources & Evidence:
            </div>
            {citations.map((cite, i) => (
              <a
                key={i}
                href={cite.url}
                target="_blank"
                rel="noopener noreferrer"
                className="citation-chip"
                title={cite.title}
              >
                <ExternalLink size={11} />
                <span style={{ fontWeight: 600 }}>{cite.domain}</span>
                <span>- {cite.title.slice(0, 30)}{cite.title.length > 30 ? '...' : ''}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <span className="message-time">{formattedTime}</span>
    </div>
  );
};
