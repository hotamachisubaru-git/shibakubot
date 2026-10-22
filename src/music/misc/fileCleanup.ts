import fs from "node:fs";

export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Best-effort cleanup: report failures without replacing the original operation's error. */
export async function removeTemporaryFile(filePath: string): Promise<boolean> {
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    // Another cleanup may already have removed this file.
    if (!isMissingFileError(error)) {
      console.warn(`[music] failed to remove temporary file: ${filePath}`, error);
    }
    return false;
  }
}
