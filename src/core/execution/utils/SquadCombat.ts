import { Game, Player, TerrainType, UnitType } from "../../game/Game";

/** Completed barracks provide the same equipment bonus to squads and the army. */
export function militaryPower(game: Game, player: Player): number {
  let levels = 0;
  for (const barracks of player.units(UnitType.Barracks)) {
    if (barracks.isActive() && !barracks.isUnderConstruction()) {
      levels += barracks.level();
    }
  }
  return game.config().barracksMilitaryPower(levels);
}

/** Deterministic losses for one squad volley. The target's ground supplies cover. */
export function squadVolleyLosses(
  attackerType: UnitType.Infantry | UnitType.Sniper,
  attackerTroops: number,
  attackerTerrain: TerrainType,
  defenderTerrain: TerrainType,
  hasSniperSupport: boolean,
  attackerPower = 1,
  defenderPower = 1,
  defenderHasDefensePost = false,
): number {
  const attackRate = attackerType === UnitType.Sniper ? 0.1 : 0.06;
  const highGround =
    attackerType === UnitType.Sniper
      ? attackerTerrain === TerrainType.Mountain
        ? 1.5
        : attackerTerrain === TerrainType.Highland
          ? 1.25
          : 1
      : 1;
  const cover =
    defenderTerrain === TerrainType.Mountain
      ? 0.6
      : defenderTerrain === TerrainType.Highland
        ? 0.8
        : 1;
  const support =
    hasSniperSupport && attackerType === UnitType.Infantry ? 1.2 : 1;
  const fortification = defenderHasDefensePost ? 0.7 : 1;
  return Math.max(
    1,
    Math.floor(
      (attackerTroops *
        attackRate *
        highGround *
        cover *
        support *
        Math.max(1, attackerPower) *
        fortification) /
        Math.max(1, defenderPower),
    ),
  );
}
