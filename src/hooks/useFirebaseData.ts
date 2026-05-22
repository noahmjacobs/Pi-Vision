import { useEffect, useState } from 'react'
import { ref, onValue, off, DataSnapshot } from 'firebase/database'
import { db } from '../firebase'

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeCache<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {}
}

export function useFirebaseValue<T>(
  path: string,
  defaultVal: T,
  { cache = true }: { cache?: boolean } = {}
) {
  const cacheKey = `pv_${path.replace(/\//g, '_')}`
  const cached = cache ? readCache<T>(cacheKey) : null

  const [data, setData] = useState<T>(cached ?? defaultVal)
  const [loading, setLoading] = useState(cached === null)

  useEffect(() => {
    const dbRef = ref(db, path)
    const handler = (snap: DataSnapshot) => {
      setLoading(false)
      if (snap.exists()) {
        const val = snap.val() as T
        setData(val)
        if (cache) writeCache(cacheKey, val)
      }
    }
    onValue(dbRef, handler)
    return () => off(dbRef, 'value', handler)
  }, [path, cacheKey, cache])

  return { data, loading }
}
