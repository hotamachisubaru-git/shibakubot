import fs from "node:fs/promises";
import path from "node:path";

type AttachmentLike = {
  title?: string | null;
  name?: string | null;
  url: string;
};

function decodeAttachmentName(name: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(name)) return name;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function getAttachmentNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop() ?? "";
    return decodeAttachmentName(base);
  } catch {
    return "";
  }
}

export function pickAttachmentName(attachment: AttachmentLike): string {
  const fromTitle = decodeAttachmentName(attachment.title ?? "");
  if (fromTitle) return fromTitle;

  const fromName = decodeAttachmentName(attachment.name ?? "");
  if (fromName) return fromName;

  const fromUrl = getAttachmentNameFromUrl(attachment.url);
  return fromUrl || "upload";
}

function stripOptionalQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function getAttachmentNameFromContentDisposition(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) return null;

  const extendedMatch = contentDisposition.match(/filename\*\s*=\s*([^;]+)/iu);
  if (extendedMatch?.[1]) {
    const token = stripOptionalQuotes(extendedMatch[1]);
    const parts = token.split("''", 2);
    const encoded = parts.length === 2 ? parts[1] : token;
    try {
      return decodeAttachmentName(decodeURIComponent(encoded));
    } catch {
      return decodeAttachmentName(encoded);
    }
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/iu);
  if (plainMatch?.[1]) {
    return decodeAttachmentName(stripOptionalQuotes(plainMatch[1]));
  }

  return null;
}

export function ensureFileExtension(filename: string, ext: string): string {
  if (!ext) return filename;
  return filename.toLowerCase().endsWith(ext) ? filename : `${filename}${ext}`;
}

export function toDisplayTrackTitleFromFilename(filename: string): string {
  const parsed = path.parse(filename);
  const fromStem = parsed.name.trim();
  if (fromStem) return fromStem;

  const fromRaw = filename.trim();
  return fromRaw || "upload";
}

export function isLikelyOpaqueTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "unknown" || normalized === "unknown title") return true;

  const withoutExt = normalized.replace(/\.[a-z0-9]{2,5}$/iu, "");
  if (/^[0-9a-f]{16,}$/iu.test(withoutExt)) return true;
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(withoutExt)) {
    return true;
  }

  return false;
}

export function shouldPreferMetadataTitle(filenameTitle: string): boolean {
  const normalized = filenameTitle.trim().toLowerCase();
  if (normalized === "upload" || normalized === "file") return true;
  return isLikelyOpaqueTitle(filenameTitle);
}

function trimId3Text(value: string): string {
  return value.replace(/\0/g, "").trim();
}

function swapUtf16ByteOrder(value: Buffer): Buffer {
  const swapped = Buffer.allocUnsafe(value.length);
  for (let i = 0; i + 1 < value.length; i += 2) {
    swapped[i] = value[i + 1];
    swapped[i + 1] = value[i];
  }
  if (value.length % 2 === 1) {
    swapped[value.length - 1] = value[value.length - 1];
  }
  return swapped;
}

function decodeId3Text(data: Buffer, encodingByte: number): string {
  if (!data.length) return "";
  switch (encodingByte) {
    case 0:
      return data.toString("latin1");
    case 1: {
      if (data.length >= 2) {
        const bom = data.readUInt16BE(0);
        if (bom === 0xfffe) return data.slice(2).toString("utf16le");
        if (bom === 0xfeff)
          return swapUtf16ByteOrder(data.slice(2)).toString("utf16le");
      }
      return data.toString("utf16le");
    }
    case 2:
      return swapUtf16ByteOrder(data).toString("utf16le");
    case 3:
      return data.toString("utf8");
    default:
      return data.toString("utf8");
  }
}

function decodeSynchsafeInt(bytes: Buffer): number {
  if (bytes.length < 4) return 0;
  return (
    ((bytes[0] & 0x7f) << 21) |
    ((bytes[1] & 0x7f) << 14) |
    ((bytes[2] & 0x7f) << 7) |
    (bytes[3] & 0x7f)
  );
}

function readId3v2Title(buffer: Buffer): string | null {
  if (buffer.length < 10) return null;
  if (buffer.toString("ascii", 0, 3) !== "ID3") return null;
  const version = buffer[3];
  if (version !== 3 && version !== 4) return null;

  const flags = buffer[5];
  const tagSize = decodeSynchsafeInt(buffer.slice(6, 10));
  let offset = 10;

  if (flags & 0x40) {
    if (offset + 4 <= buffer.length) {
      if (version === 3) {
        const extSize = buffer.readUInt32BE(offset);
        offset += 4 + extSize;
      } else {
        const extSize = decodeSynchsafeInt(buffer.slice(offset, offset + 4));
        offset += extSize;
      }
    }
  }

  const tagEnd = Math.min(buffer.length, offset + tagSize);
  while (offset + 10 <= tagEnd) {
    const frameId = buffer.toString("ascii", offset, offset + 4);
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
    const frameSize =
      version === 4
        ? decodeSynchsafeInt(buffer.slice(offset + 4, offset + 8))
        : buffer.readUInt32BE(offset + 4);
    if (!frameSize) break;

    const frameDataStart = offset + 10;
    const frameDataEnd = frameDataStart + frameSize;
    if (frameDataEnd > buffer.length) break;

    if (frameId === "TIT2") {
      const encodingByte = buffer[frameDataStart];
      const title = trimId3Text(
        decodeId3Text(
          buffer.slice(frameDataStart + 1, frameDataEnd),
          encodingByte,
        ),
      );
      return title || null;
    }

    offset = frameDataEnd;
  }

  return null;
}

function readId3v1Title(buffer: Buffer): string | null {
  if (buffer.length < 128) return null;
  const start = buffer.length - 128;
  if (buffer.toString("ascii", start, start + 3) !== "TAG") return null;
  const raw = buffer.slice(start + 3, start + 33).toString("latin1");
  const title = trimId3Text(raw);
  return title || null;
}

export function getId3TitleFromBuffer(buffer: Buffer): string | null {
  return readId3v2Title(buffer) ?? readId3v1Title(buffer);
}

const ID3V2_SCAN_BYTES = 1024 * 1024;

export async function getId3TitleFromFile(filePath: string): Promise<string | null> {
  const file = await fs.open(filePath, "r");

  try {
    const stat = await file.stat();
    const fileSize = stat.size;
    if (fileSize <= 0) return null;

    const headLength = Math.min(fileSize, ID3V2_SCAN_BYTES);
    if (headLength > 0) {
      const head = Buffer.alloc(headLength);
      const { bytesRead } = await file.read(head, 0, headLength, 0);
      const titleFromHead = getId3TitleFromBuffer(head.subarray(0, bytesRead));
      if (titleFromHead) return titleFromHead;
    }

    if (fileSize >= 128) {
      const tail = Buffer.alloc(128);
      const { bytesRead } = await file.read(tail, 0, 128, fileSize - 128);
      if (bytesRead === 128) {
        const titleFromTail = getId3TitleFromBuffer(tail);
        if (titleFromTail) return titleFromTail;
      }
    }
  } finally {
    await file.close();
  }

  return null;
}
