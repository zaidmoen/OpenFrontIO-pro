import { Game, Player, UnitType } from "../../game/Game";
import { PseudoRandom } from "../../PseudoRandom";
import { ConstructionExecution } from "../ConstructionExecution";
import { randTerritoryTileArray } from "../nation/NationUtils";

const MAX_OFFLINE_BARRACKS = 5;
const GOLD_RESERVE_MULTIPLIER = 2n;

/**
 * Lets single-player tribe bots invest in the military-strength bonus while
 * keeping enough gold for their regular attacks.
 */
export function maybeBuildOfflineBarracks(
  game: Game,
  player: Player,
  random: PseudoRandom,
): boolean {
  if (game.config().isUnitDisabled(UnitType.Barracks)) return false;

  const barracks = player.units(UnitType.Barracks);
  if (barracks.length >= MAX_OFFLINE_BARRACKS) return false;

  const cost = game.unitInfo(UnitType.Barracks).cost(game, player);
  if (player.gold() < cost * GOLD_RESERVE_MULTIPLIER) return false;

  const tiles = randTerritoryTileArray(random, game, player, 25);
  for (const tile of tiles) {
    if (!player.canBuild(UnitType.Barracks, tile)) continue;

    game.addExecution(
      new ConstructionExecution(player, UnitType.Barracks, tile),
    );
    return true;
  }

  return false;
}
