export function parseStoredSettingJson(raw: string, gid: string, key: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw Object.assign(
      new Error(`[data] Invalid JSON in stored setting ${key} (guild=${gid})`),
      { cause },
    );
  }
}
