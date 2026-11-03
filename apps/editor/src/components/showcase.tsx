import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/** Real screenshots of the product (studio and the Godot twin), captured from the demo attraction. */
const SLIDES = [
  {
    img: '/showcase/show.jpg',
    eyebrow: 'Choreograph',
    title: 'Motion, light and sound on one timeline',
    body: 'Pose figures in 3D, key every joint, fixture and cue, and preview exactly what the controllers will play.',
  },
  {
    img: '/showcase/twin.jpg',
    eyebrow: 'Rehearse',
    title: 'A game-engine twin of every attraction',
    body: 'Godot joins the fleet like real hardware: it verifies, stages and plays the show, with guests you can walk in.',
  },
  {
    img: '/showcase/character.jpg',
    eyebrow: 'Rig',
    title: 'Any figure, any rig',
    body: 'Bind joints to GLB bones or nodes, set limits and speeds, and sweep at full speed before anything moves.',
  },
  {
    img: '/showcase/layout.jpg',
    eyebrow: 'Lay out',
    title: 'Direct manipulation, in real units',
    body: 'Move figures, aim fixtures and size guest zones with gizmos, snapping and undo.',
  },
  {
    img: '/showcase/responses.jpg',
    eyebrow: 'React',
    title: 'Guests change the show, safely',
    body: 'Sensor responses blend in from any pose and are proven within every joint’s speed limit.',
  },
  {
    img: '/showcase/operator.jpg',
    eyebrow: 'Launch',
    title: 'Signed, verified, synchronized',
    body: 'Four-eyes approval signs the bundle, every controller checks it, and the e-stop is always one tap away.',
  },
  {
    img: '/showcase/access.jpg',
    eyebrow: 'Organise',
    title: 'Every show is a project, step by step',
    body: 'Animate, review, deploy, launch: each project has its own team and roles, enforced by the server and audited.',
  },
] as const

const INTERVAL_MS = 6000

/** Auto-advancing capability tour for the sign-in page. Arrows, dots and ←/→ jump; the timer restarts after each change. */
export function Showcase() {
  const [index, setIndex] = useState(0)
  const go = (delta: number) => setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length)
  // Restart the timer whenever the slide changes (also after a manual pick).
  // biome-ignore lint/correctness/useExhaustiveDependencies: index is the trigger, not an input
  useEffect(() => {
    const t = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS)
    return () => clearTimeout(t)
  }, [index])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % SLIDES.length)
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const slide = SLIDES[index] ?? SLIDES[0]

  return (
    <section
      // As wide as the panel allows, but never taller than the window.
      className="w-full max-w-[min(100%,46rem,calc((100svh-22rem)*1.344))] space-y-5"
      aria-roledescription="carousel"
      aria-label="What Show Studio does"
    >
      <div className="group relative aspect-[1344/1000] overflow-hidden rounded-2xl border border-white/10 bg-sidebar shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95),0_0_0_1px_oklch(0.79_0.17_155/14%)]">
        <div className="absolute inset-x-0 top-0 z-10 flex h-8 items-center gap-1.5 border-b border-white/5 bg-black/50 px-3.5 backdrop-blur">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 font-mono text-[11px] text-white/45">
            studio.lumenparks.example / {slide.eyebrow.toLowerCase()}
          </span>
        </div>
        {SLIDES.map((s, i) => (
          <img
            key={s.img}
            src={s.img}
            alt={s.title}
            draggable={false}
            className={cn(
              'absolute inset-0 h-full w-full object-cover object-top pt-8 transition-[opacity,transform] duration-[1200ms] ease-out motion-reduce:transition-none',
              i === index ? 'scale-100 opacity-100' : 'scale-[1.03] opacity-0',
            )}
          />
        ))}
        <button
          type="button"
          aria-label="Previous"
          onClick={() => go(-1)}
          className="absolute top-1/2 left-4 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/80 backdrop-blur transition hover:scale-105 hover:bg-black/75 hover:text-white"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => go(1)}
          className="absolute top-1/2 right-4 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/80 backdrop-blur transition hover:scale-105 hover:bg-black/75 hover:text-white"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="flex items-start justify-between gap-8">
        <div key={slide.img} className="min-h-24 animate-in fade-in slide-in-from-bottom-1 duration-500">
          <div className="text-eyebrow text-primary">
            {String(index + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')} · {slide.eyebrow}
          </div>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">{slide.title}</h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{slide.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.img}
              type="button"
              aria-label={`Show ${s.eyebrow}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className="relative h-2 overflow-hidden rounded-full bg-white/15 transition-all hover:bg-white/30"
              style={{ width: i === index ? 40 : 10 }}
            >
              {i === index && (
                <span
                  key={index}
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ animation: `showcase-progress ${INTERVAL_MS}ms linear forwards` }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
