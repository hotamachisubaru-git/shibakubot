import assert from "node:assert/strict";
import test from "node:test";
import {
  getSupportedAttachmentExtension,
  pickAttachmentName,
} from "../src/music/misc/uploadUtils";

const allowedExtensions = [".mp3", ".wav", ".ogg"];
const contentTypeToExtension = {
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
};

test("pickAttachmentName restores the sanitized filename extension", () => {
  assert.equal(
    pickAttachmentName({
      title: "日本語の曲名",
      name: "_.mp3",
      url: "https://cdn.discordapp.com/attachments/example/_.mp3",
    }),
    "日本語の曲名.mp3",
  );
});

test("pickAttachmentName keeps an extension already present in the title", () => {
  assert.equal(
    pickAttachmentName({
      title: "日本語の曲名.flac",
      name: "_.flac",
      url: "https://cdn.discordapp.com/attachments/example/_.flac",
    }),
    "日本語の曲名.flac",
  );
});

test("getSupportedAttachmentExtension accepts normalized MIME parameters", () => {
  assert.equal(
    getSupportedAttachmentExtension(
      "attachment",
      "Audio/MPEG; charset=binary",
      allowedExtensions,
      contentTypeToExtension,
    ),
    ".mp3",
  );
});

test("getSupportedAttachmentExtension falls back to a supported MIME type", () => {
  assert.equal(
    getSupportedAttachmentExtension(
      "attachment.bin",
      "audio/ogg",
      allowedExtensions,
      contentTypeToExtension,
    ),
    ".ogg",
  );
});

test("getSupportedAttachmentExtension rejects unknown file types", () => {
  assert.equal(
    getSupportedAttachmentExtension(
      "attachment.exe",
      "application/octet-stream",
      allowedExtensions,
      contentTypeToExtension,
    ),
    "",
  );
});
