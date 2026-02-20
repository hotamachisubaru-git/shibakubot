export interface ImageGenerationRequest {
  prompt: string;
  size: string;
}

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
  revisedPrompt?: string;
}

export interface SdxlImageClientOptions {
  endpoint: string;
  modelName?: string;
  apiKey?: string;
  timeoutMs: number;
  steps: number;
  cfgScale: number;
  samplerName: string;
  negativePrompt?: string;
}

export class SdxlImageClient {
  constructor(private readonly options: SdxlImageClientOptions) {}

  async generateImage(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const { width, height } = parseImageSize(request.size);
      const response = await fetch(resolveTxt2ImgEndpoint(this.options.endpoint), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          prompt: request.prompt,
          negative_prompt: this.options.negativePrompt,
          steps: this.options.steps,
          cfg_scale: this.options.cfgScale,
          sampler_name: this.options.samplerName,
          width,
          height,
          override_settings: this.options.modelName
            ? {
                sd_model_checkpoint: this.options.modelName
              }
            : undefined,
          override_settings_restore_afterwards: true
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const body = truncateErrorBody(await response.text());
        throw new Error(
          `SDXL 画像生成リクエストに失敗しました: ${response.status} ${response.statusText}${body ? ` | ${body}` : ''}`
        );
      }

      const payload = (await response.json()) as unknown;
      const imageBase64 = extractFirstBase64Image(payload);

      return {
        bytes: decodeBase64Image(imageBase64),
        mimeType: 'image/png'
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`画像生成リクエストがタイムアウトしました (${this.options.timeoutMs} ms)。`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }

    return headers;
  }
}

function resolveTxt2ImgEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('IMAGE_ENDPOINT が空です。');
  }

  if (trimmed.endsWith('/sdapi/v1/txt2img')) {
    return trimmed;
  }

  return `${trimmed}/sdapi/v1/txt2img`;
}

function parseImageSize(size: string): { width: number; height: number } {
  const match = size.trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
  if (!match) {
    throw new Error(`画像サイズの形式が不正です: "${size}"。例: 1024x1024`);
  }

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`画像サイズの値が不正です: "${size}"。`);
  }

  return { width, height };
}

function extractFirstBase64Image(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error('SDXL の応答が不正な形式です。');
  }

  const images = payload.images;
  if (!Array.isArray(images) || images.length === 0 || typeof images[0] !== 'string') {
    const details = readErrorHint(payload);
    throw new Error(`SDXL の応答に画像データが含まれていません。${details}`);
  }

  const first = images[0].trim();
  if (!first) {
    throw new Error('SDXL の応答画像データが空でした。');
  }

  return first;
}

function decodeBase64Image(value: string): Buffer {
  let normalized = value.trim();
  const dataUrlPrefix = 'base64,';
  const dataUrlMarkerIndex = normalized.indexOf(dataUrlPrefix);
  if (dataUrlMarkerIndex >= 0) {
    normalized = normalized.slice(dataUrlMarkerIndex + dataUrlPrefix.length);
  }

  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length === 0) {
    throw new Error('デコード後の画像データが空でした。');
  }
  return bytes;
}

function readErrorHint(payload: Record<string, unknown>): string {
  const hintCandidates = ['detail', 'error', 'message'];
  for (const key of hintCandidates) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return ` 追跡情報: ${truncateErrorBody(value)}`;
    }
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function truncateErrorBody(value: string, maxLength = 300): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
