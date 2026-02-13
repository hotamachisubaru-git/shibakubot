import { MainCharacterId } from './character-presets';

export class CharacterStore {
  private readonly selectedCharacters = new Map<string, MainCharacterId>();

  getCharacter(key: string): MainCharacterId | undefined {
    return this.selectedCharacters.get(key);
  }

  setCharacter(key: string, characterId: MainCharacterId): void {
    this.selectedCharacters.set(key, characterId);
  }

  resetCharacter(key: string): void {
    this.selectedCharacters.delete(key);
  }
}

