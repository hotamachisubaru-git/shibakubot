import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";

export type MenuRuntimeState = {
  sbkMin: number;
  sbkMax: number;
  currentPage: number;
};

export type MenuActionContext = {
  interaction: ChatInputCommandInteraction;
  gid: string;
  state: MenuRuntimeState;
  refreshMenu: () => Promise<void>;
  setPage: (page: number) => Promise<void>;
};

export type MenuActionHandler = (
  context: MenuActionContext,
  button: ButtonInteraction,
) => Promise<boolean>;
