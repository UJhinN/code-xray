import type { AnalysisResult, SupportedLanguage } from './types';
import { parseJavaScriptLike } from './parsers/jsParser';
import { parsePython } from './parsers/pythonParser';

export function detectLanguage(code: string): SupportedLanguage {
  const pyScore =
    (/^\s*(async\s+)?def\s+\w+\s*\(/m.test(code) ? 3 : 0) +
    (/^\s*elif\s+/m.test(code) ? 2 : 0) +
    (/^\s*import\s+\w+\s*$/m.test(code) ? 1 : 0) +
    (/^\s*from\s+\w+\s+import\s+/m.test(code) ? 2 : 0) +
    (/:\s*$/m.test(code) && !/[{};]/.test(code) ? 2 : 0);

  const tsScore =
    (/\binterface\s+\w+/.test(code) ? 3 : 0) +
    (/\btype\s+\w+\s*=/.test(code) ? 2 : 0) +
    (/:\s*(string|number|boolean|void|any|unknown)\b/.test(code) ? 2 : 0);

  if (pyScore >= 2) return 'python';
  if (tsScore >= 2) return 'typescript';
  return 'javascript';
}

export function analyzeCode(
  code: string,
  language: SupportedLanguage | 'auto' = 'auto'
): AnalysisResult {
  const resolvedLang = language === 'auto' ? detectLanguage(code) : language;
  if (resolvedLang === 'python') {
    return parsePython(code);
  }
  return parseJavaScriptLike(code, resolvedLang);
}
