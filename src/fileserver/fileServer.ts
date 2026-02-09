import express from "express";
import { mkdirSync } from "node:fs";
import type { Server } from "node:http";
import { getRuntimeConfig } from "../config/runtime";

type FileServerOptions = Readonly<{
  uploadDir?: string;
  host?: string;
  port?: number;
}>;

export function startFileServer(options: FileServerOptions = {}): Server {
  const runtimeConfig = getRuntimeConfig();
  const uploadDir = options.uploadDir ?? runtimeConfig.fileServer.uploadDir;
  const host = options.host ?? runtimeConfig.fileServer.host;
  const port = options.port ?? runtimeConfig.fileServer.port;

  mkdirSync(uploadDir, { recursive: true });

  const app = express();
  app.disable("x-powered-by");
  app.use("/uploads", express.static(uploadDir));

  return app.listen(port, host, () => {
    const labelHost = host === "0.0.0.0" ? "localhost" : host;
    console.log(`[file-server] http://${labelHost}:${port}/uploads/`);
  });
}
