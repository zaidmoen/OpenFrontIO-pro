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
  private cachedTarget: TileRef | undefined;
  private cachedTargetIsEnemy = false;
  private cachedRange = 0;
  private cachedPath: TileRef[] = [];
  private cachedPathIndex = 0;
  private cachedPathNeedsContinuation = false;

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
    if (target === undefined) {
      this.clearPathCache();
      return;
    }
    const map = this.game.map();
    const targetOwner = this.game.owner(target);
    const enemy = targetOwner !== owner;
    if (enemy && targetOwner.isPlayer() && owner.isFriendly(targetOwner)) {
      this.squad.setTargetTile(undefined);
      this.clearPathCache();
      return;
    }

    const range = this.squad.type() === UnitType.Sniper ? 3 : 1;
    const distance = (a: TileRef, b: TileRef) =>
      Math.abs(map.x(a) - map.x(b)) + Math.abs(map.y(a) - map.y(b));

    if (enemy && distance(this.squad.tile(), target) <= range) {
      if (ticks % 8 !== this.squad.id() % 8) return;
      if (this.squad.type() === UnitType.Infantry) {
        const troops = this.squad.troops();
        const source = this.squad.tile();
        this.squad.delete(false);
        this.active = false;
        this.clearPathCache();
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
          this.clearPathCache();
        }
      }
      return;
    }

    if (!enemy && target === this.squad.tile()) {
      this.squad.setTargetTile(undefined);
      this.clearPathCache();
      return;
    }

    if (ticks % 8 !== this.squad.id() % 8) return;
    const step = this.nextStepToTarget(target, enemy, range);
    if (step === undefined) return;
    this.squad.move(step);
    this.cachedPathIndex++;
  }

  private nextStepToTarget(
    target: TileRef,
    enemy: boolean,
    range: number,
  ): TileRef | undefined {
    const start = this.squad.tile();
    const sameOrder =
      this.cachedTarget === target &&
      this.cachedTargetIsEnemy === enemy &&
      this.cachedRange === range;

    if (!sameOrder) {
      this.rebuildPath(start, target, enemy, range);
    } else if (this.cachedPath[this.cachedPathIndex] !== start) {
      const currentIndex = this.cachedPath.indexOf(start);
      if (currentIndex >= 0) {
        this.cachedPathIndex = currentIndex;
      } else {
        this.rebuildPath(start, target, enemy, range);
      }
    } else if (
      this.cachedPathNeedsContinuation &&
      this.cachedPathIndex >= this.cachedPath.length - 1
    ) {
      this.rebuildPath(start, target, enemy, range);
    }

    let step = this.cachedPath[this.cachedPathIndex + 1];
    if (
      step !== undefined &&
      (this.game.owner(step) !== this.squad.owner() ||
        this.game.isImpassable(step))
    ) {
      this.rebuildPath(start, target, enemy, range);
      step = this.cachedPath[this.cachedPathIndex + 1];
    }
    return step;
  }

  private rebuildPath(
    start: TileRef,
    target: TileRef,
    enemy: boolean,
    range: number,
  ): void {
    const map = this.game.map();
    const distance = (a: TileRef, b: TileRef) =>
      Math.abs(map.x(a) - map.x(b)) + Math.abs(map.y(a) - map.y(b));
    const queue: TileRef[] = [start];
    const parent = new Map<TileRef, TileRef>([[start, start]]);
    const neighbors: TileRef[] = [0, 0, 0, 0];
    let destination: TileRef | undefined;
    let closest = start;
    let closestDistance = distance(start, target);
    let reachedGoal = false;

    // Deterministic breadth-first search builds a route once per order, then
    // the squad follows it until the target changes or the route is blocked.
    for (let i = 0; i < queue.length && i < 12_000; i++) {
      const tile = queue[i];
      const tileDistance = distance(tile, target);
      if (tileDistance < closestDistance) {
        closest = tile;
        closestDistance = tileDistance;
      }
      if (tileDistance <= (enemy ? range : 0)) {
        destination = tile;
        reachedGoal = true;
        break;
      }
      const count = map.neighbors4(tile, neighbors);
      for (let n = 0; n < count; n++) {
        const next = neighbors[n];
        if (
          parent.has(next) ||
          this.game.owner(next) !== this.squad.owner() ||
          this.game.isImpassable(next)
        ) {
          continue;
        }
        parent.set(next, tile);
        queue.push(next);
      }
    }

    destination ??= closest;
    const path: TileRef[] = [destination];
    while (path[path.length - 1] !== start) {
      const previous = parent.get(path[path.length - 1]);
      if (previous === undefined) {
        path.length = 0;
        path.push(start);
        reachedGoal = false;
        break;
      }
      path.push(previous);
    }
    path.reverse();

    this.cachedTarget = target;
    this.cachedTargetIsEnemy = enemy;
    this.cachedRange = range;
    this.cachedPath = path;
    this.cachedPathIndex = 0;
    this.cachedPathNeedsContinuation = !reachedGoal;
  }

  private clearPathCache(): void {
    this.cachedTarget = undefined;
    this.cachedPath = [];
    this.cachedPathIndex = 0;
    this.cachedPathNeedsContinuation = false;
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
