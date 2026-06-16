// parse-certificate — OCR + structured extraction for a stone certificate.
//
// Input  (POST JSON): { fileBase64: string, mimeType: string }
// Output (JSON): { stone_type, shape, carat, color, clarity, cut,
//                  measurements, lab, cert_number, title, mock }
//
// If ANTHROPIC_API_KEY is set, the certificate image is parsed by a vision
// model. Otherwise (or on any error) it returns realistic mock data flagged
// with `mock: true`, so the listing flow always works end-to-end during setup.
//
// Deploy:  supabase functions deploy parse-certificate
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (optional)
//          supabase secrets set OCR_MODEL=claude-haiku-4-5     (optional, cheaper)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Current vision-capable default. Override with the OCR_MODEL secret —
// e.g. claude-haiku-4-5 for a cheaper/faster option.
const OCR_MODEL = Deno.env.get('OCR_MODEL') ?? 'claude-opus-4-8';

const EXTRACTION_PROMPT = `You are reading a gemstone grading certificate (GIA, IGI, GCAL, AGS, etc.).
Extract these fields and respond with ONLY a single minified JSON object, no prose:
{
 "stone_type": string|null,   // e.g. "Diamond", "Sapphire", "Emerald"
 "shape": string|null,        // e.g. "Round Brilliant", "Oval", "Emerald Cut"
 "carat": number|null,        // carat weight as a number, e.g. 1.52
 "color": string|null,        // e.g. "D", "F", "Fancy Vivid Blue"
 "clarity": string|null,      // e.g. "VS1", "IF", "VVS2"
 "cut": string|null,          // cut grade, e.g. "Excellent"
 "measurements": string|null, // e.g. "7.42 - 7.46 x 4.58 mm"
 "lab": string|null,          // issuing lab, e.g. "GIA"
 "cert_number": string|null   // report/certificate number as a string
}
Use null for anything not clearly present. Do not guess the cert number.`;

interface Parsed {
  stone_type: string | null;
  shape: string | null;
  carat: number | null;
  color: string | null;
  clarity: string | null;
  cut: string | null;
  measurements: string | null;
  lab: string | null;
  cert_number: string | null;
}

function mockResult(): Parsed {
  return {
    stone_type: 'Diamond',
    shape: 'Round Brilliant',
    carat: 1.52,
    color: 'D',
    clarity: 'VS1',
    cut: 'Excellent',
    measurements: '7.42 - 7.46 x 4.58 mm',
    lab: 'GIA',
    cert_number: '2231457890',
  };
}

function titleFromStone(p: Parsed): string {
  const parts: string[] = [];
  if (p.carat != null) parts.push(`${p.carat}ct`);
  if (p.shape) parts.push(p.shape);
  if (p.stone_type && p.stone_type.toLowerCase() !== 'diamond') parts.push(p.stone_type);
  if (p.color) parts.push(p.color);
  if (p.clarity) parts.push(p.clarity);
  return parts.join(' ').trim();
}

function coerce(raw: Record<string, unknown>): Parsed {
  const str = (v: unknown) =>
    v == null || v === '' ? null : String(v).trim();
  const num = (v: unknown) => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  return {
    stone_type: str(raw.stone_type),
    shape: str(raw.shape),
    carat: num(raw.carat),
    color: str(raw.color),
    clarity: str(raw.clarity),
    cut: str(raw.cut),
    measurements: str(raw.measurements),
    lab: str(raw.lab),
    cert_number: str(raw.cert_number),
  };
}

async function parseWithAnthropic(
  apiKey: string,
  fileBase64: string,
  mimeType: string,
): Promise<Parsed> {
  const mediaType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const text: string = (json.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Model did not return JSON');
  return coerce(JSON.parse(match[0]));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  let body: { fileBase64?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
      status: 400,
      headers: { ...CORS, 'content-type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  let parsed: Parsed;
  let mock = false;

  // PDFs aren't sent to the vision model here; treat as mock until a PDF->image
  // step is added. Images go straight to OCR when a key is configured.
  const isImage = (body.mimeType ?? '').startsWith('image/');

  if (apiKey && body.fileBase64 && isImage) {
    try {
      parsed = await parseWithAnthropic(apiKey, body.fileBase64, body.mimeType as string);
    } catch (err) {
      console.error('[parse-certificate] OCR failed, falling back to mock:', err);
      parsed = mockResult();
      mock = true;
    }
  } else {
    parsed = mockResult();
    mock = true;
  }

  return new Response(
    JSON.stringify({ ...parsed, title: titleFromStone(parsed), mock }),
    { headers: { ...CORS, 'content-type': 'application/json' } },
  );
});
