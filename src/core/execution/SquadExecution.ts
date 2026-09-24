import { z } from "zod";
import { Execution, Game, TerrainType, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zRef } from "../snapshot/SnapshotType";
import { AttackExecution } from "./AttackExecution";

/** Orders keep squads on connected friendly land. Infantry spend their troops
 * on a normal border attack; snipers provide fire support without capturing. */
export class SquadExecution implements Execution {
  private game: Game;
  private active = true;

  constructor(private squad: Unit) {}

  init(game: Game): void {
    this.game = game;
  }

  tick(ticks: number): void {
    if (!this.squad.isActive() || !this.squad.owner().isAlive()) {
      this.active = false;
      return;
    }
    const owner = this.squad.owner();
    if (this.game.owner(this.squad.tile()) !== owner) {
      this.squad.delete();
      this.active = false;
      return;
    }
    const target = this.squad.targetTile();
    if (target === undefined || ticks % 8 !== this.squad.id() % 8) return;
    const map = this.game.map();
    const targetOwner = this.game.owner(target);
    const enemy = targetOwner !== owner;
    if (enemy && targetOwner.isPlayer() && owner.isFriendly(targetOwner)) {
      this.squad.setTargetTile(undefined);
      return;
    }
    const range = this.squad.type() === UnitType.Sniper ? 3 : 1;
    const distance = (a: TileRef, b: TileRef) =>
      Math.abs(map.x(a) - map.x(b)) + Math.abs(map.y(a) - map.y(b));

    if (enemy && distance(this.squad.tile(), target) <= range) {
      if (this.squad.type() === UnitType.Infantry) {
        const troops = this.squad.troops();
        const source = this.squad.tile();
        this.squad.delete(false);
        this.active = false;
        if (troops > 0) {
          this.game.addExecution(
            new AttackExecution(troops, owner, targetOwner.id(), source, false),
          );
        }
      } else if (targetOwner.isPlayer()) {
        const terrain = map.terrainType(this.squad.tile());
        const bonus =
          terrain === TerrainType.Mountain
            ? 1.5
            : terrain === TerrainType.Highland
              ? 1.25
              : 1;
        targetOwner.removeTroops(
          Math.max(1, Math.floor((this.squad.troops() * bonus) / 12)),
        );
        this.squad.setTroops(
          this.squad.troops() -
            Math.max(1, Math.floor(this.squad.troops() / 40)),
        );
        if (this.squad.troops() <= 0) {
          this.squad.delete();
          this.active = false;
        }
      }
      return;
    }

    if (!enemy && target === this.squad.tile()) {
      this.squad.setTargetTile(undefined);
      return;
    }
    // BFS finds the nearest owned tile in range of the destination. Cardinal
    // neighbors and bounded exploration make the outcome deterministic.
    const start = this.squad.tile();
    const queue: TileRef[] = [start];
    const parent = new Map<TileRef, TileRef>([[start, start]]);
    const neighbors: TileRef[] = [0, 0, 0, 0];
    let destination: TileRef | undefined;
    let closest = start;
    let closestDistance = distance(start, target);
    for (let i = 0; i < queue.length && i < 12_000; i++) {
      const tile = queue[i];
      const tileDistance = distance(tile, target);
      if (tileDistance < closestDistance) {
        closest = tile;
        closestDistance = tileDistance;
      }
      if (tileDistance <= (enemy ? range : 0)) {
        destination = tile;
        break;
      }
      const count = map.neighbors4(tile, neighbors);
      for (let n = 0; n < count; n++) {
        const next = neighbors[n];
        if (
          parent.has(next) ||
          this.game.owner(next) !== owner ||
          this.game.isImpassable(next)
        )
          continue;
        parent.set(next, tile);
        queue.push(next);
      }
    }
    // Long journeys advance in bounded sections rather than searching the
    // entire world in one simulation tick.
    destination ??= closest;
    if (destination === undefined || destination === start) return;
    let step = destination;
    while (parent.get(step) !== start) step = parent.get(step)!;
    this.squad.move(step);
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  snapshot(w: SnapshotWriter): ExecRecord {
    return SquadExecutionSnapshot.write({
      squad: w.unit(this.squad),
      active: this.active,
    });
  }
  restoreSnapshot(s: SquadState, r: SnapshotReader): void {
    this.squad = r.unit(s.squad);
    this.active = s.active;
    this.game = r.game;
  }
}

const SquadStateSchema = z.object({ squad: zRef(), active: z.boolean() });
type SquadState = z.infer<typeof SquadStateSchema>;
export const SquadExecutionSnapshot = execSnapshotType({
  name: "Squad",
  version: 1,
  schema: SquadStateSchema,
  cls: () => SquadExecution,
});
