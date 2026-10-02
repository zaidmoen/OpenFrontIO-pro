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
import { militaryPower, squadVolleyLosses } from "./utils/SquadCombat";

/** Orders keep squads on connected friendly land. Infantry spend their troops
 * on a normal border attack; snipers provide fire support without capturing. */
export class SquadExecution implements Execution {
  private game: Game;
  private active = true;
  // Derived route data is deliberately excluded from snapshots; restored
  // executions find a fresh route against the restored ownership map.
  private route: TileRef[] = [];
  private routeIndex = 0;
  private routeTarget: TileRef | undefined;
  private routeOwnerVersion = -1;

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
    if (ticks % 8 !== this.squad.id() % 8) return;
    let target = this.squad.targetTile();
    if (target === this.squad.tile()) {
      this.squad.setTargetTile(undefined);
      target = undefined;
    }
    // A move to friendly land is an explicit reposition/retreat order.
    // Otherwise a squad holds its ground and fights hostile formations first.
    if (
      (target === undefined ||
        this.game.owner(target) !== owner ||
        target === this.squad.tile()) &&
      this.engageEnemySquad()
    )
      return;
    this.reinforceAtBarracks();
    if (target === undefined) return;
    const map = this.game.map();
    const targetOwner = this.game.owner(target);
    const enemy = targetOwner !== owner;
    if (
      enemy &&
      targetOwner.isPlayer() &&
      !owner.canAttackPlayer(targetOwner)
    ) {
      this.squad.setTargetTile(undefined);
      this.route = [];
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

    const start = this.squad.tile();
    if (
      this.routeTarget !== target ||
      this.routeOwnerVersion !== owner.tileChangeVersion() ||
      this.routeIndex >= this.route.length ||
      this.game.owner(this.route[this.routeIndex]) !== owner
    ) {
      this.route = this.findRoute(start, target, enemy ? range : 0);
      this.routeIndex = 0;
      this.routeTarget = target;
      this.routeOwnerVersion = owner.tileChangeVersion();
    }
    const step = this.route[this.routeIndex++];
    if (step !== undefined) this.squad.move(step);
  }

  private reinforceAtBarracks(): void {
    const owner = this.squad.owner();
    const type = this.squad.type();
    const maxTroops = type === UnitType.Sniper ? 120 : 300;
    if (this.squad.troops() >= maxTroops) return;
    const atBarracks = owner
      .units(UnitType.Barracks)
      .some(
        (b) =>
          b.isActive() &&
          !b.isUnderConstruction() &&
          b.tile() === this.squad.tile(),
      );
    if (!atBarracks) return;
    // Replacements are taken from the normal reserve. No free troops are made.
    const replacements = owner.removeTroops(
      Math.min(20, maxTroops - this.squad.troops()),
    );
    if (replacements > 0)
      this.squad.setTroops(this.squad.troops() + replacements);
  }

  private engageEnemySquad(): boolean {
    const owner = this.squad.owner();
    const range = this.squad.type() === UnitType.Sniper ? 3 : 1;
    const opponents = this.game
      .nearbyUnits(this.squad.tile(), range, [
        UnitType.Infantry,
        UnitType.Sniper,
      ])
      .filter(
        ({ unit }) =>
          unit !== this.squad &&
          unit.owner().isPlayer() &&
          owner.canAttackPlayer(unit.owner()),
      );
    if (opponents.length === 0) return false;
    opponents.sort(
      (a, b) => a.distSquared - b.distSquared || a.unit.id() - b.unit.id(),
    );
    const defender = opponents[0].unit;
    const map = this.game.map();
    const hasSniperSupport =
      this.squad.type() === UnitType.Infantry &&
      this.game.hasUnitNearby(
        this.squad.tile(),
        3,
        UnitType.Sniper,
        owner.id(),
      );
    const losses = squadVolleyLosses(
      this.squad.type() as UnitType.Infantry | UnitType.Sniper,
      this.squad.troops(),
      map.terrainType(this.squad.tile()),
      map.terrainType(defender.tile()),
      hasSniperSupport,
      militaryPower(this.game, owner),
      militaryPower(this.game, defender.owner()),
      this.game.hasUnitNearby(
        defender.tile(),
        this.game.config().defensePostRange(),
        UnitType.DefensePost,
        defender.owner().id(),
      ),
    );
    defender.setTroops(defender.troops() - losses);
    if (defender.troops() <= 0) defender.delete(true, owner);
    return true;
  }

  private findRoute(start: TileRef, target: TileRef, range: number): TileRef[] {
    // BFS finds the nearest owned tile in range of the destination. Cardinal
    // neighbors and bounded exploration make the outcome deterministic.
    const map = this.game.map();
    const owner = this.squad.owner();
    const distance = (a: TileRef, b: TileRef) =>
      Math.abs(map.x(a) - map.x(b)) + Math.abs(map.y(a) - map.y(b));
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
      if (tileDistance <= range) {
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
    if (destination === undefined || destination === start) return [];
    const route: TileRef[] = [];
    let step = destination;
    while (step !== start) {
      route.push(step);
      step = parent.get(step)!;
    }
    route.reverse();
    return route;
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
    this.route = [];
    this.routeIndex = 0;
    this.routeTarget = undefined;
    this.routeOwnerVersion = -1;
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
