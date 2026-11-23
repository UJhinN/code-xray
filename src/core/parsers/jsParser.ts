import { parse } from '@babel/parser';
import type {
  AnalysisResult,
  CallEdge,
  FunctionInfo,
  SupportedLanguage,
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

type AnyNode = Record<string, unknown>;

interface ScopeFrame {
  id: string;
  name: string;
  vars: Map<string, VariableDraft>;
}

interface VariableDraft {
  id: string;
  name: string;
  scopeName: string;
  declaredLine: number;
  inferredType: string;
  sampleValue?: string;
  events: VariableEvent[];
}

interface FuncDraft {
  id: string;
  name: string;
  kind: FunctionInfo['kind'];
  startLine: number;
  endLine: number;
  params: string[];
  returns: string[];
  calls: Set<string>;
  callLines: Array<{ callee: string; line: number }>;
  branches: number;
  loops: number;
  async: boolean;
}

function getLine(node: AnyNode): number {
  const loc = node.loc as { start?: { line?: number } } | undefined;
  return loc?.start?.line ?? 1;
}

function getEndLine(node: AnyNode): number {
  const loc = node.loc as { end?: { line?: number } } | undefined;
  return loc?.end?.line ?? getLine(node);
}

function getCol(node: AnyNode): number {
  const loc = node.loc as { start?: { column?: number } } | undefined;
  return loc?.start?.column ?? 0;
}

function getEndCol(node: AnyNode): number {
  const loc = node.loc as { end?: { column?: number } } | undefined;
  return loc?.end?.column ?? getCol(node) + 1;
}

function snippetForLine(lines: string[], line: number): string {
  return (lines[line - 1] ?? '').trim();
}

function sliceNodeCode(code: string, node: AnyNode | null | undefined): string {
  if (!node) return '';
  const start = node.start as number | undefined;
  const end = node.end as number | undefined;
  if (typeof start === 'number' && typeof end === 'number') {
    const raw = code.slice(start, end).trim();
    return raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
  }
  return '';
}

function inferTypeFromNode(node: AnyNode | null | undefined, code: string): { type: string; sample?: string } {
  if (!node) return { type: 'ไม่ระบุชนิด' };
  const t = node.type as string;
  switch (t) {
    case 'NumericLiteral':
      return { type: 'ตัวเลข (number)', sample: String(node.value) };
    case 'StringLiteral':
      return { type: 'ข้อความ (string)', sample: JSON.stringify(node.value) };
    case 'TemplateLiteral':
      return { type: 'ข้อความ (template)', sample: sliceNodeCode(code, node) };
    case 'BooleanLiteral':
      return { type: 'ค่าจริง/เท็จ (boolean)', sample: String(node.value) };
    case 'NullLiteral':
      return { type: 'ค่าว่าง (null)', sample: 'null' };
    case 'ArrayExpression':
      return { type: 'รายการ (array)', sample: sliceNodeCode(code, node) };
    case 'ObjectExpression':
      return { type: 'อ็อบเจกต์ (object)', sample: sliceNodeCode(code, node) };
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return { type: 'ฟังก์ชัน (function)' };
    case 'NewExpression': {
      const callee = node.callee as AnyNode | undefined;
      const calleeName = callee?.type === 'Identifier' ? String(callee.name) : 'Object';
      return { type: `อ็อบเจกต์ (${calleeName})` };
    }
    case 'CallExpression': {
      const calleeText = extractCalleeName(node.callee as AnyNode);
      return { type: `ผลลัพธ์จาก ${calleeText || 'ฟังก์ชัน'}()` };
    }
    case 'AwaitExpression':
      return inferTypeFromNode(node.argument as AnyNode, code);
    case 'BinaryExpression': {
      const op = String(node.operator ?? '');
      if (['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(op)) {
        return { type: 'ค่าจริง/เท็จ (boolean)' };
      }
      if (['-', '*', '/', '%', '**'].includes(op)) {
        return { type: 'ตัวเลข (number)' };
      }
      return { type: 'ค่าคำนวณ' };
    }
    default:
      return { type: 'ไม่ระบุชนิด' };
  }
}

function inferTypeFromTSAnnotation(idNode: AnyNode | null | undefined, code: string): string | null {
  const typeAnn = idNode?.typeAnnotation as AnyNode | undefined;
  if (!typeAnn) return null;
  const inner = typeAnn.typeAnnotation as AnyNode | undefined;
  const text = sliceNodeCode(code, inner);
  return text || null;
}

function extractCalleeName(callee: AnyNode | null | undefined): string {
  if (!callee) return '';
  if (callee.type === 'Identifier') return String(callee.name);
  if (callee.type === 'MemberExpression') {
    const prop = callee.property as AnyNode | undefined;
    if (prop?.type === 'Identifier') return String(prop.name);
  }
  return '';
}

function extractParamNames(params: AnyNode[]): Array<{ name: string; node: AnyNode; typeAnn?: string }> {
  const result: Array<{ name: string; node: AnyNode; typeAnn?: string }> = [];
  for (const p of params) {
    if (!p) continue;
    if (p.type === 'Identifier') {
      result.push({ name: String(p.name), node: p });
    } else if (p.type === 'AssignmentPattern') {
      const left = p.left as AnyNode;
      if (left?.type === 'Identifier') {
        result.push({ name: String(left.name), node: left });
      }
    } else if (p.type === 'RestElement') {
      const arg = p.argument as AnyNode;
      if (arg?.type === 'Identifier') {
        result.push({ name: String(arg.name), node: arg });
      }
    } else if (p.type === 'ObjectPattern') {
      const props = (p.properties as AnyNode[]) ?? [];
      for (const prop of props) {
        const val = prop.value as AnyNode | undefined;
        if (val?.type === 'Identifier') {
          result.push({ name: String(val.name), node: val });
        }
      }
    }
  }
  return result;
}

export function parseJavaScriptLike(code: string, language: SupportedLanguage): AnalysisResult {
  const lines = code.split(/\r?\n/);
  let ast: AnyNode;
  let parseError: string | undefined;

  try {
    ast = parse(code, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    }) as unknown as AnyNode;
    const errors = (ast.errors as Array<{ message: string }> | undefined) ?? [];
    if (errors.length > 0) {
      parseError = errors[0].message;
    }
  } catch (err) {
    return {
      language,
      functions: [],
      variables: [],
      edges: [],
      overviewTh: 'ไม่สามารถแกะโครงสร้างโค้ดได้ กรุณาตรวจสอบ Syntax ของโค้ดอีกครั้ง',
      stats: {
        totalLines: lines.length,
        functionCount: 0,
        variableCount: 0,
        branchCount: 0,
        loopCount: 0,
      },
      parseError: err instanceof Error ? err.message : String(err),
    };
  }

  const funcDrafts: FuncDraft[] = [];
  const allVars: VariableDraft[] = [];
  let idCounter = 0;

  const moduleDraft: FuncDraft = {
    id: 'fn_module',
    name: '(Top-Level)',
    kind: 'module',
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

  const scopeStack: ScopeFrame[] = [
    {
      id: 'fn_module',
      name: 'Top-Level',
      vars: new Map(),
    },
  ];
  const funcStack: FuncDraft[] = [moduleDraft];

  function currentFunc(): FuncDraft {
    return funcStack[funcStack.length - 1];
  }

  function currentScope(): ScopeFrame {
    return scopeStack[scopeStack.length - 1];
  }

  function resolveVar(name: string): VariableDraft | undefined {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      const found = scopeStack[i].vars.get(name);
      if (found) return found;
    }
    return undefined;
  }

  function registerVar(
    name: string,
    node: AnyNode,
    eventType: 'declare' | 'param',
    inferredType: string,
    sampleValue?: string
  ) {
    const scope = currentScope();
    const line = getLine(node);
    const col = getCol(node);
    const endCol = getEndCol(node);
    const existing = scope.vars.get(name);
    if (existing) {
      existing.events.push({
        type: 'update',
        line,
        column: col,
        endColumn: endCol,
        codeSnippet: snippetForLine(lines, line),
        scopeName: scope.name,
        detailTh: `กำหนดค่าใหม่ให้ ${name}`,
      });
      return existing;
    }

    const draft: VariableDraft = {
      id: `var_${++idCounter}_${name}`,
      name,
      scopeName: scope.name,
      declaredLine: line,
      inferredType,
      sampleValue,
      events: [
        {
          type: eventType,
          line,
          column: col,
          endColumn: endCol,
          codeSnippet: snippetForLine(lines, line),
          scopeName: scope.name,
          detailTh:
            eventType === 'param'
              ? `รับค่าพารามิเตอร์ ${name} เข้าสู่ฟังก์ชัน ${scope.name}`
              : `ประกาศตัวแปร ${name}${sampleValue ? ` ด้วยค่าเริ่มต้น ${sampleValue}` : ''}`,
        },
      ],
    };
    scope.vars.set(name, draft);
    allVars.push(draft);
    return draft;
  }

  function recordVarEvent(name: string, node: AnyNode, type: 'update' | 'read', detailTh: string) {
    const v = resolveVar(name);
    if (!v) return;
    const line = getLine(node);
    const col = getCol(node);
    const endCol = getEndCol(node);
    // Avoid duplicating exact same position event
    if (v.events.some((e) => e.line === line && e.column === col && e.type === type)) {
      return;
    }
    v.events.push({
      type,
      line,
      column: col,
      endColumn: endCol,
      codeSnippet: snippetForLine(lines, line),
      scopeName: currentScope().name,
      detailTh,
    });
  }

  function enterFunction(
    name: string,
    kind: FunctionInfo['kind'],
    node: AnyNode,
    paramNodes: AnyNode[],
    bodyNode: AnyNode | null | undefined
  ) {
    const draft: FuncDraft = {
      id: `fn_${++idCounter}_${name}`,
      name,
      kind,
      startLine: getLine(node),
      endLine: getEndLine(node),
      params: [],
      returns: [],
      calls: new Set(),
      callLines: [],
      branches: 0,
      loops: 0,
      async: Boolean(node.async),
    };
    funcDrafts.push(draft);

    const frame: ScopeFrame = {
      id: draft.id,
      name,
      vars: new Map(),
    };

    funcStack.push(draft);
    scopeStack.push(frame);

    const extractedParams = extractParamNames(paramNodes);
    for (const p of extractedParams) {
      draft.params.push(p.name);
      const tsType = inferTypeFromTSAnnotation(p.node, code);
      registerVar(p.name, p.node, 'param', tsType ?? 'พารามิเตอร์');
    }

    if (bodyNode) {
      walk(bodyNode, node, 'body');
    }

    scopeStack.pop();
    funcStack.pop();
  }

  function walk(node: unknown, parent?: AnyNode, parentKey?: string) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parent, parentKey);
      return;
    }

    const n = node as AnyNode;
    const type = n.type as string | undefined;
    if (!type) return;

    // Skip TypeScript type-only nodes
    if (
      type === 'TSInterfaceDeclaration' ||
      type === 'TSTypeAliasDeclaration' ||
      type === 'TSTypeAnnotation' ||
      type === 'TSTypeParameterInstantiation'
    ) {
      return;
    }

    if (type === 'FunctionDeclaration') {
      const id = n.id as AnyNode | undefined;
      const name = id?.name ? String(id.name) : `anonymous_${getLine(n)}`;
      enterFunction(name, 'function', n, (n.params as AnyNode[]) ?? [], n.body as AnyNode);
      return;
    }

    if (type === 'ClassMethod' || type === 'ObjectMethod') {
      const key = n.key as AnyNode | undefined;
      const name = key?.name ? String(key.name) : `method_${getLine(n)}`;
      enterFunction(name, 'method', n, (n.params as AnyNode[]) ?? [], n.body as AnyNode);
      return;
    }

    if (type === 'VariableDeclarator') {
      const id = n.id as AnyNode | undefined;
      const init = n.init as AnyNode | undefined;

      if (
        id?.type === 'Identifier' &&
        init &&
        (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
      ) {
        const fnName = String(id.name);
        enterFunction(
          fnName,
          init.type === 'ArrowFunctionExpression' ? 'arrow' : 'function',
          n,
          (init.params as AnyNode[]) ?? [],
          init.body as AnyNode
        );
        return;
      }

      if (id?.type === 'Identifier') {
        const tsType = inferTypeFromTSAnnotation(id, code);
        const inferred = inferTypeFromNode(init, code);
        registerVar(String(id.name), id, 'declare', tsType ?? inferred.type, inferred.sample);
      } else if (id?.type === 'ObjectPattern') {
        const props = (id.properties as AnyNode[]) ?? [];
        for (const prop of props) {
          const val = prop.value as AnyNode | undefined;
          if (val?.type === 'Identifier') {
            registerVar(String(val.name), val, 'declare', 'ค่าที่แยกมาจากอ็อบเจกต์');
          }
        }
      } else if (id?.type === 'ArrayPattern') {
        const elems = (id.elements as AnyNode[]) ?? [];
        for (const el of elems) {
          if (el?.type === 'Identifier') {
            registerVar(String(el.name), el, 'declare', 'ค่าที่แยกมาจากรายการ');
          }
        }
      }

      if (init) walk(init, n, 'init');
      return;
    }

    if (type === 'ArrowFunctionExpression' || type === 'FunctionExpression') {
      // Inline callback (e.g. inside .map / new Promise) — walk body in current function
      // so inner variable usages and calls stay visible in the enclosing function
      const params = extractParamNames((n.params as AnyNode[]) ?? []);
      const frame: ScopeFrame = {
        id: `cb_${++idCounter}`,
        name: currentScope().name,
        vars: new Map(),
      };
      scopeStack.push(frame);
      for (const p of params) {
        registerVar(p.name, p.node, 'param', 'พารามิเตอร์ Callback');
      }
      walk(n.body, n, 'body');
      scopeStack.pop();
      return;
    }

    if (type === 'CatchClause') {
      const param = n.param as AnyNode | undefined;
      if (param?.type === 'Identifier') {
        registerVar(String(param.name), param, 'declare', 'ข้อผิดพลาด (Error)');
      }
      walk(n.body, n, 'body');
      return;
    }

    if (type === 'IfStatement' || type === 'ConditionalExpression' || type === 'SwitchCase') {
      currentFunc().branches += 1;
    }

    if (
      type === 'ForStatement' ||
      type === 'ForOfStatement' ||
      type === 'ForInStatement' ||
      type === 'WhileStatement' ||
      type === 'DoWhileStatement'
    ) {
      currentFunc().loops += 1;
    }

    if (type === 'ReturnStatement') {
      const arg = n.argument as AnyNode | undefined;
      const exprText = arg ? sliceNodeCode(code, arg) : 'void';
      currentFunc().returns.push(exprText || 'ค่าผลลัพธ์');
    }

    if (type === 'CallExpression') {
      const calleeName = extractCalleeName(n.callee as AnyNode);
      if (calleeName) {
        currentFunc().calls.add(calleeName);
        currentFunc().callLines.push({ callee: calleeName, line: getLine(n) });
      }
    }

    if (type === 'AssignmentExpression') {
      const left = n.left as AnyNode | undefined;
      if (left?.type === 'Identifier') {
        const op = String(n.operator ?? '=');
        const rightText = sliceNodeCode(code, n.right as AnyNode);
        recordVarEvent(
          String(left.name),
          left,
          'update',
          `อัปเดตค่า ${left.name} (${op} ${rightText || '...'})`
        );
        walk(n.right, n, 'right');
        return;
      }
    }

    if (type === 'UpdateExpression') {
      const arg = n.argument as AnyNode | undefined;
      if (arg?.type === 'Identifier') {
        recordVarEvent(String(arg.name), arg, 'update', `เปลี่ยนค่า ${arg.name} ด้วย ${String(n.operator)}`);
        return;
      }
    }

    if (type === 'Identifier') {
      // Ignore property names like obj.prop (non-computed) and object keys
      const isNonComputedProp =
        parent?.type === 'MemberExpression' && parentKey === 'property' && !parent.computed;
      const isObjectKey =
        parent?.type === 'ObjectProperty' && parentKey === 'key' && !parent.computed && !parent.shorthand;
      const isCallCallee = parent?.type === 'CallExpression' && parentKey === 'callee';

      if (!isNonComputedProp && !isObjectKey && !isCallCallee) {
        const name = String(n.name);
        recordVarEvent(name, n, 'read', `นำค่า ${name} ไปใช้งานในนิพจน์`);
      }
      return;
    }

    // Generic recursion over child keys
    for (const [k, val] of Object.entries(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments') {
        continue;
      }
      if (val && typeof val === 'object') {
        walk(val, n, k);
      }
    }
  }

  walk(ast.program);

  // Include module node only if it actually calls something or has top-level logic
  const hasTopLevelCalls = moduleDraft.calls.size > 0 || moduleDraft.branches > 0 || moduleDraft.loops > 0;
  const finalDrafts = hasTopLevelCalls ? [moduleDraft, ...funcDrafts] : funcDrafts;

  const funcByName = new Map<string, FuncDraft>();
  for (const f of finalDrafts) {
    if (f.kind !== 'module') funcByName.set(f.name, f);
  }

  const edges: CallEdge[] = [];
  const calledByMap = new Map<string, Set<string>>();

  for (const f of finalDrafts) {
    const seenEdges = new Set<string>();
    for (const cl of f.callLines) {
      const target = funcByName.get(cl.callee);
      if (target && target.id !== f.id) {
        const edgeKey = `${f.id}->${target.id}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
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
    const allCalls = Array.from(f.calls);
    const displayCalls = internalCalls.length > 0 ? internalCalls : allCalls.slice(0, 5);
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
    language,
    functions,
    variables,
    edges,
    overviewTh: buildOverviewTh(language, functions, variables, branchCount, loopCount),
    stats: {
      totalLines: lines.length,
      functionCount: functions.filter((f) => f.kind !== 'module').length,
      variableCount: variables.length,
      branchCount,
      loopCount,
    },
    parseError,
  };
}
