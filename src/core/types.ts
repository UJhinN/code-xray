export type SupportedLanguage = 'javascript' | 'typescript' | 'python';

export type AudienceMode = 'general' | 'developer';

export type VariableEventType = 'declare' | 'param' | 'update' | 'read';

export interface VariableEvent {
  type: VariableEventType;
  line: number;
  column: number;
  endColumn: number;
  codeSnippet: string;
  scopeName: string;
  detailTh: string;
}

export interface VariableInfo {
  id: string;
  name: string;
  scopeName: string;
  declaredLine: number;
  inferredType: string;
  sampleValue?: string;
  events: VariableEvent[];
  summaryTh: string;
}

export interface FunctionInfo {
  id: string;
  name: string;
  kind: 'function' | 'method' | 'arrow' | 'class' | 'module';
  startLine: number;
  endLine: number;
  params: string[];
  returns: string[];
  calls: string[];
  calledBy: string[];
  branches: number;
  loops: number;
  async: boolean;
  docstring?: string;
  plainTitleTh: string;
  plainSummaryTh: string;
  stepByStepTh: string[];
  complexity: 'simple' | 'medium' | 'complex';
  code: string;
}

export interface CallEdge {
  id: string;
  fromId: string;
  toId: string;
  line: number;
  label?: string;
}

export interface AnalysisStats {
  totalLines: number;
  functionCount: number;
  variableCount: number;
  branchCount: number;
  loopCount: number;
}

export interface AnalysisResult {
  language: SupportedLanguage;
  functions: FunctionInfo[];
  variables: VariableInfo[];
  edges: CallEdge[];
  overviewTh: string;
  stats: AnalysisStats;
  parseError?: string;
}

export interface AIFunctionInsight {
  plainTitleTh: string;
  plainSummaryTh: string;
  stepByStepTh: string[];
  riskNoteTh?: string;
}

export interface AIVariableInsight {
  roleTh: string;
}

export interface AIExplanation {
  provider: 'gemini' | 'openai';
  overviewTh: string;
  functions: Record<string, AIFunctionInsight>;
  variables: Record<string, AIVariableInsight>;
}
