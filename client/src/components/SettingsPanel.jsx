import { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../utils/api';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000/api' : 'https://lian-dq0q.onrender.com/api';

export default function SettingsPanel({ sessionId, onClose }) {
  const [settings, setSettings] = useState({
    system_prompt: '',
    temperature: 0.8,
    max_context_rounds: 50,
    max_reply_tokens: 4096,
    provider: 'claude',
    user_avatar: '',
    assistant_avatar: '',
    background_image: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (sessionId) {
      getSettings(sessionId).then(data => {
        if (data && Object.keys(data).length > 0) {
          setSettings(prev => ({ ...prev, ...data }));
        }
      });
    }
  }, [sessionId]);

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (field, file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
      const { url } = await res.json();
      handleChange(field, url);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };

  const handleSave = async () => {
    try {
      await updateSettings(sessionId, settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert('Failed to save settings: ' + err.message);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Settings</h3>
          <button className="close-btn" onClick={onClose}>x</button>
        </div>

        <div className="settings-body">
          {/* Avatars */}
          <div className="avatar-settings">
            <div className="avatar-field">
              <span>Your Avatar</span>
              <div className="avatar-preview">
                <img src={settings.user_avatar || defaultUser} alt="" />
              </div>
              <input
                type="text"
                placeholder="Paste image URL..."
                value={settings.user_avatar || ''}
                onChange={(e) => handleChange('user_avatar', e.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileUpload('user_avatar', e.target.files[0])}
              />
            </div>
            <div className="avatar-field">
              <span>Elliott's Avatar</span>
              <div className="avatar-preview">
                <img src={settings.assistant_avatar || defaultAssistant} alt="" />
              </div>
              <input
                type="text"
                placeholder="Paste image URL..."
                value={settings.assistant_avatar || ''}
                onChange={(e) => handleChange('assistant_avatar', e.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileUpload('assistant_avatar', e.target.files[0])}
              />
            </div>
          </div>

          <label>
            <span>Chat Background</span>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="text" placeholder="Paste image URL..."
                value={settings.background_image || ''}
                onChange={(e) => handleChange('background_image', e.target.value)}
                style="flex:1;font-size:12px;" />
              <input type="file" accept="image/*" style="font-size:11px;"
                onChange={(e) => e.target.files?.[0] && handleFileUpload('background_image', e.target.files[0])} />
            </div>
          </label>

          <label>
            <span>System Prompt</span>
            <textarea
              value={settings.system_prompt || ''}
              onChange={(e) => handleChange('system_prompt', e.target.value)}
              placeholder="Default persona..."
              rows={3}
            />
          </label>

          <label>
            <span>AI Provider</span>
            <select value={settings.provider || 'openai'} onChange={(e) => handleChange('provider', e.target.value)}>
              <option value="openai">Claude (via proxy)</option>
              <option value="claude">Claude (direct)</option>
            </select>
          </label>

          <label>
            <span>Temperature: {settings.temperature ?? 0.8}</span>
            <input type="range" min="0" max="2" step="0.1" value={settings.temperature ?? 0.8}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))} />
          </label>

          <label>
            <span>Max Context Rounds: {settings.max_context_rounds || 50}</span>
            <input type="range" min="5" max="100" step="5" value={settings.max_context_rounds || 50}
              onChange={(e) => handleChange('max_context_rounds', parseInt(e.target.value))} />
          </label>

          <label>
            <span>Max Reply Tokens: {settings.max_reply_tokens || 4096}</span>
            <input type="range" min="256" max="16384" step="256" value={settings.max_reply_tokens || 4096}
              onChange={(e) => handleChange('max_reply_tokens', parseInt(e.target.value))} />
          </label>
        </div>

        <div className="settings-footer">
          <button className="save-btn" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const defaultUser = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#333" width="100" height="100"/><text y=".65em" x="50" text-anchor="middle" font-size="55">🐰</text></svg>');
const defaultAssistant = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#222" width="100" height="100"/><text y=".65em" x="50" text-anchor="middle" font-size="55">🐇</text></svg>');
