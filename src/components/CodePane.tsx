import React, { useEffect, useMemo, useRef } from 'react';
import { Code2, Eye, Upload } from 'lucide-react';
import type { AnalysisResult, FunctionInfo, VariableEventType, VariableInfo } from '../core/types';

interface CodePaneProps {
  code: string;
  onChangeCode: (next: string) => void;
  analysis: AnalysisResult;
  isEditMode: boolean;
  onToggleEditMode: (edit: boolean) => void;
  selectedFunctionId: string | null;
  selectedVariableId: string | null;
  focusedLine: number | null;
  onSelectFunction: (fnId: string) => void;
  onSelectVariable: (varId: string) => void;
}

const EVENT_LABEL: Record<VariableEventType, string> = {
  declare: 'สร้างตัวแปร',
  param: 'รับค่าเข้า',
  update: 'เปลี่ยนค่า',
  read: 'นำไปใช้',
};

const CODE_KEYWORDS = new Set([
  // JS / TS
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally',
  'for', 'from', 'function', 'if', 'implements', 'import', 'in', 'instanceof',
  'interface', 'let', 'new', 'null', 'of', 'private', 'protected', 'public',
  'readonly', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'yield',
  // Python
  'and', 'as', 'assert', 'def', 'del', 'elif', 'except', 'False', 'global',
  'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'True', 'with',
]);

const CODE_TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'unknown', 'never', 'Promise', 'Array',
  'Record', 'Error', 'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple',
]);

export const CodePane: React.FC<CodePaneProps> = ({
  code,
  onChangeCode,
  analysis,
  isEditMode,
  onToggleEditMode,
  selectedFunctionId,
  selectedVariableId,
  focusedLine,
  onSelectFunction,
  onSelectVariable,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const lines = useMemo(() => code.split(/\r?\n/), [code]);

  const selectedFunc: FunctionInfo | undefined = useMemo(
    () => analysis.functions.find((f) => f.id === selectedFunctionId),
    [analysis.functions, selectedFunctionId]
  );

  const selectedVar: VariableInfo | undefined = useMemo(
    () => analysis.variables.find((v) => v.id === selectedVariableId),
    [analysis.variables, selectedVariableId]
  );

  // Map line -> events for the selected variable
  const varEventsByLine = useMemo(() => {
    const map = new Map<number, VariableEventType[]>();
    if (!selectedVar) return map;
    for (const ev of selectedVar.events) {
      const existing = map.get(ev.line) ?? [];
      if (!existing.includes(ev.type)) existing.push(ev.type);
      map.set(ev.line, existing);
    }
    return map;
  }, [selectedVar]);

  // Quick lookup for clickable identifiers
  const fnNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const fn of analysis.functions) {
      if (fn.kind !== 'module') map.set(fn.name, fn.id);
    }
    return map;
  }, [analysis.functions]);

  const varNameToCandidates = useMemo(() => {
    const map = new Map<string, VariableInfo[]>();
    for (const v of analysis.variables) {
      const list = map.get(v.name) ?? [];
      list.push(v);
      map.set(v.name, list);
    }
    return map;
  }, [analysis.variables]);

  useEffect(() => {
    if (isEditMode) return;
    const targetLine = focusedLine ?? selectedFunc?.startLine ?? selectedVar?.declaredLine ?? null;
    if (!targetLine) return;
    const el = lineRefs.current.get(targetLine);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedLine, selectedFunc, selectedVar, isEditMode]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeCode(reader.result);
        onToggleEditMode(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function renderInteractiveLine(lineText: string, lineNumber: number) {
    if (!lineText) return ' ';

    // Tokenize comments, strings, numbers, identifiers, and other characters
    const tokenRegex =
      /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIdx = 0;

    while ((match = tokenRegex.exec(lineText)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(
          <React.Fragment key={keyIdx++}>{lineText.slice(lastIndex, match.index)}</React.Fragment>
        );
      }

      const tok = match[0];
      lastIndex = match.index + tok.length;

      // Comments
      if (tok.startsWith('//') || tok.startsWith('#')) {
        nodes.push(
          <span key={keyIdx++} className="syn-comment">
            {tok}
          </span>
        );
        continue;
      }

      // Strings & template literals
      if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) {
        nodes.push(
          <span key={keyIdx++} className="syn-string">
            {tok}
          </span>
        );
        continue;
      }

      // Numbers
      if (/^\d/.test(tok)) {
        nodes.push(
          <span key={keyIdx++} className="syn-number">
            {tok}
          </span>
        );
        continue;
      }

      // Keywords
      if (CODE_KEYWORDS.has(tok)) {
        nodes.push(
          <span key={keyIdx++} className="syn-keyword">
            {tok}
          </span>
        );
        continue;
      }

      // Clickable function
      const fnId = fnNameToId.get(tok);
      if (fnId) {
        const isSel = fnId === selectedFunctionId;
        nodes.push(
          <span
            key={keyIdx++}
            className={`token-clickable token-fn ${isSel ? 'selected' : ''}`}
            title={`คลิกเพื่อดูฟังก์ชัน ${tok}`}
            onClick={() => onSelectFunction(fnId)}
          >
            {tok}
          </span>
        );
        continue;
      }

      // Clickable variable
      const varList = varNameToCandidates.get(tok);
      if (varList && varList.length > 0) {
        const best =
          varList.find((v) => v.events.some((ev) => ev.line === lineNumber)) ??
          varList.find((v) => v.declaredLine <= lineNumber) ??
          varList[0];
        const isSel = best.id === selectedVariableId;
        nodes.push(
          <span
            key={keyIdx++}
            className={`token-clickable token-var ${isSel ? 'selected' : ''}`}
            title={`คลิกเพื่อตามรอยตัวแปร ${tok} (${best.inferredType})`}
            onClick={() => onSelectVariable(best.id)}
          >
            {tok}
          </span>
        );
        continue;
      }

      // Built-in types
      if (CODE_TYPES.has(tok)) {
        nodes.push(
          <span key={keyIdx++} className="syn-type">
            {tok}
          </span>
        );
        continue;
      }

      nodes.push(<React.Fragment key={keyIdx++}>{tok}</React.Fragment>);
    }

    if (lastIndex < lineText.length) {
      nodes.push(<React.Fragment key={keyIdx++}>{lineText.slice(lastIndex)}</React.Fragment>);
    }

    return nodes;
  }

  return (
    <div className="pane pane-left">
      <div className="pane-header">
        <div className="pane-header-left">
          <div className="segmented">
            <button
              type="button"
              className={!isEditMode ? 'active' : ''}
              onClick={() => onToggleEditMode(false)}
            >
              <Eye size={14} />
              โหมด X-Ray (คลิกดูได้)
            </button>
            <button
              type="button"
              className={isEditMode ? 'active' : ''}
              onClick={() => onToggleEditMode(true)}
            >
              <Code2 size={14} />
              วาง / แก้ไขโค้ด
            </button>
          </div>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".js,.jsx,.ts,.tsx,.py,.txt"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            title="อัปโหลดไฟล์ .js, .ts, .tsx, .py"
          >
            <Upload size={14} />
            อัปโหลดไฟล์
          </button>
        </div>
      </div>

      <div className="stats-strip">
        <span className="stat-chip">ภาษา: {analysis.language.toUpperCase()}</span>
        <span className="stat-chip">{analysis.stats.totalLines} บรรทัด</span>
        <span className="stat-chip">{analysis.stats.functionCount} ฟังก์ชัน</span>
        <span className="stat-chip">{analysis.stats.variableCount} ตัวแปร</span>
        {!isEditMode && (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>
            คลิกชื่อ <span style={{ color: '#c4b5fd' }}>ฟังก์ชัน</span> หรือ{' '}
            <span style={{ color: '#7dd3fc' }}>ตัวแปร</span> ในโค้ดได้เลย
          </span>
        )}
      </div>

      {isEditMode ? (
        <textarea
          className="code-textarea"
          value={code}
          onChange={(e) => onChangeCode(e.target.value)}
          spellCheck={false}
          placeholder="วางโค้ด JavaScript, TypeScript หรือ Python ที่นี่..."
        />
      ) : (
        <div className="code-scroll">
          {lines.map((lineText, idx) => {
            const lineNum = idx + 1;
            const evTypes = varEventsByLine.get(lineNum) ?? [];
            const primaryEv = evTypes[0];
            const inSelectedFunc =
              selectedFunc &&
              selectedFunc.kind !== 'module' &&
              lineNum >= selectedFunc.startLine &&
              lineNum <= selectedFunc.endLine;

            let lineClass = 'code-line';
            if (primaryEv) {
              lineClass += ` var-${primaryEv}`;
            } else if (inSelectedFunc) {
              lineClass += ' in-func';
            }
            if (focusedLine === lineNum) {
              lineClass += ' focused-line';
            }

            return (
              <div
                key={lineNum}
                ref={(el) => {
                  if (el) lineRefs.current.set(lineNum, el);
                  else lineRefs.current.delete(lineNum);
                }}
                className={lineClass}
              >
                <span className="line-num">{lineNum}</span>
                <span className="line-content">{renderInteractiveLine(lineText, lineNum)}</span>
                {evTypes.length > 0 && (
                  <span className="line-badges">
                    {evTypes.map((evType) => (
                      <span key={evType} className={`badge badge-${evType}`}>
                        {EVENT_LABEL[evType]}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
