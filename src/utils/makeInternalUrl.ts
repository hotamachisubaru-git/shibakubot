import { getRuntimeConfig } from "../config/runtime";

function encodeFilePath(filename: string): string {
  return filename
    .replace(/\\/gu, "/")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

const runtimeConfig = getRuntimeConfig();

export function makeInternalUrl(filename: string): string {
  const encodedPath = encodeFilePath(filename);
  return new URL(encodedPath, runtimeConfig.upload.internalBaseUrl).toString();
}
