import React, { useMemo, useState } from 'react';
import { Activity, Sparkles } from 'lucide-react';
import type { AIExplanation, AnalysisResult, VariableEventType } from '../core/types';

interface VariableTrackerPanelProps {
  analysis: AnalysisResult;
  aiExplanation: AIExplanation | null;
  selectedVariableId: string | null;
  onSelectVariable: (varId: string) => void;
  onJumpToLine: (line: number) => void;
}

const EVENT_LABEL: Record<VariableEventType, string> = {
  declare: 'สร้างตัวแปร',
  param: 'รับค่าพารามิเตอร์',
  update: 'เปลี่ยนแปลงค่า',
  read: 'นำไปใช้งาน',
};

export const VariableTrackerPanel: React.FC<VariableTrackerPanelProps> = ({
  analysis,
  aiExplanation,
  selectedVariableId,
  onSelectVariable,
  onJumpToLine,
}) => {
  const [query, setQuery] = useState('');

  const filteredVars = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return analysis.variables;
    return analysis.variables.filter(
      (v) => v.name.toLowerCase().includes(q) || v.scopeName.toLowerCase().includes(q)
    );
  }, [analysis.variables, query]);

  const activeVar = useMemo(() => {
    return (
      analysis.variables.find((v) => v.id === selectedVariableId) ??
      filteredVars[0] ??
      null
    );
  }, [analysis.variables, filteredVars, selectedVariableId]);

  const aiVarRole = activeVar ? aiExplanation?.variables[activeVar.id]?.roleTh : undefined;

  return (
    <div className="var-layout">
      {/* Left list of variables */}
      <div className="var-list-col">
        <div className="var-search">
          <input
            type="text"
            placeholder="ค้นหาชื่อตัวแปร หรือชื่อฟังก์ชัน..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="var-items">
          {filteredVars.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
              ไม่พบตัวแปรที่ตรงกับคำค้นหา
            </div>
          ) : (
            filteredVars.map((v) => {
              const isSel = activeVar?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={`var-item-btn ${isSel ? 'active' : ''}`}
                  onClick={() => onSelectVariable(v.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: '#7dd3fc' }}>
                      {v.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {v.events.length} จุด
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    ใน {v.scopeName} • บรรทัด {v.declaredLine}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Lifecycle Timeline */}
      <div style={{ overflow: 'auto', padding: 16 }}>
        {!activeVar ? (
          <div className="card">
            <p className="story-text">เลือกตัวแปรทางซ้าย หรือคลิกชื่อตัวแปรในโค้ด เพื่อดูเส้นทางชีวิตของตัวแปร</p>
          </div>
        ) : (
          <>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={16} color="#38bdf8" />
                  <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: '#7dd3fc' }}>
                    {activeVar.name}
                  </span>
                  <span className="stat-chip">{activeVar.inferredType}</span>
                </div>
                <span className="stat-chip">ขอบเขต: {activeVar.scopeName}</span>
              </div>

              <p className="story-text" style={{ marginTop: 10 }}>
                {aiVarRole ? (
                  <>
                    <span className="badge badge-ai" style={{ marginRight: 6 }}>
                      <Sparkles size={10} /> AI
                    </span>
                    {aiVarRole}
                  </>
                ) : (
                  activeVar.summaryTh
                )}
              </p>

              {activeVar.sampleValue && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  ตัวอย่างค่าเริ่มต้น:{' '}
                  <code className="mono" style={{ color: '#6ee7b7' }}>
                    {activeVar.sampleValue}
                  </code>
                </div>
              )}
            </div>

            <h4 className="section-title" style={{ marginTop: 16 }}>
              เส้นทางชีวิตของตัวแปร (คลิกเพื่อกระโดดไปบรรทัดนั้น)
            </h4>

            <div className="timeline">
              {activeVar.events.map((ev, idx) => (
                <div
                  key={`${ev.line}-${ev.column}-${idx}`}
                  className="timeline-item"
                  onClick={() => onJumpToLine(ev.line)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 110 }}>
                    <span className={`badge badge-${ev.type}`}>{EVENT_LABEL[ev.type]}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      บรรทัดที่ {ev.line}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {ev.detailTh}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-app)',
                        padding: '4px 8px',
                        borderRadius: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ev.codeSnippet}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
