import { encode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';

import { supabase } from '@/src/lib/supabase';

const BUCKET = 'listing-media';

function extFor(uri: string, mime?: string): string {
  const raw = uri.split('?')[0].split('.').pop();
  if (raw && raw.length <= 5 && /^[a-z0-9]+$/i.test(raw)) return raw.toLowerCase();
  if (mime?.includes('pdf')) return 'pdf';
  if (mime?.includes('png')) return 'png';
  if (mime?.includes('heic')) return 'heic';
  if (mime?.includes('quicktime')) return 'mov';
  if (mime?.includes('mp4')) return 'mp4';
  return 'jpg';
}

function contentTypeFor(ext: string, mime?: string): string {
  if (mime) return mime;
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  return 'image/jpeg';
}

/**
 * Uploads a local file (from image-picker, camera, or document-picker) to the
 * public `listing-media` bucket and returns its public URL. Uses ArrayBuffer
 * rather than Blob, which is the reliable path on React Native.
 */
export async function uploadToBucket(
  localUri: string,
  opts: { userId: string; kind: 'photo' | 'cert' | 'video'; mimeType?: string },
): Promise<string> {
  const arrayBuffer = await new File(localUri).arrayBuffer();
  const ext = extFor(localUri, opts.mimeType);
  const path = `${opts.userId}/${opts.kind}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: contentTypeFor(ext, opts.mimeType), upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Reads a local file as base64 (for sending a certificate to the OCR function). */
export async function fileToBase64(localUri: string): Promise<string> {
  const arrayBuffer = await new File(localUri).arrayBuffer();
  return encode(arrayBuffer);
}
