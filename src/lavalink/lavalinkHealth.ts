import { getRuntimeConfig } from "../config/runtime";
import { LAVALINK_READY_CHECK_TIMEOUT_MS } from "./lavalinkConfig";

export class LavalinkNotReadyError extends Error {}

function getLavalinkHealthUrl(): string {
  const runtimeConfig = getRuntimeConfig();
  const protocol = runtimeConfig.lavalink.secure ? "https" : "http";
  return `${protocol}://${runtimeConfig.lavalink.host}:${runtimeConfig.lavalink.port}/version`;
}

function isRetryableLavalinkError(error: unknown): boolean {
  if (error instanceof LavalinkNotReadyError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const code =
    typeof (error as { cause?: { code?: unknown } }).cause?.code === "string"
      ? ((error as { cause?: { code?: string } }).cause?.code ?? "")
      : "";
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

export async function probeLavalinkVersion(): Promise<string> {
  const runtimeConfig = getRuntimeConfig();
  const response = await fetch(getLavalinkHealthUrl(), {
    method: "GET",
    headers: { Authorization: runtimeConfig.lavalink.authorization },
    signal: AbortSignal.timeout(LAVALINK_READY_CHECK_TIMEOUT_MS),
  }).catch((error: unknown) => {
    if (isRetryableLavalinkError(error)) {
      throw new LavalinkNotReadyError("Lavalink server is not reachable yet.");
    }
    throw error;
  });

  if (response.ok) {
    const version = (await response.text()).trim();
    return version || "unknown";
  }

  if ([502, 503, 504].includes(response.status)) {
    throw new LavalinkNotReadyError(
      `Lavalink health check returned ${response.status}.`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Lavalink authorization failed with status ${response.status}.`,
    );
  }

  throw new Error(
    `Unexpected Lavalink health response: ${response.status} ${response.statusText}`,
  );
}
