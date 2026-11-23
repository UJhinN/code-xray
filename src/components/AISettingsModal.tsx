import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import type { AIConfig } from '../core/aiExplainer';

interface AISettingsModalProps {
  config: AIConfig;
  onSave: (next: AIConfig) => void;
  onClose: () => void;
}

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash (แนะนำ — ฉลาดและเร็ว)' },
  { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite (เบาและประหยัดโควต้า)' },
  { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash (รุ่นสำรอง)' },
];

const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini (แนะนำ)' },
  { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
];

function normalizeModelForProvider(provider: 'gemini' | 'openai', currentModel: string): string {
  const list = provider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;
  return list.some((m) => m.id === currentModel) ? currentModel : list[0].id;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({ config, onSave, onClose }) => {
  const [provider, setProvider] = useState<'gemini' | 'openai'>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(() => normalizeModelForProvider(config.provider, config.model));

  function handleProviderChange(nextProvider: 'gemini' | 'openai') {
    setProvider(nextProvider);
    setModel(nextProvider === 'gemini' ? GEMINI_MODELS[0].id : OPENAI_MODELS[0].id);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      provider,
      apiKey: apiKey.trim(),
      model: normalizeModelForProvider(provider, model.trim()),
    });
    onClose();
  }

  const availableModels = provider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={18} color="#818cf8" />
            <strong style={{ fontSize: 15 }}>ตั้งค่า AI อธิบายภาษาไทยเชิงลึก</strong>
          </div>
          <button type="button" className="btn" style={{ padding: '4px 7px' }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 0, lineHeight: 1.55 }}>
          แอปนี้ทำงานแบบ <strong>Offline AST</strong> ได้ทันทีโดยไม่ต้องใช้ Key แต่ถ้าใส่ Gemini หรือ OpenAI API Key
          ระบบจะช่วยแปลชื่อฟังก์ชัน อธิบายตรรกะเป็นภาษาคน และช่วยชี้จุดเสี่ยงในโค้ดที่ AI เจนให้ได้แม่นยำยิ่งขึ้น (Key ถูกเก็บเฉพาะในเบราว์เซอร์ของคุณเท่านั้น)
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>ผู้ให้บริการ AI</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as 'gemini' | 'openai')}
            >
              <option value="gemini">Google Gemini API</option>
              <option value="openai">OpenAI API</option>
            </select>
          </div>

          <div className="field">
            <label>ชื่อโมเดล</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'gemini' ? 'AIza...' : 'sk-...'}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn" onClick={onClose}>
              ยกเลิก
            </button>
            <button type="submit" className="btn btn-primary">
              บันทึกการตั้งค่า
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
