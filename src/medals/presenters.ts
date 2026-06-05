import type { SkyDreamPlayResult, SkyDreamStageStep } from "./types";

export function describeSkyDreamStep(step: SkyDreamStageStep): string {
  switch (step.outcome) {
    case "next":
      return `${step.totalStage}段目: NEXT`;
    case "out":
      return `${step.totalStage}段目: OUT`;
    case "jpc":
      return `${step.totalStage}段目: JPC`;
    case "multiplier":
      return `${step.totalStage}段目: x${step.multiplier ?? 0}`;
    case "dream_jp":
      return `${step.totalStage}段目: DREAM JP`;
    case "sky_jp":
      return `${step.totalStage}段目: SKY JP`;
  }
}

export function describeSkyDreamResult(play: SkyDreamPlayResult): string {
  switch (play.resultType) {
    case "out":
      return "OUT";
    case "multiplier":
      return `x${play.multiplier ?? 0}`;
    case "dream_jp":
      return "DREAM JP";
    case "sky_jp":
      return "SKY JP";
  }
}
