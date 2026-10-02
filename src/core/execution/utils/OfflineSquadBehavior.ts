import { Game, Player, TerrainType, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { ConstructionExecution } from "../ConstructionExecution";
import { MoveSquadExecution } from "../MoveSquadExecution";

/** Recruit and order a small number of tactical squads for offline tribes. */
export function maybeUseOfflineSquads(game: Game, tribe: Player): boolean {
  const barracks = tribe
    .units(UnitType.Barracks)
    .find(
      (b) =>
        b.isActive() &&
        !b.isUnderConstruction() &&
        game.owner(b.tile()) === tribe,
    );
  if (!barracks) return false;

  // Pull depleted squads back to the barracks for paid replacements.
  for (const unit of tribe.units(UnitType.Infantry, UnitType.Sniper)) {
    const fullStrength = unit.type() === UnitType.Sniper ? 120 : 300;
    if (
      unit.isActive() &&
      unit.troops() < fullStrength * 0.35 &&
      unit.tile() !== barracks.tile() &&
      unit.targetTile() !== barracks.tile()
    ) {
      game.addExecution(
        new MoveSquadExecution(tribe, unit.id(), barracks.tile()),
      );
      return true;
    }
  }

  const neighbors: TileRef[] = [0, 0, 0, 0];
  let frontier: TileRef | undefined;
  let target: TileRef | undefined;
  let elevated: TileRef | undefined;
  let elevatedTarget: TileRef | undefined;
  for (const tile of tribe.borderTiles()) {
    const count = game.map().neighbors4(tile, neighbors);
    for (let i = 0; i < count; i++) {
      const next = neighbors[i];
      if (!game.isLand(next) || game.isImpassable(next)) continue;
      const defender = game.owner(next);
      if (
        defender === tribe ||
        (defender.isPlayer() && tribe.isFriendly(defender))
      )
        continue;
      frontier ??= tile;
      target ??= next;
      // Snipers support battles against players; an elevated neutral border
      // must not prevent us from finding an elevated enemy frontier later.
      if (
        defender.isPlayer() &&
        game.map().terrainType(tile) !== TerrainType.Plains
      ) {
        elevated ??= tile;
        elevatedTarget ??= next;
      }
      break;
    }
    if (frontier !== undefined && elevated !== undefined) break;
  }
  if (frontier === undefined || target === undefined) return false;

  for (const unit of tribe.units(UnitType.Infantry, UnitType.Sniper)) {
    if (!unit.isActive() || unit.targetTile() !== undefined) continue;
    if (unit.troops() < (unit.type() === UnitType.Sniper ? 120 : 300) * 0.35)
      continue;
    // Snipers support a battle; they cannot claim neutral territory alone.
    if (
      unit.type() === UnitType.Sniper &&
      !game.owner(elevatedTarget ?? target).isPlayer()
    )
      continue;
    game.addExecution(
      new MoveSquadExecution(
        tribe,
        unit.id(),
        unit.type() === UnitType.Sniper ? (elevatedTarget ?? target) : target,
      ),
    );
    return true;
  }

  const type =
    elevated !== undefined &&
    elevatedTarget !== undefined &&
    game.owner(elevatedTarget).isPlayer() &&
    tribe.unitCount(UnitType.Sniper) < 2 &&
    !game.config().isUnitDisabled(UnitType.Sniper)
      ? UnitType.Sniper
      : UnitType.Infantry;
  if (game.config().isUnitDisabled(type) || tribe.unitCount(type) >= 3)
    return false;
  const troops = type === UnitType.Sniper ? 120 : 300;
  if (tribe.troops() < troops * 4) return false;
  if (tribe.gold() < game.unitInfo(type).cost(game, tribe) * 2n) return false;
  const spawn = type === UnitType.Sniper ? (elevated ?? frontier) : frontier;
  if (tribe.canBuild(type, spawn) === false) return false;
  game.addExecution(new ConstructionExecution(tribe, type, spawn));
  return true;
}
