import { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../utils/api';

/**
 * SettingsPanel — configure AI parameters per session
 */
export default function SettingsPanel({ sessionId, onClose }) {
  const [settings, setSettings] = useState({
    system_prompt: '',
    temperature: 0.8,
    max_context_rounds: 50,
    max_reply_tokens: 4096,
    provider: 'claude',
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
          <h3>⚙️ Settings</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <label>
            <span>System Prompt</span>
            <textarea
              value={settings.system_prompt || ''}
              onChange={(e) => handleChange('system_prompt', e.target.value)}
              placeholder="Default: Elliott's loving companion persona..."
              rows={4}
            />
          </label>

          <label>
            <span>AI Provider</span>
            <select
              value={settings.provider || 'claude'}
              onChange={(e) => handleChange('provider', e.target.value)}
            >
              <option value="claude">Claude (Anthropic)</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </label>

          <label>
            <span>Temperature: {settings.temperature ?? 0.8}</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature ?? 0.8}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
            />
          </label>

          <label>
            <span>Max Context Rounds: {settings.max_context_rounds || 50}</span>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={settings.max_context_rounds || 50}
              onChange={(e) => handleChange('max_context_rounds', parseInt(e.target.value))}
            />
          </label>

          <label>
            <span>Max Reply Tokens: {settings.max_reply_tokens || 4096}</span>
            <input
              type="range"
              min="256"
              max="16384"
              step="256"
              value={settings.max_reply_tokens || 4096}
              onChange={(e) => handleChange('max_reply_tokens', parseInt(e.target.value))}
            />
          </label>
        </div>

        <div className="settings-footer">
          <button className="save-btn" onClick={handleSave}>
            {saved ? '✅ Saved!' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
