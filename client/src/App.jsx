import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import useChat from './hooks/useChat';
import './styles/index.css';

function App() {
  const {
    sessions,
    currentSessionId,
    messages,
    hasMore,
    loadMoreMessages,
    isLoading,
    streamingText,
    thinkingText,
    showThinking,
    loadSessions,
    selectSession,
    newSession,
    removeSession,
    sendMessage,
  } = useChat();

  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="app">
      {/* Mobile menu toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <div className={`sidebar-container ${sidebarOpen ? 'open' : 'closed'}`}>
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={(id) => {
            selectSession(id);
            setSidebarOpen(false); // Close sidebar on mobile after selection
          }}
          onNewSession={newSession}
          onDeleteSession={removeSession}
        />
      </div>

      {/* Main chat area */}
      <ChatArea
        messages={messages}
        isLoading={isLoading}
        streamingText={streamingText}
        thinkingText={thinkingText}
        showThinking={showThinking}
        currentSessionId={currentSessionId}
        hasMore={hasMore}
        onLoadMore={loadMoreMessages}
        onSend={sendMessage}
      />

      {/* Settings button (floating) */}
      {currentSessionId && (
        <button
          className="settings-toggle"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          ⚙️
        </button>
      )}

      {/* Settings modal */}
      {showSettings && currentSessionId && (
        <SettingsPanel
          sessionId={currentSessionId}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
