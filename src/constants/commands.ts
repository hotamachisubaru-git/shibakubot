export const SLASH_COMMAND = {
  ping: "ping",
  sbk: "sbk",
  check: "check",
  menu: "menu",
  suimin: "suimin",
  members: "members",
  help: "help",
  maintenance: "maintenance",
  maintenanceAlias: "mt",
  stats: "stats",
  reset: "reset",
  top: "top",
  control: "control",
  immune: "immune",
} as const;

export function isMaintenanceCommand(name: string): boolean {
  return (
    name === SLASH_COMMAND.maintenance || name === SLASH_COMMAND.maintenanceAlias
  );
}

export const MUSIC_TEXT_COMMAND = {
  play: "play",
  np: "np",
  skip: "skip",
  skipAlias: "s",
  stop: "stop",
  queue: "queue",
  upload: "upload",
  ng: "ng",
  ngAlias: "ngword",
  help: "help",
  remove: "remove",
  removeAlias: "delete",
  disable: "disable",
  disableAlias: "d",
  enable: "enable",
  enableAlias: "e",
} as const;
