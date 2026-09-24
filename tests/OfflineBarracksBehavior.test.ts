import { ConstructionExecution } from "../src/core/execution/ConstructionExecution";
import { maybeBuildOfflineBarracks } from "../src/core/execution/utils/OfflineBarracksBehavior";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { GameImpl } from "../src/core/game/GameImpl";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { setup } from "./util/Setup";

function claimTestLand(
  game: Awaited<ReturnType<typeof setup>>,
  botName: string,
) {
  const bot = game.player(botName);
  let claimed = 0;
  game.map().forEachTile((tile) => {
    if (!game.map().isLand(tile) || claimed >= 500) return;
    bot.conquer(tile);
    claimed++;
  });
}

describe("offline bot barracks behavior", () => {
  test("builds a barracks when it can afford one and has owned land", async () => {
    const game = await setup("big_plains", { instantBuild: true });
    const botInfo = new PlayerInfo(
      "offline_bot",
      PlayerType.Bot,
      null,
      "offline_bot",
    );
    game.addPlayer(botInfo);
    const bot = game.player("offline_bot");

    claimTestLand(game, "offline_bot");

    const cost = game.unitInfo(UnitType.Barracks).cost(game, bot);
    bot.addGold(cost * 2n);

    const didBuild = maybeBuildOfflineBarracks(game, bot, new PseudoRandom(42));

    expect(didBuild).toBe(true);
    expect(
      (game as GameImpl)
        .executions()
        .some((execution) => execution instanceof ConstructionExecution),
    ).toBe(true);
  });

  test("keeps the bot's gold reserve for attacks", async () => {
    const game = await setup("big_plains", { instantBuild: true });
    const botInfo = new PlayerInfo(
      "offline_bot",
      PlayerType.Bot,
      null,
      "offline_bot",
    );
    game.addPlayer(botInfo);
    const bot = game.player("offline_bot");

    claimTestLand(game, "offline_bot");

    const cost = game.unitInfo(UnitType.Barracks).cost(game, bot);
    bot.addGold(cost * 2n - 1n);

    expect(maybeBuildOfflineBarracks(game, bot, new PseudoRandom(42))).toBe(
      false,
    );
    expect(
      (game as GameImpl)
        .executions()
        .some((execution) => execution instanceof ConstructionExecution),
    ).toBe(false);
  });
});
