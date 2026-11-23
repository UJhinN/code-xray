import { useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Code,
  Loader2,
  Network,
  ScanEye,
  Settings,
  Sparkles,
  User,
} from 'lucide-react';
import { analyzeCode } from './core/analyze';
import {
  generateAIExplanation,
  loadAIConfig,
  saveAIConfig,
  type AIConfig,
} from './core/aiExplainer';
import { CODE_SAMPLES } from './core/samples';
import type { AIExplanation, AudienceMode, SupportedLanguage } from './core/types';
import { CodePane } from './components/CodePane';
import { FlowMap } from './components/FlowMap';
import { FolderExplorer, type ProjectFile } from './components/FolderExplorer';
import { PlainStoryPanel } from './components/PlainStoryPanel';
import { VariableTrackerPanel } from './components/VariableTrackerPanel';
import { AISettingsModal } from './components/AISettingsModal';

type RightTab = 'flow' | 'story' | 'variables';

export function App() {
  const [code, setCode] = useState<string>(CODE_SAMPLES[0].code);
  const [language, setLanguage] = useState<SupportedLanguage | 'auto'>('auto');
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('general');
  const [rightTab, setRightTab] = useState<RightTab>('flow');
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  const [selectedFunctionId, setSelectedFunctionId] = useState<string | null>(null);
  const [selectedVariableId, setSelectedVariableId] = useState<string | null>(null);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);

  // Folder upload state
  const [folderName, setFolderName] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [skippedFilesCount, setSkippedFilesCount] = useState<number>(0);

  const [aiConfig, setAiConfig] = useState<AIConfig>(() => loadAIConfig());
  const [showAISettings, setShowAISettings] = useState<boolean>(false);
  const [aiExplanation, setAiExplanation] = useState<AIExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const analysis = useMemo(() => analyzeCode(code, language), [code, language]);

  function handleCodeChange(nextCode: string) {
    setCode(nextCode);
    setAiExplanation(null);
    setAiError(null);
    setSelectedFunctionId(null);
    setSelectedVariableId(null);
    setFocusedLine(null);

    if (activeFilePath) {
      setProjectFiles((prev) =>
        prev.map((f) =>
          f.path === activeFilePath
            ? { ...f, content: nextCode, lines: nextCode.split(/\r?\n/).length }
            : f
        )
      );
    }
  }

  function handleFolderLoaded(name: string, files: ProjectFile[], skipped: number) {
    if (files.length === 0) {
      setAiError('ไม่พบไฟล์โค้ดที่รองรับ (.js, .jsx, .ts, .tsx, .py) ในโฟลเดอร์นี้');
      return;
    }
    setFolderName(name);
    setProjectFiles(files);
    setSkippedFilesCount(skipped);
    setActiveFilePath(files[0].path);
    setLanguage(files[0].language);
    setCode(files[0].content);
    setAiExplanation(null);
    setAiError(null);
    setSelectedFunctionId(null);
    setSelectedVariableId(null);
    setFocusedLine(null);
  }

  function handleSelectProjectFile(path: string) {
    const target = projectFiles.find((f) => f.path === path);
    if (!target) return;
    setActiveFilePath(target.path);
    setLanguage(target.language);
    setCode(target.content);
    setAiExplanation(null);
    setAiError(null);
    setSelectedFunctionId(null);
    setSelectedVariableId(null);
    setFocusedLine(null);
  }

  function handleCloseFolder() {
    setFolderName(null);
    setProjectFiles([]);
    setActiveFilePath(null);
    setSkippedFilesCount(0);
  }

  function handleSampleChange(sampleId: string) {
    const sample = CODE_SAMPLES.find((s) => s.id === sampleId);
    if (!sample) return;
    handleCloseFolder();
    setLanguage('auto');
    handleCodeChange(sample.code);
    setIsEditMode(false);
  }

  function handleSelectFunction(fnId: string | null) {
    setSelectedFunctionId(fnId);
    if (fnId) {
      setSelectedVariableId(null);
      const fn = analysis.functions.find((f) => f.id === fnId);
      if (fn) setFocusedLine(fn.startLine);
    }
  }

  function handleSelectVariable(varId: string) {
    setSelectedVariableId(varId);
    setSelectedFunctionId(null);
    setRightTab('variables');
    const v = analysis.variables.find((item) => item.id === varId);
    if (v) setFocusedLine(v.declaredLine);
  }

  function handleJumpToLine(line: number) {
    setIsEditMode(false);
    setFocusedLine(line);
  }

  function handleSaveAIConfig(next: AIConfig) {
    setAiConfig(next);
    saveAIConfig(next);
  }

  async function handleRunAIExplain() {
    if (!aiConfig.apiKey.trim()) {
      setShowAISettings(true);
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await generateAIExplanation(code, analysis, aiConfig);
      setAiExplanation(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="app-shell">
      {/* Top Header */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <ScanEye size={20} />
          </div>
          <div>
            <div className="brand-title">Code X-Ray</div>
            <div className="brand-subtitle">มองทะลุโค้ดด้วยแผนภาพและภาษาคน</div>
          </div>
        </div>

        <div className="topbar-controls">
          {/* Audience Mode */}
          <div className="segmented" title="สลับมุมมองระหว่างคนทั่วไปกับนักพัฒนา">
            <button
              type="button"
              className={audienceMode === 'general' ? 'active' : ''}
              onClick={() => setAudienceMode('general')}
            >
              <User size={13} />
              โหมดคนทั่วไป
            </button>
            <button
              type="button"
              className={audienceMode === 'developer' ? 'active' : ''}
              onClick={() => setAudienceMode('developer')}
            >
              <Code size={13} />
              โหมดตรวจโค้ด AI
            </button>
          </div>

          {/* Sample Selector */}
          <select
            className="select-control"
            onChange={(e) => handleSampleChange(e.target.value)}
            defaultValue={CODE_SAMPLES[0].id}
            title="เลือกโค้ดตัวอย่าง"
          >
            {CODE_SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                ตัวอย่าง: {s.title}
              </option>
            ))}
          </select>

          {/* Language Selector */}
          <select
            className="select-control"
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage | 'auto')}
            title="เลือกภาษาโค้ด"
          >
            <option value="auto">ภาษา: อัตโนมัติ ({analysis.language})</option>
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
          </select>

          {/* AI Explain Button */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunAIExplain}
            disabled={aiLoading}
            title="ให้ AI ช่วยแปลและสรุปเชิงลึกเป็นภาษาไทย"
          >
            {aiLoading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {aiLoading ? 'กำลังให้ AI วิเคราะห์...' : 'AI อธิบายเชิงลึก'}
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => setShowAISettings(true)}
            title="ตั้งค่า API Key"
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      {(analysis.parseError || aiError) && (
        <div className="alert-banner">
          <span>
            {aiError
              ? `AI Error: ${aiError}`
              : `หมายเหตุการอ่านโค้ด: ${analysis.parseError}`}
          </span>
          {aiError && (
            <button type="button" className="btn" onClick={() => setAiError(null)}>
              ปิด
            </button>
          )}
        </div>
      )}

      {/* Split Workspace */}
      <main className={`workspace ${folderName ? 'with-folder' : ''}`}>
        {folderName && (
          <FolderExplorer
            folderName={folderName}
            files={projectFiles}
            activeFilePath={activeFilePath}
            skippedCount={skippedFilesCount}
            onSelectFile={handleSelectProjectFile}
            onCloseFolder={handleCloseFolder}
          />
        )}

        <CodePane
          code={code}
          onChangeCode={handleCodeChange}
          onFolderLoaded={handleFolderLoaded}
          activeFilePath={activeFilePath}
          analysis={analysis}
          isEditMode={isEditMode}
          onToggleEditMode={setIsEditMode}
          selectedFunctionId={selectedFunctionId}
          selectedVariableId={selectedVariableId}
          focusedLine={focusedLine}
          onSelectFunction={(fnId) => handleSelectFunction(fnId)}
          onSelectVariable={handleSelectVariable}
        />

        <section className="pane pane-right">
          <div className="tabs-bar">
            <button
              type="button"
              className={`tab-btn ${rightTab === 'flow' ? 'active' : ''}`}
              onClick={() => setRightTab('flow')}
            >
              <Network size={15} />
              แผนภาพการทำงาน ({analysis.functions.length})
            </button>
            <button
              type="button"
              className={`tab-btn ${rightTab === 'story' ? 'active' : ''}`}
              onClick={() => setRightTab('story')}
            >
              <BookOpen size={15} />
              อธิบายภาษาคน
            </button>
            <button
              type="button"
              className={`tab-btn ${rightTab === 'variables' ? 'active' : ''}`}
              onClick={() => setRightTab('variables')}
            >
              <Activity size={15} />
              ตามรอยตัวแปร ({analysis.variables.length})
            </button>
          </div>

          <div className="tab-content">
            {rightTab === 'flow' && (
              <FlowMap
                analysis={analysis}
                aiExplanation={aiExplanation}
                audienceMode={audienceMode}
                selectedFunctionId={selectedFunctionId}
                onSelectFunction={handleSelectFunction}
              />
            )}

            {rightTab === 'story' && (
              <PlainStoryPanel
                analysis={analysis}
                aiExplanation={aiExplanation}
                audienceMode={audienceMode}
                selectedFunctionId={selectedFunctionId}
                onSelectFunction={(fnId) => handleSelectFunction(fnId)}
              />
            )}

            {rightTab === 'variables' && (
              <VariableTrackerPanel
                analysis={analysis}
                aiExplanation={aiExplanation}
                selectedVariableId={selectedVariableId}
                onSelectVariable={(varId) => handleSelectVariable(varId)}
                onJumpToLine={handleJumpToLine}
              />
            )}
          </div>
        </section>
      </main>

      {showAISettings && (
        <AISettingsModal
          config={aiConfig}
          onSave={handleSaveAIConfig}
          onClose={() => setShowAISettings(false)}
        />
      )}
    </div>
  );
}

export default App;
