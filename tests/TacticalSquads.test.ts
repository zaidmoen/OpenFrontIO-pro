import { ConstructionExecution } from "../src/core/execution/ConstructionExecution";
import { MoveSquadExecution } from "../src/core/execution/MoveSquadExecution";
import { SquadExecution } from "../src/core/execution/SquadExecution";
import { maybeUseOfflineSquads } from "../src/core/execution/utils/OfflineSquadBehavior";
import {
  PlayerInfo,
  PlayerType,
  TerrainType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";
import { diffSnapshots, roundTrip } from "./util/Snapshot";
import { executeTicks } from "./util/utils";

async function gameWithFrontier() {
  const game = await setup(
    "big_plains",
    { instantBuild: true, infiniteGold: true },
    [
      new PlayerInfo("human", PlayerType.Human, null, "human"),
      new PlayerInfo("enemy", PlayerType.Human, null, "enemy"),
    ],
  );
  const human = game.player("human");
  const enemy = game.player("enemy");
  for (let x = 20; x <= 26; x++)
    for (let y = 20; y <= 22; y++) human.conquer(game.ref(x, y));
  enemy.conquer(game.ref(27, 21));
  human.addTroops(3000);
  enemy.addTroops(3000);
  human.buildUnit(UnitType.Barracks, game.ref(20, 20), {});
  return { game, human, enemy };
}

describe("tactical squads", () => {
  test("recruitment needs completed barracks, gold and troops", async () => {
    const { game, human } = await gameWithFrontier();
    const tile = game.ref(21, 21);
    const barracks = human.units(UnitType.Barracks)[0];
    barracks.setUnderConstruction(true);
    expect(human.canBuild(UnitType.Infantry, tile)).toBe(false);
    barracks.setUnderConstruction(false);
    expect(human.canBuild(UnitType.Infantry, tile)).toBe(tile);
    const troops = human.troops();
    game.addExecution(
      new ConstructionExecution(human, UnitType.Infantry, tile),
    );
    executeTicks(game, 2);
    expect(human.units(UnitType.Infantry)).toHaveLength(1);
    expect(human.troops()).toBe(troops - 300);
  });

  test("only the owner can order a squad; it moves on connected owned tiles", async () => {
    const { game, human, enemy } = await gameWithFrontier();
    const start = game.ref(21, 21);
    const target = game.ref(24, 21);
    const unit = human.buildUnit(UnitType.Infantry, start, { troops: 300 });
    game.addExecution(new SquadExecution(unit));
    new MoveSquadExecution(enemy, unit.id(), target).init(game);
    expect(unit.targetTile()).toBeUndefined();
    game.addExecution(new MoveSquadExecution(human, unit.id(), target));
    executeTicks(game, 50);
    expect(unit.tile()).toBe(target);
    expect(unit.isActive()).toBe(true);
  });

  test("sniper fire damages enemies without claiming land", async () => {
    const { game, human, enemy } = await gameWithFrontier();
    const start = game.ref(26, 21);
    const target = game.ref(27, 21);
    const sniper = human.buildUnit(UnitType.Sniper, start, { troops: 120 });
    game.addExecution(new SquadExecution(sniper));
    game.addExecution(new MoveSquadExecution(human, sniper.id(), target));
    const troops = enemy.troops();
    executeTicks(game, 15);
    expect(enemy.troops()).toBeLessThan(troops);
    expect(game.owner(target)).toBe(enemy);
    expect(sniper.troops()).toBeLessThan(120);
  });

  test("mountain snipers deal more damage than plains snipers", async () => {
    const fire = async (magnitude: number) => {
      const { game, human, enemy } = await gameWithFrontier();
      const start = game.ref(26, 21);
      game.map().setMagnitude(start, magnitude);
      const sniper = human.buildUnit(UnitType.Sniper, start, { troops: 120 });
      game.addExecution(new SquadExecution(sniper));
      game.addExecution(
        new MoveSquadExecution(human, sniper.id(), game.ref(27, 21)),
      );
      const before = enemy.troops();
      executeTicks(game, 9);
      return {
        loss: before - enemy.troops(),
        terrain: game.map().terrainType(start),
      };
    };
    const plains = await fire(5);
    const mountain = await fire(25);
    expect(plains.terrain).toBe(TerrainType.Plains);
    expect(mountain.terrain).toBe(TerrainType.Mountain);
    expect(mountain.loss).toBeGreaterThan(plains.loss);
  });

  test("infantry attack from the border spends the deployed squad", async () => {
    const { game, human } = await gameWithFrontier();
    const unit = human.buildUnit(UnitType.Infantry, game.ref(26, 21), {
      troops: 300,
    });
    game.addExecution(new SquadExecution(unit));
    game.addExecution(
      new MoveSquadExecution(human, unit.id(), game.ref(27, 21)),
    );
    executeTicks(game, 10);
    expect(unit.isActive()).toBe(false);
    expect(human.units(UnitType.Infantry)).toHaveLength(0);
  });

  test("offline bots recruit squads and issue orders at a frontier", async () => {
    const { game, human, enemy } = await gameWithFrontier();
    // Use the existing human as a bot-like AI participant: behavior only
    // depends on ownership and the completed barracks.
    expect(maybeUseOfflineSquads(game, human)).toBe(true);
    executeTicks(game, 2);
    expect(human.units(UnitType.Infantry, UnitType.Sniper)).toHaveLength(1);
    expect(maybeUseOfflineSquads(game, human)).toBe(true);
    executeTicks(game, 2);
    expect(
      human.units(UnitType.Infantry, UnitType.Sniper)[0].targetTile(),
    ).toBeDefined();
    expect(enemy.isAlive()).toBe(true);
  });

  test("offline AI prefers snipers when its frontline has high ground", async () => {
    const { game, human } = await gameWithFrontier();
    for (const tile of human.borderTiles()) game.map().setMagnitude(tile, 25);
    expect(maybeUseOfflineSquads(game, human)).toBe(true);
    executeTicks(game, 2);
    expect(human.units(UnitType.Sniper)).toHaveLength(1);
  });

  test("a squad and its pending move survive a game snapshot", async () => {
    const { game, human } = await gameWithFrontier();
    const unit = human.buildUnit(UnitType.Infantry, game.ref(21, 21), {
      troops: 300,
    });
    game.addExecution(new SquadExecution(unit));
    game.addExecution(
      new MoveSquadExecution(human, unit.id(), game.ref(25, 21)),
    );
    const { bytes, again, restored } = await roundTrip(game, "big_plains");
    expect(diffSnapshots(bytes, again)).toEqual([]);
    executeTicks(game, 24);
    executeTicks(restored, 24);
    expect(restored.player("human").units(UnitType.Infantry)[0].tile()).toBe(
      unit.tile(),
    );
  });
});
