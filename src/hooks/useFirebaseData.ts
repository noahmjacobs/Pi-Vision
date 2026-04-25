import { useEffect, useState, useRef } from 'react'
import { ref, onValue, off, DataSnapshot } from 'firebase/database'
import { db } from '../firebase'

export function useFirebaseValue<T>(path: string, defaultVal: T) {
  const [data, setData] = useState<T>(defaultVal)
  const pathRef = useRef(path)

  useEffect(() => {
    const dbRef = ref(db, pathRef.current)
    const handler = (snap: DataSnapshot) => {
      if (snap.exists()) setData(snap.val() as T)
    }
    onValue(dbRef, handler)
    return () => off(dbRef, 'value', handler)
  }, [])

  return data
}
