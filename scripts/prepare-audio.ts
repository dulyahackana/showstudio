/**
 * One-off: cuts the downloaded CC0 / public-domain recordings into the show sounds in
 * samples/audio (mono 44.1 kHz MP3, -16 LUFS, peaks at -1 dBFS; the shows set each cue's level).
 * MP3 plays in every browser and in Godot.
 * Music excerpts are chosen so they build with the show. Sources and licenses: samples/ASSETS.md.
 * Needs ffmpeg.
 *
 *   bun scripts/prepare-audio.ts <sources-dir>
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface Clip {
  out: string
  /** Inputs, relative to the sources folder. */
  src: string[]
  /** ffmpeg filter graph; inputs are [0:a], [1:a], ... and the result must be labelled [out]. */
  filter: string
}

// Ends every chain: mono, consistent level, gentle fade-out against clicks.
const finish = (fadeAt: number, fade = 0.4) =>
  `aformat=channel_layouts=mono,afade=t=out:st=${fadeAt}:d=${fade},loudnorm=I=-16:TP=-1:LRA=11[out]`

const CLIPS: Clip[] = [
  {
    out: 'roar.mp3',
    src: ['monster_roar.wav'],
    filter: `[0:a]atrim=0:5,${finish(3.6, 1.4)}`,
  },
  {
    // One snarl out of the pack (6.3 s to 8.1 s).
    out: 'snarl.mp3',
    src: ['monster-snarl-5.ogg'],
    filter: `[0:a]atrim=6.3:8.1,asetpts=PTS-STARTPTS,${finish(1.5, 0.3)}`,
  },
  {
    // Two handfuls of coins, the second a beat later.
    out: 'coins.mp3',
    src: ['rpg/OGG/handleCoins.ogg', 'rpg/OGG/handleCoins2.ogg'],
    filter: `[1:a]adelay=450|450[b];[0:a][b]amix=inputs=2:normalize=0,${finish(1.0, 0.25)}`,
  },
  {
    out: 'magic.mp3',
    src: ['magical_3.ogg'],
    filter: `[0:a]aecho=0.8:0.6:70|140:0.3|0.18,apad=pad_dur=0.6,${finish(1.9, 0.5)}`,
  },
  {
    // Soft sparkle used as a hello / goodbye chime.
    out: 'chime.mp3',
    src: ['magical_1.ogg'],
    filter: `[0:a]aecho=0.8:0.5:90:0.25,apad=pad_dur=0.4,${finish(1.6, 0.4)}`,
  },
  {
    out: 'doorbell.mp3',
    src: ['doorbell-old-tring.ogg'],
    filter: `[0:a]atrim=0:3.6,${finish(3.0, 0.6)}`,
  },
  {
    // The wizard's staff hits the round door twice, on the downstrokes 1 s and 3 s after the cue.
    out: 'knock.mp3',
    src: ['wood/wood_hammer_01.ogg'],
    filter: `[0:a]asplit=2[a][b];[a]adelay=1000|1000[a1];[b]adelay=3000|3000[b1];[a1][b1]amix=inputs=2:normalize=0,${finish(3.2, 0.2)}`,
  },
  {
    // Grieg, In the Hall of the Mountain King, 1:10 to 1:55: sneaking strings that build to the climax.
    out: 'theme-lair.mp3',
    src: ['Musopen_-_In_the_Hall_Of_The_Mountain_King.ogg'],
    filter: `[0:a]atrim=70:115,asetpts=PTS-STARTPTS,afade=t=in:d=1.5,acompressor=threshold=-24dB:ratio=3:attack=20:release=400,${finish(42, 3)}`,
  },
  {
    // Grieg, Morning Mood, the opening flute melody.
    out: 'theme-burrow.mp3',
    src: ['Musopen_-_Morning.ogg'],
    filter: `[0:a]atrim=0:30,afade=t=in:d=0.8,acompressor=threshold=-26dB:ratio=2.5:attack=20:release=500,${finish(27, 3)}`,
  },
]

const sources = process.argv[2]
if (!sources) throw new Error('Usage: bun scripts/prepare-audio.ts <sources-dir>')
const out = resolve(import.meta.dirname, '../samples/audio')
mkdirSync(out, { recursive: true })

for (const clip of CLIPS) {
  const inputs = clip.src.flatMap((s) => ['-i', join(sources, s)])
  const args = ['-y', '-v', 'error', ...inputs, '-filter_complex', clip.filter, '-map', '[out]']
  const res = spawnSync(
    'ffmpeg',
    [...args, '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '2', '-map_metadata', '-1', join(out, clip.out)],
    { stdio: 'inherit' },
  )
  if (res.status !== 0) throw new Error(`ffmpeg failed for ${clip.out}`)
  console.log(`wrote samples/audio/${clip.out}`)
}
