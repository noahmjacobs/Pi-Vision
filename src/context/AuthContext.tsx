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
  color?: string
}

export interface Company {
  id: string
  name: string
  devices: Device[]
}

interface AuthContextValue {
  user: User | null
  authLoading: boolean
  isAdmin: boolean
  companyId: string
  companyName: string
  devices: Device[]
  deviceId: string
  allCompanies: Company[]           // admin only
  adminViewAs: (companyId: string, deviceId: string) => void
  setDeviceId: (id: string) => void
  devicePath: (subpath: string) => string
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [companyId, setCompanyId]     = useState('')
  const [companyName, setCompanyName] = useState('')
  const [devices, setDevices]         = useState<Device[]>([])
  const [allCompanies, setAllCompanies] = useState<Company[]>([])
  const [deviceId, setDeviceIdState]  = useState(
    () => localStorage.getItem('pv_deviceId') ?? ''
  )

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setAuthLoading(false)
      if (!u) {
        setIsAdmin(false)
        setCompanyId('')
        setCompanyName('')
        setDevices([])
        setAllCompanies([])
      }
    })
  }, [])

  // Load user record → role + companyId
  useEffect(() => {
    if (!user) return
    const r = ref(db, `users/${user.uid}`)
    const h = (snap: any) => {
      if (!snap.exists()) return
      const data = snap.val()
      if (data.role === 'admin') {
        setIsAdmin(true)
      } else {
        setIsAdmin(false)
        setCompanyId(data.companyId ?? '')
      }
    }
    onValue(r, h)
    return () => off(r, 'value', h)
  }, [user])

  // Admin: load ALL companies
  useEffect(() => {
    if (!isAdmin) return
    const r = ref(db, 'companies')
    const h = (snap: any) => {
      if (!snap.exists()) return
      const raw = snap.val() as Record<string, any>
      const list: Company[] = Object.entries(raw).map(([id, val]) => ({
        id,
        name: val.name ?? id,
        devices: val.devices
          ? Object.entries(val.devices as Record<string, any>).map(([did, dval]) => ({
              id: did,
              name: dval.name ?? did,
              color: dval.color,
            }))
          : [],
      }))
      setAllCompanies(list)
    }
    onValue(r, h)
    return () => off(r, 'value', h)
  }, [isAdmin])

  // Regular user: load their company name + devices
  useEffect(() => {
    if (!companyId || isAdmin) return
    const nameRef    = ref(db, `companies/${companyId}/name`)
    const devicesRef = ref(db, `companies/${companyId}/devices`)
    const nameH = (snap: any) => { if (snap.exists()) setCompanyName(snap.val()) }
    const devH  = (snap: any) => {
      if (!snap.exists()) return
      const list: Device[] = Object.entries(snap.val() as Record<string, any>).map(([id, val]) => ({
        id,
        name: (val as any).name ?? id,
        color: (val as any).color,
      }))
      setDevices(list)
      if (list.length === 1) {
        setDeviceIdState(list[0].id)
        localStorage.setItem('pv_deviceId', list[0].id)
      }
    }
    onValue(nameRef, nameH)
    onValue(devicesRef, devH)
    return () => {
      off(nameRef, 'value', nameH)
      off(devicesRef, 'value', devH)
    }
  }, [companyId, isAdmin])

  const setDeviceId = (id: string) => {
    setDeviceIdState(id)
    localStorage.setItem('pv_deviceId', id)
  }

  // Admin can switch into any company/device view
  const adminViewAs = (cId: string, dId: string) => {
    const company = allCompanies.find(c => c.id === cId)
    if (!company) return
    setCompanyId(cId)
    setCompanyName(company.name)
    setDevices(company.devices)
    setDeviceIdState(dId)
    localStorage.setItem('pv_deviceId', dId)
  }

  const devicePath = (subpath: string) =>
    `companies/${companyId}/devices/${deviceId}/${subpath}`

  const signIn = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).then(() => {})

  const signOut = async () => {
    await fbSignOut(auth)
    setDeviceIdState('')
    setCompanyId('')
    localStorage.removeItem('pv_deviceId')
  }

  return (
    <AuthContext.Provider value={{
      user, authLoading, isAdmin,
      companyId, companyName, devices, deviceId,
      allCompanies, adminViewAs,
      setDeviceId, devicePath,
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
