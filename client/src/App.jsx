import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import useChat from './hooks/useChat';
import { getSettings } from './utils/api';
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
    regenerateLastReply,
    editUserMessage,
    deleteUserMessage,
    switchVersion,
  } = useChat();

  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userAvatar, setUserAvatar] = useState('');
  const [assistantAvatar, setAssistantAvatar] = useState('');
  const [backgroundImage, setBackgroundImage] = useState('');

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Load avatar/background settings when session changes
  useEffect(() => {
    if (currentSessionId) {
      getSettings(currentSessionId).then(s => {
        setUserAvatar(s?.user_avatar || '');
        setAssistantAvatar(s?.assistant_avatar || '');
        setBackgroundImage(s?.background_image || '');
      });
    }
  }, [currentSessionId, showSettings]);

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
        onRegenerate={regenerateLastReply}
        onSend={sendMessage}
        onEditMessage={editUserMessage}
        onDeleteMessage={deleteUserMessage}
        switchVersion={switchVersion}
        userAvatar={userAvatar}
        assistantAvatar={assistantAvatar}
        backgroundImage={backgroundImage}
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
