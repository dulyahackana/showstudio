import type { CharacterDefinition, Joint, Vec3 } from '@studio/schema'

/*
 * Sample figures for "The Dragon's Hoard". The models are CC0 assets prepared by
 * scripts/prepare-assets.ts (see samples/ASSETS.md); joints bind to their skeleton
 * bones or rigid nodes by name. Axes are in each bone's local frame, worked out from
 * the rest pose so positive values read naturally (raise, open, turn left).
 */

export interface Figure {
  id: string
  name: string
  description: string
  model: string
  footprint: Vec3
  joints: Joint[]
}

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v) || 1
  return v.map((c) => Math.round((c / n) * 1000) / 1000) as Vec3
}

const j = (
  name: string,
  node: string,
  axis: Vec3,
  [min, max]: [number, number],
  maxVelocity: number,
  home = 0,
): Joint => ({ name, node, type: 'revolute', axis: unit(axis), min, max, home, maxVelocity })

export const dragon: Figure = {
  id: 'dragon',
  name: 'Ember the Dragon',
  description: 'Hero figure: a four-legged dragon asleep on its hoard. Skeleton-driven neck, jaw, wings and tail.',
  model: 'dragon.glb',
  footprint: [1.8, 2.3, 3.2],
  joints: [
    j('neck_raise', 'neck1', [-0.97, -0.23, 0], [-15, 35], 30),
    j('neck_turn', 'neck2', [0.13, 0, -0.99], [-40, 40], 45),
    j('head_pitch', 'neck3', [0.66, -0.75, 0], [-25, 25], 50),
    j('jaw_open', 'jaw_lower', [-0.9, 0.44, 0], [0, 35], 120),
    j('wing_l', 'wing_lower_L', [0.96, 0.1, 0.28], [-10, 45], 60),
    j('wing_r', 'wing_lower_R', [0.96, -0.1, -0.28], [-10, 45], 60),
    j('tail_sway', 'tail1', [-0.54, 0.78, 0.31], [-30, 30], 40),
    j('tail_curl', 'tail2', [0.22, 0.97, -0.11], [-35, 35], 50),
  ],
}

export const wizard: Figure = {
  id: 'wizard',
  name: 'Wandering Wizard',
  description: 'Robed wizard with a staff. Arms rest at the sides (the model is rigged in a T-pose).',
  model: 'wizard.glb',
  footprint: [1.6, 2.4, 1.4],
  joints: [
    j('head_turn', 'head', [0, 1, 0], [-60, 60], 60),
    j('head_nod', 'head', [1, 0, 0], [-20, 25], 45),
    j('torso_turn', 'chest', [0, 1, 0], [-35, 35], 35),
    j('staff_raise', 'upperarm.r', [1, 0.06, 0], [-80, 60], 60, -70),
    j('staff_elbow', 'lowerarm.r', [0, 0, 1], [0, 110], 90, 15),
    j('free_arm', 'upperarm.l', [1, -0.06, 0], [-80, 60], 60, -70),
  ],
}

export const burglar: Figure = {
  id: 'burglar',
  name: 'Halfling Burglar',
  description: 'A small hooded burglar who peeks out from behind the pillars and waves at guests.',
  model: 'burglar.glb',
  footprint: [1.1, 1.5, 1],
  joints: [
    j('head_turn', 'head', [0, 1, 0], [-70, 70], 80),
    j('lean', 'chest', [1, 0, 0], [-15, 35], 40),
    j('torso_turn', 'spine', [0, 1, 0], [-40, 40], 45),
    j('wave_arm', 'upperarm.l', [1, -0.06, 0], [-80, 80], 120, -70),
    j('wave_elbow', 'lowerarm.l', [0, 0, -1], [0, 120], 150, 15),
    j('knife_arm', 'upperarm.r', [1, 0.06, 0], [-80, 40], 90, -70),
  ],
}

export const chest: Figure = {
  id: 'treasure-chest',
  name: 'Treasure Chest',
  description: 'Gold-banded chest whose lid opens on cue (rigid hinge node).',
  model: 'treasure-chest.glb',
  footprint: [1.5, 1.7, 1.6],
  joints: [j('lid_open', 'chest_gold_lid', [-1, 0, 0], [0, 100], 60)],
}

export const FIGURES = [dragon, wizard, burglar, chest]

export const definitionOf = (f: Figure, modelAssetId: string | null): CharacterDefinition => ({
  schemaVersion: 1,
  name: f.name,
  description: f.description,
  model: modelAssetId ? { assetId: modelAssetId } : null,
  footprint: { size: f.footprint },
  joints: f.joints,
})
