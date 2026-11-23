interface ExplainRequestBody {
  code?: string;
  language?: string;
  overviewTh?: string;
  functions?: Array<{
    id: string;
    name: string;
    lines: string;
    params: string[];
  }>;
  variables?: Array<{
    id: string;
    name: string;
    scope: string;
    line: number;
  }>;
}

interface VercelReq {
  method?: string;
  body?: ExplainRequestBody | string;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

function buildPrompt(body: ExplainRequestBody): string {
  const code = (body.code ?? '').slice(0, 24000);
  const language = body.language ?? 'javascript';
  const funcList = (body.functions ?? []).slice(0, 40);
  const varList = (body.variables ?? []).slice(0, 35);

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

โค้ดต้นฉบับ (${language}):
\`\`\`${language}
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

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({
      error:
        'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บน Vercel กรุณาเพิ่มใน Project Settings → Environment Variables แล้ว Redeploy',
    });
  }

  let body: ExplainRequestBody;
  try {
    body = typeof req.body === 'string' ? (JSON.parse(req.body) as ExplainRequestBody) : (req.body ?? {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }

  if (!body.code || !body.code.trim()) {
    return res.status(400).json({ error: 'ไม่พบโค้ดที่ต้องการวิเคราะห์' });
  }

  const prompt = buildPrompt(body);
  const envModel = process.env.GEMINI_MODEL?.trim().replace(/^models\//, '');
  const primaryModel = envModel && envModel.startsWith('gemini-') ? envModel : 'gemini-2.5-flash';
  const candidateModels = Array.from(
    new Set([primaryModel, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'])
  );

  let text = '';
  let usedModel = primaryModel;
  let lastError = '';

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(url, {
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

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        usedModel = model;
        if (text) break;
      } else {
        const errBody = await response.text();
        lastError = `Gemini API (${response.status} on ${model}): ${errBody.slice(0, 180)}`;
        if (![404, 429, 500, 503].includes(response.status)) {
          return res.status(response.status).json({ error: lastError });
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!text) {
    return res.status(503).json({
      error: lastError || 'ระบบ AI กำลังมีผู้ใช้งานหนาแน่นชั่วคราว กรุณาลองใหม่อีกครั้ง',
    });
  }

  try {
    const parsed = extractJsonObject(text);
    return res.status(200).json({
      provider: 'gemini',
      modelUsed: usedModel,
      overviewTh: String(parsed.overviewTh ?? body.overviewTh ?? ''),
      functions: parsed.functions ?? {},
      variables: parsed.variables ?? {},
    });
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'ไม่สามารถแปลงผลลัพธ์จาก AI ได้',
    });
  }
}
