import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Preparación de imágenes (membrete/logotipo) para el PDF manual. Solo JPEG y PNG sin entrelazado de
 * 8 bits; cualquier otra cosa devuelve null y el llamador avisa que la imagen no se incluyó.
 */
export type PdfImageMime = 'image/png' | 'image/jpeg';

export interface PreparedPdfImage {
  width: number;
  height: number;
  colorSpace: 'DeviceRGB' | 'DeviceGray';
  /** Datos del XObject ya codificados: DCT (JPEG) o Flate (PNG). */
  data: Buffer;
  filter: 'DCTDecode' | 'FlateDecode';
  /** Canal alfa (Flate, 8 bits, DeviceGray) para /SMask. */
  alpha?: Buffer;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function prepareJpeg(bytes: Buffer): PreparedPdfImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker >= 0xd0 && marker <= 0xd9) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const precision = bytes[offset + 4];
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      const components = bytes[offset + 9];
      if (precision !== 8 || width === 0 || height === 0 || (components !== 1 && components !== 3)) return null;
      return { width, height, colorSpace: components === 1 ? 'DeviceGray' : 'DeviceRGB', data: bytes, filter: 'DCTDecode' };
    }
    offset += 2 + length;
  }
  return null;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function preparePng(bytes: Buffer): PreparedPdfImage | null {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette: Buffer | undefined;
  let paletteAlpha: Buffer | undefined;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') paletteAlpha = Buffer.from(body);
    else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!width || !height || width * height > 16_000_000 || depth !== 8 || interlace !== 0 || idat.length === 0) return null;
  const channelsByType: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  if (!channels || (colorType === 3 && !palette)) return null;

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rowStart + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let out: number;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + left; break;
        case 2: out = value + up; break;
        case 3: out = value + ((left + up) >> 1); break;
        case 4: out = value + paeth(left, up, upLeft); break;
        default: return null;
      }
      pixels[y * stride + x] = out & 0xff;
    }
  }

  const gray = colorType === 0 || colorType === 4;
  const color = Buffer.alloc(width * height * (gray ? 1 : 3));
  let alpha: Buffer | undefined = colorType === 4 || colorType === 6 || (colorType === 3 && paletteAlpha)
    ? Buffer.alloc(width * height)
    : undefined;
  for (let i = 0; i < width * height; i += 1) {
    const p = i * channels;
    if (colorType === 0) color[i] = pixels[p];
    else if (colorType === 4) { color[i] = pixels[p]; alpha![i] = pixels[p + 1]; }
    else if (colorType === 2) { color[i * 3] = pixels[p]; color[i * 3 + 1] = pixels[p + 1]; color[i * 3 + 2] = pixels[p + 2]; }
    else if (colorType === 6) { color[i * 3] = pixels[p]; color[i * 3 + 1] = pixels[p + 1]; color[i * 3 + 2] = pixels[p + 2]; alpha![i] = pixels[p + 3]; }
    else {
      const index = pixels[p];
      color[i * 3] = palette![index * 3] ?? 0;
      color[i * 3 + 1] = palette![index * 3 + 1] ?? 0;
      color[i * 3 + 2] = palette![index * 3 + 2] ?? 0;
      if (alpha) alpha[i] = paletteAlpha![index] ?? 255;
    }
  }
  // Un canal alfa totalmente opaco no necesita máscara.
  if (alpha && alpha.every((value) => value === 255)) alpha = undefined;
  return {
    width,
    height,
    colorSpace: gray ? 'DeviceGray' : 'DeviceRGB',
    data: deflateSync(color),
    filter: 'FlateDecode',
    alpha: alpha ? deflateSync(alpha) : undefined,
  };
}

export function preparePdfImage(data: Uint8Array | Buffer, mime: PdfImageMime): PreparedPdfImage | null {
  const bytes = Buffer.from(data);
  try {
    return mime === 'image/jpeg' ? prepareJpeg(bytes) : preparePng(bytes);
  } catch {
    return null;
  }
}
