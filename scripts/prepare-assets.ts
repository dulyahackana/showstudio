/**
 * One-off: turns the downloaded CC0 source models into the studio samples. Figures and
 * props get real-world scale and stand on the floor; unused prop variants and baked
 * animations are removed (shows pose the joints themselves); metallic-by-default
 * materials are made matte. Sources and licenses: samples/ASSETS.md.
 *
 *   bun scripts/prepare-assets.ts <sources-dir>
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { getBounds, NodeIO } from '@gltf-transform/core'
import { dedup, prune } from '@gltf-transform/functions'

interface Job {
  out: string
  src: string
  /** Uniform scale to meters. */
  scale: number
  /** Lift (source units) so the feet touch y = 0; 'auto' uses the mesh bounds (rigid props only). */
  lift?: number | 'auto'
  /** Prop variants to remove (e.g. the wand and spellbooks the wizard does not carry). */
  drop?: string[]
  matte?: boolean
}

const FIGURES: Job[] = [
  { out: 'dragon.glb', src: 'opengameart-cethiel-dragon/dragon.glb', scale: 2.6, lift: 0.298 },
  {
    out: 'wizard.glb',
    src: 'kaykit-adventures/characters/Mage.glb',
    scale: 0.82,
    lift: 0,
    drop: ['1H_Wand', 'Spellbook', 'Spellbook_open'],
  },
  {
    out: 'burglar.glb',
    src: 'kaykit-adventures/characters/Rogue_Hooded.glb',
    scale: 0.6,
    lift: 0,
    drop: ['1H_Crossbow', '2H_Crossbow', 'Throwable', 'Knife_Offhand'],
  },
  { out: 'treasure-chest.glb', src: 'kaykit-dungeon/props/chest_gold.glb', scale: 0.85, lift: 'auto' },
]

const p = (name: string, src: string, scale: number, matte = false): Job => ({
  out: `scenery/${name}.glb`,
  src,
  scale,
  lift: 'auto',
  matte,
})

const SCENERY: Job[] = [
  p('coin-piles', 'polypizza-cc0-props/Quaternius_CoinPiles.glb', 9.5),
  p('gold-rocks', 'polypizza-cc0-props/Quaternius_GoldRocks.glb', 2.2),
  p('round-door', 'polypizza-cc0-props/Quaternius_DoorRound.glb', 3.3),
  p('coin-stack', 'kaykit-dungeon/props/coin_stack_large.glb', 0.4),
  p('sword-shield', 'kaykit-dungeon/props/sword_shield_gold.glb', 0.45),
  p('chest-wood', 'kaykit-dungeon/props/chest.glb', 0.5),
  p('pillar', 'kaykit-dungeon/props/pillar_decorated.glb', 0.85),
  p('torch', 'kaykit-dungeon/props/torch_lit.glb', 0.9),
  p('barrel', 'kaykit-dungeon/props/barrel_large.glb', 0.55),
  p('rubble', 'kaykit-dungeon/props/rubble_large.glb', 0.35),
  p('wall-arched', 'kaykit-dungeon/props/wall_arched.glb', 1),
  p('cliff', 'kenney-nature-kit/cliff_large_stone.glb', 3.2, true),
  p('cave-mouth', 'kenney-nature-kit/cliff_cave_stone.glb', 3.2, true),
  p('rock-large', 'kenney-nature-kit/rock_largeA.glb', 2.2, true),
  p('rock-tall', 'kenney-nature-kit/rock_tallB.glb', 2.2, true),
  p('stones', 'kenney-nature-kit/stone_largeA.glb', 2, true),
  p('mushrooms', 'kenney-nature-kit/mushroom_redGroup.glb', 2.2, true),
  p('column-ruin', 'kenney-nature-kit/statue_columnDamaged.glb', 2.4, true),
]

const sources = process.argv[2]
if (!sources) throw new Error('usage: bun scripts/prepare-assets.ts <sources-dir>')
const out = resolve(import.meta.dirname, '../samples')
const io = new NodeIO()

for (const job of [...FIGURES, ...SCENERY]) {
  const doc = await io.read(join(sources, job.src))
  const root = doc.getRoot()
  for (const node of root.listNodes()) if (job.drop?.includes(node.getName())) node.dispose()
  for (const animation of root.listAnimations()) animation.dispose()
  if (job.matte) for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.9)

  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  if (!scene) throw new Error(`${job.src} has no scene`)
  const lift = job.lift === 'auto' ? -getBounds(scene).min[1] : (job.lift ?? 0)
  const wrap = doc.createNode('figure_root').setScale([job.scale, job.scale, job.scale])
  wrap.setTranslation([0, lift * job.scale, 0])
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    wrap.addChild(child)
  }
  scene.addChild(wrap)
  root.setDefaultScene(scene)
  await doc.transform(prune(), dedup())

  const file = join(out, job.out)
  mkdirSync(dirname(file), { recursive: true })
  await io.write(file, doc)
  const b = getBounds(scene)
  const size = b.max.map((v, i) => (v - (b.min[i] ?? 0)).toFixed(2)).join(' × ')
  console.log(`${job.out.padEnd(28)} ${size} m  (min y ${b.min[1].toFixed(2)})`)
}
