import { randomInt as cryptoRandomInt } from "node:crypto";

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer`);
  }
}

export function randomInt(min: number, max: number): number {
  const normalizedMin = Math.ceil(min);
  const normalizedMax = Math.floor(max);
  assertSafeInteger(normalizedMin, "min");
  assertSafeInteger(normalizedMax, "max");

  if (normalizedMax < normalizedMin) {
    throw new RangeError("max must be greater than or equal to min");
  }
  if (normalizedMax >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("max is too large");
  }

  return cryptoRandomInt(normalizedMin, normalizedMax + 1);
}

export const RANDOM_REASONS = [
  "気分",
  "ノリ",
  "なんとなく",
  "運命",
  "<:go_to_jail:1421396531830849547>",
  "<:suiminbuni_haire:1425382008900812810>",
  "<:hidoi1:1320740049842606134>",
  "<:yattekuremasitane:1421397497640652913>",
  "お楽しみはこれからだ！",
  "運試し",
  "君に決めた！",
  "今日はそういう日",
  "理由は聞かないで",
  "天の声がそう言っている",
  "<:niconico:1421395997493428284>",
  "宇宙の意思",
  "システムの都合上",
  "深い意味はない",
  "気まぐれです",
  "運命のいたずら",
  "偶然の産物",
  "未知の力",
  "<:hidoi8:1320740540358197258>",
  "特に意味はない",
  "流れに身を任せて",
  "風のささやき",
  "星の導き",
  "運命の輪",
  "偶然の一致",
  "未知の選択",
  "運命の選択",
  "偶然の選択",
  "処刑", //ここから追加
  "お仕置き",
  "罰ゲーム",
  "天罰",
  "戒め",
  "しつけ",
  "教育的指導",
] as const;

export function randomReason(): string {
  return RANDOM_REASONS[randomInt(0, RANDOM_REASONS.length - 1)];
}
