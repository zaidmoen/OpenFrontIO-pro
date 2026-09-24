import { z } from "zod";
import { Execution, Game, Player, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zNum, zPlayerRef } from "../snapshot/SnapshotType";

export class MoveSquadExecution implements Execution {
  constructor(
    private owner: Player,
    private unitId: number,
    private tile: TileRef,
  ) {}

  init(game: Game): void {
    if (
      !game.isValidRef(this.tile) ||
      !game.isLand(this.tile) ||
      game.isImpassable(this.tile)
    )
      return;
    const squad = this.owner
      .units(UnitType.Infantry, UnitType.Sniper)
      .find((unit) => unit.id() === this.unitId && unit.isActive());
    if (!squad) return;
    const target = game.owner(this.tile);
    if (
      target.isPlayer() &&
      target !== this.owner &&
      this.owner.isFriendly(target)
    )
      return;
    squad.setTargetTile(this.tile);
  }
  tick(): void {}
  isActive(): boolean {
    return false;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return MoveSquadExecutionSnapshot.write({
      owner: w.player(this.owner),
      unitId: this.unitId,
      tile: this.tile,
    });
  }
  restoreSnapshot(s: MoveSquadState, r: SnapshotReader): void {
    this.owner = r.player(s.owner);
    this.unitId = s.unitId;
    this.tile = s.tile;
  }
}
const MoveSquadStateSchema = z.object({
  owner: zPlayerRef(),
  unitId: zNum(),
  tile: zNum(),
});
type MoveSquadState = z.infer<typeof MoveSquadStateSchema>;
export const MoveSquadExecutionSnapshot = execSnapshotType({
  name: "MoveSquad",
  version: 1,
  schema: MoveSquadStateSchema,
  cls: () => MoveSquadExecution,
});
