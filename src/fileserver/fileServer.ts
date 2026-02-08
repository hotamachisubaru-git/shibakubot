import express from "express";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_UPLOAD_DIR = "./files";
const DEFAULT_FILE_PORT = 3001;
const DEFAULT_FILE_HOST = "0.0.0.0";

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return fallback;
  }

  return parsed;
}

function parseHost(raw: string | undefined, fallback: string): string {
  const normalized = raw?.trim();
  return normalized ? normalized : fallback;
}

const uploadDir = path.resolve(process.env.FILE_DIR ?? DEFAULT_UPLOAD_DIR);
mkdirSync(uploadDir, { recursive: true });

const app = express();
app.disable("x-powered-by");
app.use("/uploads", express.static(uploadDir));

const port = parsePort(process.env.FILE_PORT, DEFAULT_FILE_PORT);
const host = parseHost(process.env.FILE_HOST, DEFAULT_FILE_HOST);

app.listen(port, host, () => {
  const labelHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`[file-server] http://${labelHost}:${port}/uploads/`);
});
