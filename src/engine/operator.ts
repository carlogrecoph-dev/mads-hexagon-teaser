import { CAMERA_PRESETS } from "./config.ts";
import { handsFromInteraction } from "./hands.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import type { EngineSettings, InteractionState, TeaserState } from "./types.ts";

/**
 * Mission: she is the operator of the M.A.D.S. Hexagon 55" glass.
 *
 * 1. Full artwork on the table.
 * 2. Two hands meet on a focus point.
 * 3. Pinch-open → zoom.
 * 4. Hold and look.
 * 5. Pinch-close → full frame.
 * 6. Glance at the 75" walls.
 * 7. Next point. Three visits, three cameras, ~40s.
 */
export function bootWork(settings: EngineSettings = DEFAULT_SETTINGS, t = 0.5): TeaserState {
  const cycle = (t % 12) / 12;
  let spread = 0.12;
  let gesture: InteractionState["gesture"] = "HOLD";
  if (cycle < 0.18) {
    spread = 0.08;
    gesture = "PINCH";
  } else if (cycle < 0.48) {
    spread = (cycle - 0.18) / 0.3;
    gesture = "SPREAD";
  } else if (cycle < 0.62) {
    spread = 1;
    gesture = "HOLD";
  } else if (cycle < 0.88) {
    spread = 1 - (cycle - 0.62) / 0.26;
    gesture = "PINCH";
  } else {
    spread = 0.08;
    gesture = "HOLD";
  }
  const glance = cycle > 0.88 ? 0.75 : 0;
  const interaction: InteractionState = {
    spread,
    panX: Math.sin(t * 0.31) * 0.2,
    panY: Math.sin(t * 0.19) * 0.12,
    point: 0.55,
    lead: 0,
    glance,
    glanceDir: Math.sin(t * 0.11) > 0 ? 1 : -1,
    stretch: glance * 0.35,
    targetCx: 0.5 + Math.sin(t * 0.09) * 0.1,
    targetCy: 0.42 + Math.cos(t * 0.08) * 0.08,
    targetZoom: 1.7,
    baseZoom: 1.05,
    gesture,
  };
  return {
    time: t,
    duration: 40,
    cameraId: "top",
    camera: CAMERA_PRESETS.top,
    viewport: { cx: interaction.targetCx ?? 0.5, cy: interaction.targetCy ?? 0.5, zoom: 1.05 + spread * 0.7 },
    interaction,
    hands: handsFromInteraction(interaction, settings),
    touch: { dCx: 0, dCy: 0, dZoom: 0, speed: spread },
    segmentLabel: "operator",
    seed: 1,
  };
}
