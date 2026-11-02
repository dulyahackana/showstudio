import { useQuery } from '@tanstack/react-query'
import { Bot } from 'lucide-react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { assetUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

/*
 * Model thumbnails, rendered once per asset with a single shared offscreen renderer
 * (one WebGL context however many cards are on screen). Assets are content-addressed,
 * so a thumbnail never goes stale.
 */
let renderer: THREE.WebGLRenderer | null = null
let queue: Promise<unknown> = Promise.resolve()

async function render(url: string, width: number, height: number): Promise<string> {
  renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(2)
  renderer.setSize(width, height, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const gltf = await new GLTFLoader().loadAsync(url)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#dbeafe', '#0f172a', 1.4))
  const key = new THREE.DirectionalLight('#fff4e0', 2.6)
  key.position.set(3, 5, 4)
  const rim = new THREE.DirectionalLight('#5cc8ea', 1.6)
  rim.position.set(-4, 3, -3)
  scene.add(key, rim, gltf.scene)

  const box = new THREE.Box3().setFromObject(gltf.scene)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.01, 100)
  const radius = size.length() / 2
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.78
  camera.position.copy(center).add(new THREE.Vector3(0.75, 0.45, 1).normalize().multiplyScalar(distance))
  camera.lookAt(center)
  renderer.render(scene, camera)
  const data = renderer.domElement.toDataURL('image/png')
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      for (const m of [o.material].flat()) m.dispose()
    }
  })
  return data
}

export function modelThumbnail(assetId: string, width = 320, height = 220): Promise<string> {
  const job = queue.then(() => render(assetUrl(assetId), width, height))
  queue = job.catch(() => undefined)
  return job
}

export function ModelThumb({ assetId, className }: { assetId: string | null | undefined; className?: string }) {
  const { data, isError } = useQuery({
    queryKey: ['model-thumb', assetId],
    queryFn: () => modelThumbnail(assetId ?? ''),
    enabled: !!assetId,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  if (!assetId || isError || !data)
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <Bot className={cn('size-10 text-motion/40', !isError && assetId && 'animate-pulse')} />
      </div>
    )
  return <img src={data} alt="" className={cn('object-contain', className)} draggable={false} />
}
