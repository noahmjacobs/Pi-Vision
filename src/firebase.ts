import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth } from 'firebase/auth'
import { getAnalytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: "AIzaSyAv8s0vErAwc3KZaRF55isbKTzhgjuwGNE",
  authDomain: "pivision-28ddb.firebaseapp.com",
  projectId: "pivision-28ddb",
  storageBucket: "pivision-28ddb.firebasestorage.app",
  messagingSenderId: "478542567053",
  appId: "1:478542567053:web:d62859128fd4c83dbbb4c4",
  measurementId: "G-BPHNESEJMP",
  databaseURL: "https://pivision-28ddb-default-rtdb.firebaseio.com",
}

export const app  = initializeApp(firebaseConfig)
export const db   = getDatabase(app)
export const auth = getAuth(app)

if (typeof window !== 'undefined') {
  try { getAnalytics(app) } catch {}
}
