import { ru } from "../../shared/i18n/ru";
import type { CharacterRef, Lane } from "./domain/types";

/** Display names of lanes; a personal lane follows its character's current name. */
export function laneNames(
  lanes: readonly Lane[],
  characters: readonly CharacterRef[],
): Map<string, string> {
  const names = new Map(characters.map((c) => [c.id, c.name]));
  return new Map(
    lanes.map((l) => {
      if (l.kind === "main") return [l.id, ru.timeline.mainLane];
      if (l.kind === "personal") {
        const name = (l.characterId && names.get(l.characterId)) || l.name;
        return [l.id, ru.timeline.personalLane(name)];
      }
      return [l.id, l.name];
    }),
  );
}
