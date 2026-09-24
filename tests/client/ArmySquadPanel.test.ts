import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../src/client/hud/layers/ControlPanel";
import type { ControlPanel } from "../../src/client/hud/layers/ControlPanel";
import { UnitSelectionEvent } from "../../src/client/InputHandler";
import type { UIState } from "../../src/client/UIState";
import type { GameView, UnitView } from "../../src/client/view";
import { EventBus } from "../../src/core/EventBus";
import { UnitType } from "../../src/core/game/Game";

describe("army and squad panel", () => {
  let panel: ControlPanel;
  let unit: UnitView;
  let eventBus: EventBus;

  beforeEach(async () => {
    document.body.innerHTML = "";
    eventBus = new EventBus();
    panel = document.createElement("control-panel") as ControlPanel;
    panel.eventBus = eventBus;
    panel.uiState = { attackRatio: 0.2 } as UIState;
    panel.game = {
      myPlayer: () => null,
      inSpawnPhase: () => false,
    } as unknown as GameView;
    unit = {
      id: () => 17,
      type: () => UnitType.Infantry,
      troops: () => 300,
      isActive: () => true,
    } as unknown as UnitView;
    (panel as unknown as { _squads: UnitView[] })._squads = [unit];
    (panel as unknown as { _troops: number })._troops = 12_500;
    (panel as unknown as { _maxTroops: number })._maxTroops = 20_000;
    (panel as unknown as { _gold: bigint })._gold = 0n;
    (panel as unknown as { _attackingTroops: number })._attackingTroops = 0;
    (panel as unknown as { troopRate: number }).troopRate = 0;
    panel.setVisibile(true);
    document.body.appendChild(panel);
    panel.init();
    await panel.updateComplete;
  });

  afterEach(() => panel.remove());

  it("shows nation troops separately from selectable special squads", () => {
    expect(panel.textContent).toContain("1.25K");
    expect(panel.querySelector("button[aria-pressed='false']")).not.toBeNull();
  });

  it("selects a squad from its HUD button", async () => {
    const selections: UnitSelectionEvent[] = [];
    eventBus.on(UnitSelectionEvent, (event) => selections.push(event));
    panel.querySelector("button")!.click();
    await panel.updateComplete;

    expect(selections).toHaveLength(1);
    expect(selections[0].unit).toBe(unit);
    expect(panel.querySelector("button")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});
