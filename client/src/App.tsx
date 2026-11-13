import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { ChatWindow } from './components/ChatWindow.js';
import {
  Conversation,
  Message,
  HealthStatus,
  fetchConversations,
  createConversation,
  fetchMessages,
  deleteConversation,
  sendMessage,
  checkHealth
} from './api/client.js';

export const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [healthInfo, setHealthInfo] = useState<HealthStatus | null>(null);

  // Load health & conversations
  useEffect(() => {
    checkHealth()
      .then((h) => {
        setHealthInfo(h);
        if (h.timezone) setTimezone(h.timezone);
      })
      .catch((err) => console.warn('Could not fetch health:', err));

    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const list = await fetchConversations();
      setConversations(list);
      if (list.length > 0 && !activeConvId) {
        setActiveConvId(list[0].id);
        loadMessages(list[0].id);
      } else if (list.length === 0) {
        // Create initial default conversation
        handleNewChat();
      }
    } catch (err) {
      console.warn('Error loading conversations:', err);
    }
  };

  const loadMessages = async (convId: string) => {
    try {
      const msgs = await fetchMessages(convId);
      setMessages(msgs);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const handleSelectConv = (id: string) => {
    setActiveConvId(id);
    loadMessages(id);
  };

  const handleNewChat = async () => {
    try {
      const newConv = await createConversation('New Conversation');
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv.id);
      setMessages([]);
    } catch (err) {
      console.error('Error creating conversation:', err);
    }
  };

  const handleDeleteConv = async (id: string) => {
    try {
      await deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (activeConvId === id) {
        if (remaining.length > 0) {
          setActiveConvId(remaining[0].id);
          loadMessages(remaining[0].id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!activeConvId) return;

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConvId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    // If query looks like a change/freshness question, indicate search
    const lower = text.toLowerCase();
    if (lower.includes('change') || lower.includes('still correct') || lower.includes('pricing') || lower.includes('today')) {
      setIsSearching(true);
    }

    try {
      const res = await sendMessage(activeConvId, text);
      setIsSearching(false);
      setIsLoading(false);

      const assistantMsg: Message = {
        id: res.messageId,
        conversation_id: activeConvId,
        role: 'assistant',
        content: res.response,
        created_at: new Date().toISOString(),
        metadata: {
          citations: res.citations,
          searches: res.searchesExecuted
        }
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Refresh conversations to update titles/ordering
      fetchConversations().then(setConversations).catch(() => {});
    } catch (err: any) {
      setIsSearching(false);
      setIsLoading(false);
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        conversation_id: activeConvId,
        role: 'assistant',
        content: `Sorry, an error occurred: ${err.message || 'Server error'}. Please try again.`,
        created_at: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  const activeTitle = conversations.find((c) => c.id === activeConvId)?.title || 'Chat';

  return (
    <div className="app-container">
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConv}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConv}
        timezone={timezone}
        isLive={healthInfo?.isLive ?? false}
        llmProvider={healthInfo?.llmProvider ?? 'mock'}
        isLiveSearch={healthInfo?.isLiveSearch ?? false}
        searchProvider={healthInfo?.searchProvider ?? 'mock'}
      />
      <ChatWindow
        conversationTitle={activeTitle}
        messages={messages}
        isLoading={isLoading}
        isSearching={isSearching}
        onSendMessage={handleSendMessage}
        timezone={timezone}
        isLive={healthInfo?.isLive ?? false}
        llmProvider={healthInfo?.llmProvider ?? 'mock'}
        isLiveSearch={healthInfo?.isLiveSearch ?? false}
        searchProvider={healthInfo?.searchProvider ?? 'mock'}
      />
    </div>
  );
};
