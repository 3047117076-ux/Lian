import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import UsagePanel from './components/UsagePanel';
import useChat from './hooks/useChat';
import { getSettings } from './utils/api';
import './styles/index.css';

function App() {
  const {
    sessions, currentSessionId, messages, hasMore, loadMoreMessages,
    isLoading, streamingText, thinkingText, showThinking,
    loadSessions, selectSession, newSession, removeSession,
    sendMessage, regenerateLastReply,
    editUserMessage, deleteUserMessage, switchVersion,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePanel, setActivePanel] = useState(null); // 'settings' | 'usage' | 'mood' | 'dates' | 'export'
  const [userAvatar, setUserAvatar] = useState('');
  const [assistantAvatar, setAssistantAvatar] = useState('');
  const [backgroundImage, setBackgroundImage] = useState('');

  useEffect(() => { loadSessions(); }, []);

  useEffect(() => {
    if (currentSessionId) {
      getSettings(currentSessionId).then(s => {
        setUserAvatar(s?.user_avatar || '');
        setAssistantAvatar(s?.assistant_avatar || '');
        setBackgroundImage(s?.background_image || '');
      });
    }
  }, [currentSessionId, activePanel]);

  const closePanel = () => setActivePanel(null);

  return (
    <div className="app">
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? 'x' : '='}
      </button>

      <div className={`sidebar-container ${sidebarOpen ? 'open' : 'closed'}`}>
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={(id) => { selectSession(id); setSidebarOpen(false); }}
          onNewSession={newSession}
          onDeleteSession={removeSession}
          onOpenPanel={(p) => { setActivePanel(p); setSidebarOpen(false); }}
        />
      </div>

      <ChatArea
        messages={messages} isLoading={isLoading}
        streamingText={streamingText} thinkingText={thinkingText}
        showThinking={showThinking} currentSessionId={currentSessionId}
        hasMore={hasMore} onLoadMore={loadMoreMessages}
        onRegenerate={regenerateLastReply} onSend={sendMessage}
        onEditMessage={editUserMessage} onDeleteMessage={deleteUserMessage}
        switchVersion={switchVersion}
        userAvatar={userAvatar} assistantAvatar={assistantAvatar}
        backgroundImage={backgroundImage}
      />

      {currentSessionId && (
        <button className="settings-toggle" onClick={() => setActivePanel('settings')} title="Settings">&#9881;</button>
      )}

      {activePanel === 'settings' && currentSessionId && (
        <SettingsPanel sessionId={currentSessionId} onClose={closePanel} />
      )}
      {activePanel === 'usage' && currentSessionId && (
        <UsagePanel sessionId={currentSessionId} onClose={closePanel} />
      )}
      {/* Mood, Dates, Export — coming next */}
    </div>
  );
}

export default App;
