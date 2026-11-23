import type { AIExplanation, AnalysisResult } from './types';

export async function generateAIExplanation(
  code: string,
  analysis: AnalysisResult
): Promise<AIExplanation> {
  const payload = {
    code,
    language: analysis.language,
    overviewTh: analysis.overviewTh,
    functions: analysis.functions.map((f) => ({
      id: f.id,
      name: f.name,
      lines: `${f.startLine}-${f.endLine}`,
      params: f.params,
    })),
    variables: analysis.variables.slice(0, 35).map((v) => ({
      id: v.id,
      name: v.name,
      scope: v.scopeName,
      line: v.declaredLine,
    })),
  };

  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => null)) as
    | (AIExplanation & { error?: string })
    | null;

  if (!res.ok) {
    throw new Error(
      data?.error ||
        `ไม่สามารถเรียกใช้งาน /api/explain ได้ (${res.status}) — หากกำลังรันแบบ Local ให้ Deploy บน Vercel และตั้งค่า GEMINI_API_KEY`
    );
  }

  if (!data) {
    throw new Error('ไม่ได้รับข้อมูลตอบกลับจากเซิร์ฟเวอร์ AI');
  }

  return {
    provider: 'gemini',
    overviewTh: data.overviewTh || analysis.overviewTh,
    functions: data.functions ?? {},
    variables: data.variables ?? {},
  };
}
