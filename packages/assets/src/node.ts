import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type { GeneratedAsset } from './generators.js';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Minimal RGBA8 PNG encoder (no ancillary chunks, so output is byte-stable). */
export function encodePng(pixels: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Final file bytes for an asset (PNG for raster payloads). */
export function assetBytes(asset: GeneratedAsset): Buffer {
  const p = asset.payload;
  switch (p.format) {
    case 'svg':
    case 'json':
      return Buffer.from(p.text, 'utf8');
    case 'wav':
      return Buffer.from(p.bytes);
    case 'rgba':
      return encodePng(p.pixels, asset.width, asset.height);
  }
}

export function assetHash(asset: GeneratedAsset): string {
  return createHash('sha256').update(assetBytes(asset)).digest('hex');
}

export function mimeType(asset: GeneratedAsset): string {
  switch (asset.payload.format) {
    case 'svg':
      return 'image/svg+xml';
    case 'rgba':
      return 'image/png';
    case 'json':
      return 'application/json';
    case 'wav':
      return 'audio/wav';
  }
}

export * from './index.js';
export * from './materialize.js';
