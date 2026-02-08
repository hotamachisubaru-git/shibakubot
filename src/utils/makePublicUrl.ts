const DEFAULT_FILE_BASE_URL = "http://play.hotamachi.jp:3001";
const UPLOAD_PATH = "/uploads/";

function normalizeBaseUrl(raw: string | undefined): URL {
  const candidate = raw?.trim();
  if (!candidate) return new URL(DEFAULT_FILE_BASE_URL);

  try {
    return new URL(candidate);
  } catch {
    return new URL(DEFAULT_FILE_BASE_URL);
  }
}

function encodeFilePath(filename: string): string {
  return filename
    .replace(/\\/gu, "/")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

const fileBaseUrl = normalizeBaseUrl(process.env.FILE_BASE_URL);

export function makePublicUrl(filename: string): string {
  const encodedPath = encodeFilePath(filename);
  return new URL(encodedPath, new URL(UPLOAD_PATH, fileBaseUrl)).toString();
}
