import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  User,
} from 'firebase/auth'
import { ref, onValue, off } from 'firebase/database'
import { auth, db } from '../firebase'

export interface Device {
  id: string
  name: string
}

interface AuthContextValue {
  user: User | null
  authLoading: boolean
  companyId: string
  companyName: string
  devices: Device[]
  deviceId: string
  setDeviceId: (id: string) => void
  devicePath: (subpath: string) => string
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [companyId, setCompanyId]     = useState('')
  const [companyName, setCompanyName] = useState('')
  const [devices, setDevices]         = useState<Device[]>([])
  const [deviceId, setDeviceIdState]  = useState(
    () => localStorage.getItem('pv_deviceId') ?? ''
  )

  // Auth state listener
  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setAuthLoading(false)
      if (!u) {
        setCompanyId('')
        setCompanyName('')
        setDevices([])
      }
    })
  }, [])

  // Load company ID from users/{uid}
  useEffect(() => {
    if (!user) return
    const r = ref(db, `users/${user.uid}/companyId`)
    const h = (snap: any) => { if (snap.exists()) setCompanyId(snap.val()) }
    onValue(r, h)
    return () => off(r, 'value', h)
  }, [user])

  // Load company name + devices list
  useEffect(() => {
    if (!companyId) return

    const nameRef    = ref(db, `companies/${companyId}/name`)
    const devicesRef = ref(db, `companies/${companyId}/devices`)

    const nameHandler = (snap: any) => {
      if (snap.exists()) setCompanyName(snap.val())
    }
    const devicesHandler = (snap: any) => {
      if (!snap.exists()) return
      const raw = snap.val() as Record<string, { name?: string }>
      const list: Device[] = Object.entries(raw).map(([id, val]) => ({
        id,
        name: val.name ?? id,
      }))
      setDevices(list)
      // Auto-select if only one device
      if (list.length === 1) {
        setDeviceIdState(list[0].id)
        localStorage.setItem('pv_deviceId', list[0].id)
      }
    }

    onValue(nameRef, nameHandler)
    onValue(devicesRef, devicesHandler)
    return () => {
      off(nameRef,    'value', nameHandler)
      off(devicesRef, 'value', devicesHandler)
    }
  }, [companyId])

  const setDeviceId = (id: string) => {
    setDeviceIdState(id)
    localStorage.setItem('pv_deviceId', id)
  }

  const devicePath = (subpath: string) =>
    `companies/${companyId}/devices/${deviceId}/${subpath}`

  const signIn = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).then(() => {})

  const signOut = async () => {
    await fbSignOut(auth)
    setDeviceIdState('')
    localStorage.removeItem('pv_deviceId')
  }

  return (
    <AuthContext.Provider value={{
      user, authLoading, companyId, companyName,
      devices, deviceId, setDeviceId, devicePath,
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
