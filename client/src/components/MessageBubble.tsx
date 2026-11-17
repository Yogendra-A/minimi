import React, { useState } from 'react';
import { Message, Citation } from '../api/client.js';
import {
  ExternalLink,
  Search,
  User,
  Bot,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowUpRight
} from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const citations = message.metadata?.citations || [];
  const searches = message.metadata?.searches || [];
  const [copied, setCopied] = useState(false);
  const [citationsExpanded, setCitationsExpanded] = useState(true);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Helper: Parse inline markdown formatting (bold, italic, inline code, links)
   */
  const renderInline = (str: string): React.ReactNode[] => {
    const tokens: React.ReactNode[] = [];
    // Matches markdown links: [label](url)
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let lastIdx = 0;
    let m;

    while ((m = linkRegex.exec(str)) !== null) {
      if (m.index > lastIdx) {
        tokens.push(renderFormattedText(str.slice(lastIdx, m.index)));
      }
      tokens.push(
        <a
          key={`link-${m.index}`}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-citation-link"
        >
          <span>{m[1]}</span>
          <ArrowUpRight size={11} className="inline-link-arrow" />
        </a>
      );
      lastIdx = linkRegex.lastIndex;
    }

    if (lastIdx < str.length) {
      tokens.push(renderFormattedText(str.slice(lastIdx)));
    }

    return tokens;
  };

  /**
   * Helper: Parse inline bold, italic, and inline code snippets
   */
  const renderFormattedText = (text: string): React.ReactNode => {
    // Regex matches inline code `...`, bold **...** or __...__, and italic *...* or _..._
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*]+\*(?!\*)|(?<!_)_[^_]+_(?!_))/g;
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (!part) return null;
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
        return <code key={i} className="inline-code-snippet">{part.slice(1, -1)}</code>;
      }
      if (
        (part.startsWith('**') && part.endsWith('**') && part.length > 3) ||
        (part.startsWith('__') && part.endsWith('__') && part.length > 3)
      ) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (
        (part.startsWith('*') && part.endsWith('*') && part.length > 1) ||
        (part.startsWith('_') && part.endsWith('_') && part.length > 1)
      ) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  /**
   * Checks whether a line looks like a markdown table row:
   * e.g. | Col 1 | Col 2 | or Col 1 | Col 2 | Col 3
   */
  const isTableRow = (lineStr: string): boolean => {
    const t = lineStr.trim();
    if (!t.includes('|')) return false;
    // Standard table row starts and ends with pipe
    if (t.startsWith('|') && t.endsWith('|')) return true;
    // Or at least contains multiple pipes and is not code
    const pipes = t.split('|').length - 1;
    return pipes >= 2;
  };

  /**
   * Checks whether a line is a markdown table divider:
   * e.g. |---|---| or |:---:|---:| or ---|---|---
   */
  const isTableDivider = (lineStr: string): boolean => {
    const t = lineStr.trim().replace(/^\|/, '').replace(/\|$/, '');
    const parts = t.split('|');
    if (parts.length < 1) return false;
    return parts.every((p) => /^\s*:?-{2,}:?\s*$/.test(p));
  };

  /**
   * Parse a table row into clean cells
   */
  const parseRowCells = (lineStr: string): string[] => {
    let t = lineStr.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|')) t = t.slice(0, -1);
    return t.split('|').map((c) => c.trim());
  };

  /**
   * Comprehensive Markdown AST Parser without external dependencies:
   * Handles:
   * - Fenced code blocks (```...```)
   * - Headings (#, ##, ###, ####, #####, ######) with numbered section detection
   * - Tables (| Header 1 | Header 2 | + |---|---| divider + | Cell 1 | Cell 2 |)
   * - Blockquotes (> Quote)
   * - Horizontal rules (---, ***, ___ )
   * - Ordered lists (1. Item)
   * - Unordered lists (- Item, * Item, • Item)
   * - Paragraphs with inline formatting
   */
  const renderMarkdown = (rawContent: string) => {
    // Strip any raw unhandled <tool_call> XML tags so they never leak into the UI
    const cleanContent = rawContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
    if (!cleanContent) {
      return [<p key="empty" className="italic opacity-70">Processing web search...</p>];
    }
    const lines = cleanContent.split('\n');
    const elements: React.ReactNode[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // 1. Fenced Code Block
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // Consume closing ```

        elements.push(
          <div key={`code-${elements.length}`} className="msg-code-block-wrapper">
            {lang && <div className="msg-code-block-header">{lang}</div>}
            <pre className="msg-code-block">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        );
        continue;
      }

      // 2. Horizontal Rule (---, ***, ___)
      if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
        elements.push(<hr key={`hr-${elements.length}`} className="msg-divider" />);
        i++;
        continue;
      }

      // 3. Headings (#, ##, ###, ####, #####, ######)
      // Also handles lines like "### 1. Title" or "## Title"
      const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        const content = renderInline(text);

        if (level === 1) {
          elements.push(<h2 key={`h-${elements.length}`} className="msg-heading msg-heading-1">{content}</h2>);
        } else if (level === 2) {
          elements.push(<h3 key={`h-${elements.length}`} className="msg-heading msg-heading-2">{content}</h3>);
        } else if (level === 3) {
          elements.push(<h4 key={`h-${elements.length}`} className="msg-heading msg-heading-3">{content}</h4>);
        } else if (level === 4) {
          elements.push(<h5 key={`h-${elements.length}`} className="msg-heading msg-heading-4">{content}</h5>);
        } else {
          elements.push(<h6 key={`h-${elements.length}`} className="msg-heading msg-heading-5">{content}</h6>);
        }
        i++;
        continue;
      }

      // 4. Blockquotes (> ...)
      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        elements.push(
          <blockquote key={`quote-${elements.length}`} className="msg-blockquote">
            {quoteLines.map((qLine, qIdx) => (
              <p key={qIdx}>{renderInline(qLine)}</p>
            ))}
          </blockquote>
        );
        continue;
      }

      // 5. Markdown Tables
      // Detect if current line is a table row and next line is a divider or table row
      if (isTableRow(line)) {
        const tableLines: string[] = [];
        while (i < lines.length && isTableRow(lines[i])) {
          tableLines.push(lines[i]);
          i++;
        }

        if (tableLines.length >= 2 || isTableDivider(tableLines[0])) {
          let headerRow: string[] = [];
          let alignPatterns: ('left' | 'center' | 'right')[] = [];
          let dataRows: string[][] = [];

          let headerIdx = 0;
          let dividerIdx = -1;

          for (let rowIdx = 0; rowIdx < tableLines.length; rowIdx++) {
            if (isTableDivider(tableLines[rowIdx])) {
              dividerIdx = rowIdx;
              break;
            }
          }

          if (dividerIdx > 0) {
            headerRow = parseRowCells(tableLines[0]);
            alignPatterns = parseRowCells(tableLines[dividerIdx]).map((c) => {
              const s = c.trim();
              if (s.startsWith(':') && s.endsWith(':')) return 'center';
              if (s.endsWith(':')) return 'right';
              return 'left';
            });
            dataRows = tableLines
              .filter((_, idx) => idx !== 0 && idx !== dividerIdx)
              .map(parseRowCells);
          } else {
            // Streaming table or table without explicit divider
            headerRow = parseRowCells(tableLines[0]);
            dataRows = tableLines.slice(1).map(parseRowCells);
          }

          elements.push(
            <div key={`table-${elements.length}`} className="msg-table-container">
              <table className="msg-table">
                {headerRow.length > 0 && (
                  <thead>
                    <tr>
                      {headerRow.map((cell, cIdx) => (
                        <th
                          key={cIdx}
                          style={{ textAlign: alignPatterns[cIdx] || 'left' }}
                        >
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {dataRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          style={{ textAlign: alignPatterns[cIdx] || 'left' }}
                        >
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // 6. Ordered List (1. ...)
      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (orderedMatch) {
        const listItems: { num: string; content: string }[] = [];
        while (i < lines.length) {
          const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
          if (m) {
            listItems.push({ num: m[1], content: m[2] });
            i++;
          } else if (
            lines[i].trim().startsWith('   ') ||
            lines[i].trim().startsWith('\t')
          ) {
            // Indented continuation
            if (listItems.length > 0) {
              listItems[listItems.length - 1].content += ' ' + lines[i].trim();
            }
            i++;
          } else {
            break;
          }
        }

        elements.push(
          <ol key={`ol-${elements.length}`} className="msg-ordered-list">
            {listItems.map((item, idx) => (
              <li key={idx} className="msg-list-item">
                <span className="msg-list-marker">{item.num}.</span>
                <div className="msg-list-body">{renderInline(item.content)}</div>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // 7. Bullet / Unordered List (- ..., * ..., • ...)
      const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      if (bulletMatch) {
        const listItems: string[] = [];
        while (i < lines.length) {
          const m = lines[i].trim().match(/^[-*•]\s+(.*)$/);
          if (m) {
            listItems.push(m[1]);
            i++;
          } else if (
            lines[i].trim().startsWith('   ') ||
            lines[i].trim().startsWith('\t')
          ) {
            if (listItems.length > 0) {
              listItems[listItems.length - 1] += ' ' + lines[i].trim();
            }
            i++;
          } else {
            break;
          }
        }

        elements.push(
          <ul key={`ul-${elements.length}`} className="msg-bullet-list">
            {listItems.map((item, idx) => (
              <li key={idx} className="msg-list-item">
                <span className="msg-bullet-marker">•</span>
                <div className="msg-list-body">{renderInline(item)}</div>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // 8. Empty line / Paragraph spacer
      if (trimmed.length === 0) {
        elements.push(<div key={`sp-${elements.length}`} className="msg-paragraph-spacer" />);
        i++;
        continue;
      }

      // 9. Standard Paragraph
      elements.push(
        <p key={`p-${elements.length}`} className="msg-paragraph">
          {renderInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  };

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className={`message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
      <div className="message-container">
        {/* Author Avatar & Header */}
        <div className="message-header">
          <div className="author-badge">
            <div className={`avatar-pill ${isUser ? 'user-pill' : 'agent-pill'}`}>
              {isUser ? <User size={13} strokeWidth={2.2} /> : <Bot size={13} strokeWidth={2.2} />}
            </div>
            <span className="author-name">{isUser ? 'You' : 'minimi'}</span>
            <span className="message-timestamp">{formattedTime}</span>
          </div>

          {!isUser && (
            <div className="message-header-actions">
              {searches.length > 0 && (
                <div className="search-meta-badge" title="Live primary sources searched">
                  <Search size={11} className="search-icon" />
                  <span>
                    {searches.length} {searches.length === 1 ? 'web query' : 'web queries'}
                  </span>
                </div>
              )}
              <button
                className="action-icon-btn"
                onClick={handleCopy}
                title={copied ? 'Copied' : 'Copy response'}
                aria-label="Copy message text"
              >
                {copied ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
              </button>
            </div>
          )}
        </div>

        {/* Message Content */}
        <div className={`message-body ${isUser ? 'user-body' : 'assistant-body'}`}>
          <div className="message-prose">{renderMarkdown(message.content)}</div>

          {/* Citations & Evidence Panel */}
          {citations.length > 0 && (
            <div className="evidence-panel">
              <div
                className="evidence-panel-header"
                onClick={() => setCitationsExpanded(!citationsExpanded)}
              >
                <div className="evidence-title-group">
                  <ExternalLink size={12} className="evidence-icon" />
                  <span className="evidence-title">Verified Primary Sources</span>
                  <span className="evidence-count">({citations.length})</span>
                </div>
                <button className="evidence-collapse-btn" aria-label="Toggle sources">
                  {citationsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>

              {citationsExpanded && (
                <div className="evidence-grid">
                  {citations.map((cite, i) => (
                    <a
                      key={i}
                      href={cite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="evidence-card"
                      title={cite.title}
                    >
                      <div className="evidence-card-top">
                        <span className="evidence-domain">{cite.domain || 'Source'}</span>
                        <ArrowUpRight size={12} className="card-arrow" />
                      </div>
                      <div className="evidence-card-title">{cite.title}</div>
                      <div className="evidence-card-url">{cite.url}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
