import { supabase } from '@/src/lib/supabase';
import type { ParsedCertificate } from '@/src/lib/types';

/**
 * Sends a certificate image (base64) to the `parse-certificate` edge function,
 * which runs OCR + structured extraction and returns autofill-ready stone
 * details. The function gracefully returns mock data when no OCR provider key
 * is configured, so the listing flow always works end-to-end.
 */
export async function parseCertificate(
  fileBase64: string,
  mimeType: string,
): Promise<ParsedCertificate> {
  const { data, error } = await supabase.functions.invoke<ParsedCertificate>(
    'parse-certificate',
    { body: { fileBase64, mimeType } },
  );

  if (error) {
    throw new Error(error.message ?? 'Certificate parsing failed');
  }
  if (!data) {
    throw new Error('Certificate parsing returned no data');
  }
  return data;
}

/** Builds a human listing title from parsed stone details, e.g. "1.52ct Round D VS1". */
export function titleFromStone(p: Partial<ParsedCertificate>): string {
  const parts: string[] = [];
  if (p.carat != null) parts.push(`${p.carat}ct`);
  if (p.shape) parts.push(p.shape);
  if (p.stone_type && p.stone_type.toLowerCase() !== 'diamond') parts.push(p.stone_type);
  if (p.color) parts.push(p.color);
  if (p.clarity) parts.push(p.clarity);
  return parts.join(' ').trim();
}
