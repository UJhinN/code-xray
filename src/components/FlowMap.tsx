import React, { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { AlertTriangle, ArrowRight, GitBranch, Repeat, Sparkles, X } from 'lucide-react';
import type { AIExplanation, AnalysisResult, AudienceMode, FunctionInfo } from '../core/types';

interface FlowMapProps {
  analysis: AnalysisResult;
  aiExplanation: AIExplanation | null;
  audienceMode: AudienceMode;
  selectedFunctionId: string | null;
  onSelectFunction: (fnId: string | null) => void;
}

interface FuncNodeData extends Record<string, unknown> {
  fn: FunctionInfo;
  titleTh: string;
  summaryTh: string;
  audienceMode: AudienceMode;
  isSelected: boolean;
  hasAI: boolean;
}

const FunctionCardNode: React.FC<NodeProps<Node<FuncNodeData>>> = ({ data }) => {
  const { fn, titleTh, summaryTh, audienceMode, isSelected, hasAI } = data;
  const complexityLabel =
    fn.complexity === 'complex' ? 'ซับซ้อน' : fn.complexity === 'medium' ? 'ปานกลาง' : 'เข้าใจง่าย';

  return (
    <div
      className={`flow-node ${isSelected ? 'selected' : ''} ${fn.kind === 'module' ? 'is-module' : ''}`}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#818cf8', width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
        <span className={`badge badge-${fn.complexity}`}>{complexityLabel}</span>
        {hasAI && (
          <span className="badge badge-ai">
            <Sparkles size={10} /> AI
          </span>
        )}
      </div>

      <div className="flow-node-title">
        {audienceMode === 'general' ? titleTh : fn.name}
      </div>

      <div className="flow-node-code">
        {audienceMode === 'general'
          ? `${fn.name}(${fn.params.join(', ')})`
          : titleTh}
      </div>

      <div className="flow-node-desc">{summaryTh}</div>

      <div className="flow-node-meta">
        <span>
          บรรทัด {fn.startLine}-{fn.endLine}
        </span>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          {fn.branches > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <GitBranch size={11} /> {fn.branches}
            </span>
          )}
          {fn.loops > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Repeat size={11} /> {fn.loops}
            </span>
          )}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#38bdf8', width: 8, height: 8 }} />
    </div>
  );
};

const nodeTypes = {
  funcCard: FunctionCardNode,
};

function computeLayeredPositions(analysis: AnalysisResult): Map<string, { x: number; y: number }> {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const fn of analysis.functions) {
    inDegree.set(fn.id, 0);
    adj.set(fn.id, []);
  }
  for (const e of analysis.edges) {
    adj.get(e.fromId)?.push(e.toId);
    inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1);
  }

  const level = new Map<string, number>();
  const queue: string[] = [];

  for (const fn of analysis.functions) {
    if ((inDegree.get(fn.id) ?? 0) === 0) {
      level.set(fn.id, 0);
      queue.push(fn.id);
    }
  }

  // Fallback for cycles
  if (queue.length === 0 && analysis.functions.length > 0) {
    level.set(analysis.functions[0].id, 0);
    queue.push(analysis.functions[0].id);
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLv = level.get(curr) ?? 0;
    for (const next of adj.get(curr) ?? []) {
      const nextLv = currLv + 1;
      if ((level.get(next) ?? -1) < nextLv && nextLv <= analysis.functions.length) {
        level.set(next, nextLv);
        queue.push(next);
      }
    }
  }

  // Group by level
  const rows = new Map<number, string[]>();
  for (const fn of analysis.functions) {
    const lv = level.get(fn.id) ?? 0;
    const list = rows.get(lv) ?? [];
    list.push(fn.id);
    rows.set(lv, list);
  }

  const pos = new Map<string, { x: number; y: number }>();
  const colWidth = 310;
  const rowHeight = 200;

  for (const [lv, ids] of rows.entries()) {
    const totalWidth = (ids.length - 1) * colWidth;
    ids.forEach((id, idx) => {
      pos.set(id, {
        x: idx * colWidth - totalWidth / 2 + 220,
        y: lv * rowHeight + 40,
      });
    });
  }

  return pos;
}

export const FlowMap: React.FC<FlowMapProps> = ({
  analysis,
  aiExplanation,
  audienceMode,
  selectedFunctionId,
  onSelectFunction,
}) => {
  const positions = useMemo(() => computeLayeredPositions(analysis), [analysis]);

  const nodes: Node<FuncNodeData>[] = useMemo(() => {
    return analysis.functions.map((fn) => {
      const aiFn = aiExplanation?.functions[fn.id];
      const p = positions.get(fn.id) ?? { x: 0, y: 0 };
      return {
        id: fn.id,
        type: 'funcCard',
        position: p,
        data: {
          fn,
          titleTh: aiFn?.plainTitleTh || fn.plainTitleTh,
          summaryTh: aiFn?.plainSummaryTh || fn.plainSummaryTh,
          audienceMode,
          isSelected: fn.id === selectedFunctionId,
          hasAI: Boolean(aiFn),
        },
      };
    });
  }, [analysis.functions, aiExplanation, audienceMode, positions, selectedFunctionId]);

  const edges: Edge[] = useMemo(() => {
    return analysis.edges.map((e) => {
      const isHighlighted = e.fromId === selectedFunctionId || e.toId === selectedFunctionId;
      return {
        id: e.id,
        source: e.fromId,
        target: e.toId,
        label: e.label,
        animated: isHighlighted,
        style: {
          stroke: isHighlighted ? '#818cf8' : '#475569',
          strokeWidth: isHighlighted ? 2.5 : 1.7,
        },
        labelStyle: {
          fill: '#cbd5e1',
          fontSize: 11,
          fontFamily: 'IBM Plex Sans Thai, sans-serif',
        },
        labelBgStyle: {
          fill: '#0f172a',
          fillOpacity: 0.9,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHighlighted ? '#818cf8' : '#64748b',
        },
      };
    });
  }, [analysis.edges, selectedFunctionId]);

  const selectedFn = analysis.functions.find((f) => f.id === selectedFunctionId);
  const selectedAiFn = selectedFn ? aiExplanation?.functions[selectedFn.id] : undefined;

  if (analysis.functions.length === 0) {
    return (
      <div className="panel-body">
        <div className="card">
          <p className="story-text">
            ยังไม่พบฟังก์ชันในโค้ดชุดนี้ ลองวางโค้ดที่มีฟังก์ชัน หรือสลับไปดูที่แท็บ <strong>ตามรอยตัวแปร</strong> ได้ครับ
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        onNodeClick={(_, node) => onSelectFunction(node.id)}
        onPaneClick={() => onSelectFunction(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={20} size={1} />
        <Controls />
      </ReactFlow>

      {selectedFn && (
        <div className="flow-drawer">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15 }}>
                  {selectedAiFn?.plainTitleTh || selectedFn.plainTitleTh}
                </strong>
                <span className="mono" style={{ fontSize: 12.5, color: '#a5b4fc' }}>
                  {selectedFn.name}({selectedFn.params.join(', ')})
                </span>
                <span className="stat-chip">
                  บรรทัด {selectedFn.startLine}-{selectedFn.endLine}
                </span>
              </div>
              <p className="story-text" style={{ marginTop: 6 }}>
                {selectedAiFn?.plainSummaryTh || selectedFn.plainSummaryTh}
              </p>
            </div>
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 7px' }}
              onClick={() => onSelectFunction(null)}
              title="ปิดกล่องรายละเอียด"
            >
              <X size={14} />
            </button>
          </div>

          <ol className="steps-list">
            {(selectedAiFn?.stepByStepTh?.length ? selectedAiFn.stepByStepTh : selectedFn.stepByStepTh).map(
              (step, idx) => (
                <li key={idx}>{step}</li>
              )
            )}
          </ol>

          {selectedFn.calls.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowRight size={13} /> เรียกใช้งานต่อ:
              </span>
              {selectedFn.calls.map((c) => (
                <span key={c} className="stat-chip mono">
                  {c}()
                </span>
              ))}
            </div>
          )}

          {selectedAiFn?.riskNoteTh && (
            <div className="risk-box">
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={13} /> จุดที่ควรตรวจเช็ก (AI Review):
              </strong>{' '}
              {selectedAiFn.riskNoteTh}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
