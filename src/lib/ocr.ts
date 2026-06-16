import { hasUsefulFields, parseCertificateText } from '@/src/lib/certParser';
import type { ParsedCertificate } from '@/src/lib/types';

/** Thrown when on-device OCR isn't available (e.g. running in Expo Go). */
export class OcrUnavailableError extends Error {
  constructor() {
    super('On-device OCR is unavailable in this build.');
    this.name = 'OcrUnavailableError';
  }
}

// Lazily load the native module so importing this file never crashes in Expo
// Go (where the native side isn't present). Returns null if it can't load.
function loadTextRecognition(): { recognize: (uri: string) => Promise<unknown> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-ml-kit/text-recognition');
    const impl = mod?.default ?? mod;
    return impl && typeof impl.recognize === 'function' ? impl : null;
  } catch {
    return null;
  }
}

export interface OcrResult {
  parsed: ParsedCertificate;
  rawText: string;
  /** False when OCR ran but couldn't extract any usable stone fields. */
  useful: boolean;
}

/**
 * Runs on-device text recognition on a local image URI and parses the result
 * into stone fields. Throws OcrUnavailableError if the native module isn't
 * available or the scan fails — callers fall back to manual entry.
 */
export async function recognizeAndParseCertificate(uri: string): Promise<OcrResult> {
  const TextRecognition = loadTextRecognition();
  if (!TextRecognition) throw new OcrUnavailableError();

  let rawText = '';
  try {
    const result = (await TextRecognition.recognize(uri)) as { text?: string } | string;
    rawText = typeof result === 'string' ? result : (result?.text ?? '');
  } catch {
    // Native module present in JS but not wired up (e.g. Expo Go) -> treat as
    // unavailable so the UI shows the right hint.
    throw new OcrUnavailableError();
  }

  const parsed = parseCertificateText(rawText);
  return { parsed, rawText, useful: hasUsefulFields(parsed) };
}
