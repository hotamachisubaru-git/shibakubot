// src/fileServer.ts
import express from "express";
import path from "path";
import fs from "fs";

const app = express();

// music.ts と同じ保存先に合わせる
const UPLOAD_DIR = path.resolve(process.env.FILE_DIR || "./files");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use("/uploads", express.static(UPLOAD_DIR));

const PORT = Number(process.env.FILE_PORT || 3001);

// ★外部から来れるように 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log(`📦 Upload file server: http://0.0.0.0:${PORT}/uploads/`);
});
