import { TerrainType, UnitType } from "../../game/Game";

/** Deterministic losses for one squad volley. The target's ground supplies cover. */
export function squadVolleyLosses(
  attackerType: UnitType.Infantry | UnitType.Sniper,
  attackerTroops: number,
  attackerTerrain: TerrainType,
  defenderTerrain: TerrainType,
  hasSniperSupport: boolean,
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
  return Math.max(
    1,
    Math.floor(attackerTroops * attackRate * highGround * cover * support),
  );
}
