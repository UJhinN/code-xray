import React, { useState } from 'react';
import { AlertTriangle, BookOpen, GitBranch, Layers, Repeat, Sparkles } from 'lucide-react';
import type { AIExplanation, AnalysisResult, AudienceMode } from '../core/types';

interface PlainStoryPanelProps {
  analysis: AnalysisResult;
  aiExplanation: AIExplanation | null;
  audienceMode: AudienceMode;
  selectedFunctionId: string | null;
  onSelectFunction: (fnId: string) => void;
}

type DetailLevel = 1 | 2 | 3;

export const PlainStoryPanel: React.FC<PlainStoryPanelProps> = ({
  analysis,
  aiExplanation,
  audienceMode,
  selectedFunctionId,
  onSelectFunction,
}) => {
  const [level, setLevel] = useState<DetailLevel>(audienceMode === 'general' ? 2 : 3);

  const overview = aiExplanation?.overviewTh || analysis.overviewTh;

  return (
    <div className="panel-body">
      {/* Zoom level control */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="segmented">
          <button type="button" className={level === 1 ? 'active' : ''} onClick={() => setLevel(1)}>
            ระดับ 1: ภาพรวมสั้นๆ
          </button>
          <button type="button" className={level === 2 ? 'active' : ''} onClick={() => setLevel(2)}>
            ระดับ 2: เล่าเรื่องทีละฟังก์ชัน
          </button>
          <button type="button" className={level === 3 ? 'active' : ''} onClick={() => setLevel(3)}>
            ระดับ 3: เจาะลึกทีละขั้น
          </button>
        </div>

        {aiExplanation ? (
          <span className="badge badge-ai">
            <Sparkles size={12} /> อธิบายเชิงลึกโดย AI ({aiExplanation.provider.toUpperCase()})
          </span>
        ) : (
          <span className="stat-chip">โหมด Offline AST (กดปุ่ม AI ด้านบนเพื่อแปลลึกขึ้น)</span>
        )}
      </div>

      {/* Overview Card */}
      <div className="card" style={{ borderColor: 'rgba(99, 102, 241, 0.35)' }}>
        <h3 className="section-title">
          <BookOpen size={15} color="#818cf8" />
          สรุปภาพรวมของโค้ดชุดนี้
        </h3>
        <p className="story-text">{overview}</p>
      </div>

      {/* Level 1 stops at quick checklist */}
      {level === 1 && (
        <div className="card">
          <h3 className="section-title">
            <Layers size={15} color="#38bdf8" />
            องค์ประกอบหลักในไฟล์นี้
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analysis.functions.map((fn) => {
              const aiFn = aiExplanation?.functions[fn.id];
              return (
                <div
                  key={fn.id}
                  className={`card clickable ${selectedFunctionId === fn.id ? 'selected' : ''}`}
                  style={{ padding: '10px 12px' }}
                  onClick={() => onSelectFunction(fn.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{aiFn?.plainTitleTh || fn.plainTitleTh}</strong>
                    <span className="mono" style={{ fontSize: 12, color: '#a5b4fc' }}>
                      {fn.name}()
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Level 2 & 3: Detailed cards per function */}
      {level >= 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {analysis.functions.map((fn) => {
            const aiFn = aiExplanation?.functions[fn.id];
            const title = aiFn?.plainTitleTh || fn.plainTitleTh;
            const summary = aiFn?.plainSummaryTh || fn.plainSummaryTh;
            const steps = aiFn?.stepByStepTh?.length ? aiFn.stepByStepTh : fn.stepByStepTh;
            const complexityLabel =
              fn.complexity === 'complex' ? 'ซับซ้อน' : fn.complexity === 'medium' ? 'ปานกลาง' : 'เข้าใจง่าย';

            return (
              <div
                key={fn.id}
                className={`card clickable ${selectedFunctionId === fn.id ? 'selected' : ''}`}
                onClick={() => onSelectFunction(fn.id)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14.5 }}>{title}</strong>
                    <span className="mono" style={{ fontSize: 12, color: '#a5b4fc' }}>
                      {fn.name}({fn.params.join(', ')})
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`badge badge-${fn.complexity}`}>{complexityLabel}</span>
                    <span className="stat-chip">
                      บรรทัด {fn.startLine}-{fn.endLine}
                    </span>
                  </div>
                </div>

                <p className="story-text">{summary}</p>

                {level === 3 && (
                  <>
                    <ol className="steps-list">
                      {steps.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ol>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginTop: 10,
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {fn.branches > 0 && (
                        <span className="stat-chip">
                          <GitBranch size={12} /> {fn.branches} เงื่อนไข
                        </span>
                      )}
                      {fn.loops > 0 && (
                        <span className="stat-chip">
                          <Repeat size={12} /> {fn.loops} ลูป
                        </span>
                      )}
                      {fn.calledBy.length > 0 && (
                        <span className="stat-chip">ถูกเรียกโดย: {fn.calledBy.join(', ')}</span>
                      )}
                    </div>

                    {aiFn?.riskNoteTh && (
                      <div className="risk-box">
                        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <AlertTriangle size={13} /> จุดที่ควรตรวจเช็ก:
                        </strong>{' '}
                        {aiFn.riskNoteTh}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
