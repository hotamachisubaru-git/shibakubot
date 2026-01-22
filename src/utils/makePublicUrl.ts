// src/utils/makePublicUrl.ts
const FILE_BASE_URL = "http://play.hotamachi.jp:3001";

export function makePublicUrl(filename: string) {
  return `${FILE_BASE_URL}/uploads/${filename}`;
}
