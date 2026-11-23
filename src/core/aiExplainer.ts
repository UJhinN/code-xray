import type { AIExplanation, AnalysisResult } from './types';

export interface AIConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'code-xray-ai-config-v1';

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AIConfig>;
      return {
        provider: parsed.provider === 'openai' ? 'openai' : 'gemini',
        apiKey: parsed.apiKey ?? '',
        model:
          parsed.model ??
          (parsed.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'),
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.5-flash',
  };
}

export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

function buildPrompt(code: string, analysis: AnalysisResult): string {
  const funcList = analysis.functions.map((f) => ({
    id: f.id,
    name: f.name,
    lines: `${f.startLine}-${f.endLine}`,
    params: f.params,
  }));
  const varList = analysis.variables.slice(0, 30).map((v) => ({
    id: v.id,
    name: v.name,
    scope: v.scopeName,
    line: v.declaredLine,
  }));

  return `คุณคือผู้ช่วยอธิบายโค้ดให้ทั้ง "คนทั่วไปที่ไม่ใช่โปรแกรมเมอร์" และ "นักพัฒนาที่ต้องการตรวจโค้ดที่ AI เจนมา" เข้าใจได้ง่ายที่สุดเป็นภาษาไทย

กรุณาวิเคราะห์โค้ดต่อไปนี้และตอบกลับเป็น JSON เท่านั้น (ห้ามมีข้อความอื่นนอก JSON) ตามโครงสร้างนี้:
{
  "overviewTh": "สรุปภาพรวมของโค้ดทั้งไฟล์เป็นภาษาคนธรรมดา 2-3 ประโยค",
  "functions": {
    "<function_id>": {
      "plainTitleTh": "ชื่อหน้าที่สั้นๆ ภาษาไทย (3-6 คำ)",
      "plainSummaryTh": "อธิบายการทำงานของฟังก์ชันนี้แบบภาษาคน 1-2 ประโยค",
      "stepByStepTh": ["ขั้นที่ 1 ...", "ขั้นที่ 2 ..."],
      "riskNoteTh": "ข้อควรระวังหรือ edge case ที่ควรเช็ก (ถ้าไม่มีให้ใส่ข้อความว่าง)"
    }
  },
  "variables": {
    "<variable_id>": {
      "roleTh": "อธิบายสั้นๆ ว่าตัวแปรนี้เก็บอะไรและสำคัญยังไง (1 ประโยค)"
    }
  }
}

รายการฟังก์ชัน (ใช้ id ให้ตรง):
${JSON.stringify(funcList)}

รายการตัวแปร (ใช้ id ให้ตรง):
${JSON.stringify(varList)}

โค้ดต้นฉบับ (${analysis.language}):
\`\`\`${analysis.language}
${code}
\`\`\``;
}

function extractJsonObject(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('AI ไม่ได้ส่งผลลัพธ์ในรูปแบบ JSON');
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

export async function generateAIExplanation(
  code: string,
  analysis: AnalysisResult,
  config: AIConfig
): Promise<AIExplanation> {
  if (!config.apiKey.trim()) {
    throw new Error('กรุณาใส่ API Key ก่อนใช้งานโหมด AI อธิบายเชิงลึก');
  }

  const prompt = buildPrompt(code, analysis);
  let text = '';

  if (config.provider === 'gemini') {
    const model = config.model.trim() || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey.trim())}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini API Error (${res.status}): ${errBody.slice(0, 180)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } else {
    const model = config.model.trim() || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a helpful Thai code explainer. Respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI API Error (${res.status}): ${errBody.slice(0, 180)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    text = data.choices?.[0]?.message?.content ?? '';
  }

  const parsed = extractJsonObject(text);
  return {
    provider: config.provider,
    overviewTh: String(parsed.overviewTh ?? analysis.overviewTh),
    functions: (parsed.functions as AIExplanation['functions']) ?? {},
    variables: (parsed.variables as AIExplanation['variables']) ?? {},
  };
}
