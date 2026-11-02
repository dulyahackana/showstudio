import { useEffect, useState } from 'react'

/** Re-renders every `intervalMs` with the current time (clocks, progress bars). */
export function useNow(intervalMs = 200): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
