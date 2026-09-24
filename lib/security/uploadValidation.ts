export type UploadValidationInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  maxImagePixels?: number;
};

export type UploadValidationResult =
  | { ok: true; extension: string; mimeType: string }
  | { ok: false; errorCode: string; message: string };

const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
  doc: ['application/msword', 'application/octet-stream'],
  txt: ['text/plain'],
  rtf: ['application/rtf', 'text/rtf'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
};

function hasBytes(buffer: Buffer, bytes: number[]): boolean {
  return buffer.length >= bytes.length && bytes.every((value, index) => buffer[index] === value);
}

function imageDimensions(buffer: Buffer, extension: string): { width: number; height: number } | null {
  if (extension === 'png' && buffer.length >= 24 && hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (extension !== 'jpg' && extension !== 'jpeg') return null;
  if (!hasBytes(buffer, [0xff, 0xd8, 0xff])) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xc3 || marker >= 0xc5 && marker <= 0xc7 || marker >= 0xc9 && marker <= 0xcb || marker >= 0xcd && marker <= 0xcf;
    if (isStartOfFrame && segmentLength >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

function signatureMatches(buffer: Buffer, extension: string): boolean {
  if (extension === 'pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (extension === 'docx') return hasBytes(buffer, [0x50, 0x4b, 0x03, 0x04]);
  if (extension === 'doc') return hasBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (extension === 'rtf') return buffer.subarray(0, 5).toString('ascii').toLowerCase() === '{\\rtf';
  if (extension === 'png') return hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === 'jpg' || extension === 'jpeg') return hasBytes(buffer, [0xff, 0xd8, 0xff]);
  return true;
}

export function validateUploadBuffer(input: UploadValidationInput): UploadValidationResult {
  const fileName = input.fileName.trim();
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeType = input.mimeType.trim().toLowerCase();

  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0') || fileName.split(/[\\/]/).some((part) => part === '..')) {
    return { ok: false, errorCode: 'INVALID_UPLOAD_FILENAME', message: 'El nombre del archivo no es válido.' };
  }
  if (!MIME_BY_EXTENSION[extension]) {
    return { ok: false, errorCode: 'UNSUPPORTED_UPLOAD_FORMAT', message: 'El formato del archivo no está soportado.' };
  }
  if (mimeType && !MIME_BY_EXTENSION[extension].includes(mimeType)) {
    return { ok: false, errorCode: 'UPLOAD_MIME_MISMATCH', message: 'El tipo declarado no coincide con la extensión del archivo.' };
  }
  if (!signatureMatches(input.buffer, extension)) {
    return { ok: false, errorCode: 'UPLOAD_SIGNATURE_INVALID', message: 'La firma del archivo no coincide con su formato declarado.' };
  }

  const dimensions = imageDimensions(input.buffer, extension);
  const maxImagePixels = input.maxImagePixels ?? 40_000_000;
  if (dimensions && dimensions.width * dimensions.height > maxImagePixels) {
    return { ok: false, errorCode: 'UPLOAD_IMAGE_TOO_LARGE', message: 'Las dimensiones de la imagen exceden el límite permitido.' };
  }

  return { ok: true, extension, mimeType: mimeType || MIME_BY_EXTENSION[extension][0] };
}
