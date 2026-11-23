import type {
  AnalysisResult,
  CallEdge,
  FunctionInfo,
  VariableEvent,
  VariableInfo,
} from '../types';
import {
  buildFunctionPlainSummaryTh,
  buildFunctionStepsTh,
  buildOverviewTh,
  buildVariableSummaryTh,
  computeComplexity,
  humanizeFunctionNameTh,
} from '../thaiExplainer';

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'self', 'cls', 'print', 'len', 'range', 'round', 'str', 'int', 'float',
  'bool', 'list', 'dict', 'set', 'tuple', 'sum', 'min', 'max', 'abs', 'enumerate',
]);

interface PyFuncDraft {
  id: string;
  name: string;
  kind: FunctionInfo['kind'];
  indent: number;
  startLine: number;
  endLine: number;
  params: string[];
  returns: string[];
  calls: Set<string>;
  callLines: Array<{ callee: string; line: number }>;
  branches: number;
  loops: number;
  async: boolean;
  docstring?: string;
}

interface PyVarDraft {
  id: string;
  name: string;
  scopeName: string;
  declaredLine: number;
  inferredType: string;
  sampleValue?: string;
  events: VariableEvent[];
}

interface PyScope {
  id: string;
  name: string;
  indent: number;
  func: PyFuncDraft;
  vars: Map<string, PyVarDraft>;
}

function stripCommentsAndStrings(line: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prev = line[i - 1];
    if (!inDouble && ch === "'" && prev !== '\\') {
      inSingle = !inSingle;
      out += ' ';
      continue;
    }
    if (!inSingle && ch === '"' && prev !== '\\') {
      inDouble = !inDouble;
      out += ' ';
      continue;
    }
    if (!inSingle && !inDouble && ch === '#') {
      break;
    }
    out += inSingle || inDouble ? ' ' : ch;
  }
  return out;
}

function inferPythonType(rhsRaw: string): { type: string; sample?: string } {
  const rhs = rhsRaw.trim();
  if (!rhs) return { type: 'ไม่ระบุชนิด' };
  if (/^["']/.test(rhs)) return { type: 'ข้อความ (str)', sample: rhs.slice(0, 32) };
  if (/^-?\d+\.\d+$/.test(rhs)) return { type: 'ทศนิยม (float)', sample: rhs };
  if (/^-?\d+$/.test(rhs)) return { type: 'จำนวนเต็ม (int)', sample: rhs };
  if (rhs === 'True' || rhs === 'False') return { type: 'ค่าจริง/เท็จ (bool)', sample: rhs };
  if (rhs === 'None') return { type: 'ค่าว่าง (None)', sample: 'None' };
  if (rhs.startsWith('[')) return { type: 'รายการ (list)', sample: rhs.slice(0, 36) };
  if (rhs.startsWith('{')) return { type: 'พจนานุกรม (dict)', sample: rhs.slice(0, 36) };
  if (/(>=|<=|==|!=|<|>|\band\b|\bor\b|\bnot\b)/.test(rhs)) return { type: 'ค่าจริง/เท็จ (bool)' };
  const callMatch = rhs.match(/^([A-Za-z_]\w*)\s*\(/);
  if (callMatch) return { type: `ผลลัพธ์จาก ${callMatch[1]}()` };
  return { type: 'ค่าคำนวณ' };
}

function parseParams(paramStr: string): Array<{ name: string; typeHint?: string }> {
  if (!paramStr.trim()) return [];
  const results: Array<{ name: string; typeHint?: string }> = [];
  let depth = 0;
  let current = '';
  for (const ch of paramStr) {
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      if (current.trim()) pushParam(current.trim(), results);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) pushParam(current.trim(), results);
  return results;
}

function pushParam(raw: string, out: Array<{ name: string; typeHint?: string }>) {
  const noDefault = raw.split('=')[0].trim();
  const [namePart, typePart] = noDefault.split(':').map((s) => s.trim());
  const cleanName = namePart.replace(/^\*+/, '');
  if (cleanName && cleanName !== 'self' && cleanName !== 'cls') {
    out.push({ name: cleanName, typeHint: typePart || undefined });
  }
}

export function parsePython(code: string): AnalysisResult {
  const lines = code.split(/\r?\n/);
  let idCounter = 0;

  const moduleFunc: PyFuncDraft = {
    id: 'fn_module',
    name: '(Top-Level)',
    kind: 'module',
    indent: -1,
    startLine: 1,
    endLine: lines.length,
    params: [],
    returns: [],
    calls: new Set(),
    callLines: [],
    branches: 0,
    loops: 0,
    async: false,
  };

  const funcDrafts: PyFuncDraft[] = [];
  const allVars: PyVarDraft[] = [];
  const scopeStack: PyScope[] = [
    {
      id: 'fn_module',
      name: 'Top-Level',
      indent: -1,
      func: moduleFunc,
      vars: new Map(),
    },
  ];

  function currentScope(): PyScope {
    return scopeStack[scopeStack.length - 1];
  }

  function resolveVar(name: string): PyVarDraft | undefined {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      const found = scopeStack[i].vars.get(name);
      if (found) return found;
    }
    return undefined;
  }

  function registerOrUpdateVar(
    name: string,
    lineNum: number,
    col: number,
    eventType: 'declare' | 'param' | 'update',
    inferredType: string,
    sampleValue?: string,
    detailOverride?: string
  ) {
    const scope = currentScope();
    const existing = scope.vars.get(name);
    const snippet = (lines[lineNum - 1] ?? '').trim();

    if (existing && eventType !== 'param') {
      existing.events.push({
        type: 'update',
        line: lineNum,
        column: col,
        endColumn: col + name.length,
        codeSnippet: snippet,
        scopeName: scope.name,
        detailTh: detailOverride ?? `อัปเดตค่าตัวแปร ${name}`,
      });
      return;
    }

    const draft: PyVarDraft = {
      id: `var_${++idCounter}_${name}`,
      name,
      scopeName: scope.name,
      declaredLine: lineNum,
      inferredType,
      sampleValue,
      events: [
        {
          type: eventType === 'update' ? 'declare' : eventType,
          line: lineNum,
          column: col,
          endColumn: col + name.length,
          codeSnippet: snippet,
          scopeName: scope.name,
          detailTh:
            detailOverride ??
            (eventType === 'param'
              ? `รับพารามิเตอร์ ${name} เข้าสู่ฟังก์ชัน ${scope.name}`
              : `สร้างตัวแปร ${name}${sampleValue ? ` ด้วยค่า ${sampleValue}` : ''}`),
        },
      ],
    };
    scope.vars.set(name, draft);
    allVars.push(draft);
  }

  function recordReadsInExpr(expr: string, lineNum: number, baseColOffset: number, excludeName?: string) {
    const sanitized = stripCommentsAndStrings(expr);
    const regex = /\b([A-Za-z_]\w*)\b/g;
    let m: RegExpExecArray | null;
    const snippet = (lines[lineNum - 1] ?? '').trim();

    while ((m = regex.exec(sanitized)) !== null) {
      const word = m[1];
      const idx = m.index;
      if (PYTHON_KEYWORDS.has(word)) continue;
      if (excludeName && word === excludeName) continue;
      // Ignore attribute access after '.'
      if (idx > 0 && sanitized[idx - 1] === '.') continue;
      // Ignore function call name directly followed by '('
      const after = sanitized.slice(idx + word.length).trimStart();
      if (after.startsWith('(')) continue;

      const v = resolveVar(word);
      if (v) {
        const col = baseColOffset + idx;
        if (!v.events.some((e) => e.line === lineNum && e.column === col && e.type === 'read')) {
          v.events.push({
            type: 'read',
            line: lineNum,
            column: col,
            endColumn: col + word.length,
            codeSnippet: snippet,
            scopeName: currentScope().name,
            detailTh: `นำค่า ${word} ไปใช้งาน`,
          });
        }
      }
    }
  }

  let inTripleQuote: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Handle docstrings / multi-line strings
    if (inTripleQuote) {
      if (trimmed.includes(inTripleQuote)) {
        inTripleQuote = null;
      }
      continue;
    }

    const docMatch = trimmed.match(/^("""|''')(.*?)(\1)?$/);
    if (docMatch) {
      const quote = docMatch[1];
      const content = docMatch[2].trim();
      const closedOnSameLine = Boolean(docMatch[3]);
      const scopeFn = currentScope().func;
      if (!scopeFn.docstring && lineNum <= scopeFn.startLine + 2 && content) {
        scopeFn.docstring = content;
      }
      if (!closedOnSameLine) {
        inTripleQuote = quote;
      }
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;

    // Pop scopes whose indent is >= current line indent
    while (scopeStack.length > 1 && indent <= currentScope().indent) {
      const popped = scopeStack.pop()!;
      popped.func.endLine = lineNum - 1;
    }

    // Check function definition
    const defMatch = trimmed.match(/^(async\s+)?def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*(?:->\s*([^:]+))?:/);
    if (defMatch) {
      const isAsync = Boolean(defMatch[1]);
      const fnName = defMatch[2];
      const paramStr = defMatch[3] ?? '';
      const parsedParams = parseParams(paramStr);

      const fnDraft: PyFuncDraft = {
        id: `fn_${++idCounter}_${fnName}`,
        name: fnName,
        kind: scopeStack.length > 1 ? 'method' : 'function',
        indent,
        startLine: lineNum,
        endLine: lines.length,
        params: parsedParams.map((p) => p.name),
        returns: [],
        calls: new Set(),
        callLines: [],
        branches: 0,
        loops: 0,
        async: isAsync,
      };
      funcDrafts.push(fnDraft);

      const newScope: PyScope = {
        id: fnDraft.id,
        name: fnName,
        indent,
        func: fnDraft,
        vars: new Map(),
      };
      scopeStack.push(newScope);

      for (const p of parsedParams) {
        const col = rawLine.indexOf(p.name);
        registerOrUpdateVar(
          p.name,
          lineNum,
          col >= 0 ? col : indent,
          'param',
          p.typeHint ?? 'พารามิเตอร์'
        );
      }
      continue;
    }

    const activeFunc = currentScope().func;
    activeFunc.endLine = lineNum;

    const cleanCode = stripCommentsAndStrings(trimmed);

    // Branches
    if (/^(if|elif)\b/.test(cleanCode)) {
      activeFunc.branches += 1;
    }

    // Loops
    const forMatch = trimmed.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+):$/);
    if (forMatch) {
      activeFunc.loops += 1;
      const loopVar = forMatch[1];
      const iterableExpr = forMatch[2];
      const col = rawLine.indexOf(loopVar, indent);
      registerOrUpdateVar(
        loopVar,
        lineNum,
        col >= 0 ? col : indent,
        'declare',
        'สมาชิกในลูป',
        undefined,
        `รับค่าทีละรายการจาก ${iterableExpr.trim()}`
      );
      const exprStart = rawLine.indexOf(iterableExpr);
      recordReadsInExpr(iterableExpr, lineNum, exprStart >= 0 ? exprStart : indent, loopVar);
      continue;
    }

    if (/^while\b/.test(cleanCode)) {
      activeFunc.loops += 1;
    }

    // Function calls on this line
    const callRegex = /\b([A-Za-z_]\w*)\s*\(/g;
    let cm: RegExpExecArray | null;
    while ((cm = callRegex.exec(cleanCode)) !== null) {
      const callee = cm[1];
      if (!PYTHON_KEYWORDS.has(callee)) {
        activeFunc.calls.add(callee);
        activeFunc.callLines.push({ callee, line: lineNum });
      }
    }

    // Return statement
    const retMatch = trimmed.match(/^return\b(.*)$/);
    if (retMatch) {
      const expr = (retMatch[1] ?? '').trim();
      activeFunc.returns.push(expr || 'None');
      if (expr) {
        const offset = rawLine.indexOf(expr);
        recordReadsInExpr(expr, lineNum, offset >= 0 ? offset : indent);
      }
      continue;
    }

    // Augmented assignment: x += expr
    const augMatch = trimmed.match(/^([A-Za-z_]\w*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/);
    if (augMatch) {
      const varName = augMatch[1];
      const op = augMatch[2];
      const rhs = augMatch[3];
      const col = rawLine.indexOf(varName, indent);
      registerOrUpdateVar(
        varName,
        lineNum,
        col >= 0 ? col : indent,
        'update',
        'ค่าคำนวณ',
        undefined,
        `อัปเดตค่า ${varName} (${op} ${rhs.trim()})`
      );
      const rhsOffset = rawLine.indexOf(rhs);
      recordReadsInExpr(rhs, lineNum, rhsOffset >= 0 ? rhsOffset : indent);
      continue;
    }

    // Standard assignment: x = expr or x: Type = expr
    const assignMatch = trimmed.match(/^([A-Za-z_]\w*)(?:\s*:\s*([^=]+))?\s*=(?!=)\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const typeHint = assignMatch[2]?.trim();
      const rhs = assignMatch[3];
      const col = rawLine.indexOf(varName, indent);
      const inferred = inferPythonType(rhs);
      registerOrUpdateVar(
        varName,
        lineNum,
        col >= 0 ? col : indent,
        'declare',
        typeHint ?? inferred.type,
        inferred.sample
      );
      const rhsOffset = rawLine.indexOf(rhs);
      recordReadsInExpr(rhs, lineNum, rhsOffset >= 0 ? rhsOffset : indent);
      continue;
    }

    // General expression reads
    recordReadsInExpr(trimmed, lineNum, indent);
  }

  // Close remaining scopes
  while (scopeStack.length > 1) {
    const popped = scopeStack.pop()!;
    popped.func.endLine = lines.length;
  }

  const hasTopLevelCalls = moduleFunc.calls.size > 0 || moduleFunc.branches > 0 || moduleFunc.loops > 0;
  const finalDrafts = hasTopLevelCalls ? [moduleFunc, ...funcDrafts] : funcDrafts;

  const funcByName = new Map<string, PyFuncDraft>();
  for (const f of finalDrafts) {
    if (f.kind !== 'module') funcByName.set(f.name, f);
  }

  const edges: CallEdge[] = [];
  const calledByMap = new Map<string, Set<string>>();

  for (const f of finalDrafts) {
    const seen = new Set<string>();
    for (const cl of f.callLines) {
      const target = funcByName.get(cl.callee);
      if (target && target.id !== f.id) {
        const edgeKey = `${f.id}->${target.id}`;
        if (!seen.has(edgeKey)) {
          seen.add(edgeKey);
          edges.push({
            id: `edge_${edgeKey}`,
            fromId: f.id,
            toId: target.id,
            line: cl.line,
            label: `บรรทัด ${cl.line}`,
          });
        }
        if (!calledByMap.has(target.id)) calledByMap.set(target.id, new Set());
        calledByMap.get(target.id)!.add(f.name);
      }
    }
  }

  const functions: FunctionInfo[] = finalDrafts.map((f) => {
    const internalCalls = Array.from(f.calls).filter((c) => funcByName.has(c));
    const displayCalls = internalCalls.length > 0 ? internalCalls : Array.from(f.calls).slice(0, 5);
    const fnCode = lines.slice(f.startLine - 1, f.endLine).join('\n');

    return {
      id: f.id,
      name: f.name,
      kind: f.kind,
      startLine: f.startLine,
      endLine: f.endLine,
      params: f.params,
      returns: f.returns,
      calls: displayCalls,
      calledBy: Array.from(calledByMap.get(f.id) ?? []),
      branches: f.branches,
      loops: f.loops,
      async: f.async,
      docstring: f.docstring,
      plainTitleTh: humanizeFunctionNameTh(f.name, f.kind),
      plainSummaryTh: buildFunctionPlainSummaryTh({
        name: f.name,
        kind: f.kind,
        params: f.params,
        returns: f.returns,
        calls: displayCalls,
        branches: f.branches,
        loops: f.loops,
        async: f.async,
        docstring: f.docstring,
      }),
      stepByStepTh: buildFunctionStepsTh({
        name: f.name,
        kind: f.kind,
        params: f.params,
        returns: f.returns,
        calls: displayCalls,
        branches: f.branches,
        loops: f.loops,
        async: f.async,
      }),
      complexity: computeComplexity(f.branches, f.loops, f.endLine - f.startLine + 1),
      code: fnCode,
    };
  });

  const variables: VariableInfo[] = allVars.map((v) => ({
    id: v.id,
    name: v.name,
    scopeName: v.scopeName,
    declaredLine: v.declaredLine,
    inferredType: v.inferredType,
    sampleValue: v.sampleValue,
    events: v.events.sort((a, b) => a.line - b.line || a.column - b.column),
    summaryTh: buildVariableSummaryTh(v.name, v.inferredType, v.events, v.sampleValue),
  }));

  const branchCount = functions.reduce((acc, f) => acc + f.branches, 0);
  const loopCount = functions.reduce((acc, f) => acc + f.loops, 0);

  return {
    language: 'python',
    functions,
    variables,
    edges,
    overviewTh: buildOverviewTh('python', functions, variables, branchCount, loopCount),
    stats: {
      totalLines: lines.length,
      functionCount: functions.filter((f) => f.kind !== 'module').length,
      variableCount: variables.length,
      branchCount,
      loopCount,
    },
  };
}
