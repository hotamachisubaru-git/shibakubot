import { getAiCharacter, setAiCharacter } from "../data";
import { MainCharacterId } from './character-presets';
import { getGuildIdFromConversationKey } from "./session-key";

export class CharacterStore {
  getCharacter(key: string): MainCharacterId | undefined {
    const characterId = getAiCharacter(getGuildIdFromConversationKey(key), key);
    return characterId ? (characterId as MainCharacterId) : undefined;
  }

  setCharacter(key: string, characterId: MainCharacterId): void {
    setAiCharacter(getGuildIdFromConversationKey(key), key, characterId);
  }

  resetCharacter(key: string): void {
    setAiCharacter(getGuildIdFromConversationKey(key), key, null);
  }
}
