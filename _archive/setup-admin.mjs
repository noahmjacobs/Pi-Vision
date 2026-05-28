import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getDatabase, ref, set } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyAv8s0vErAwc3KZaRF55isbKTzhgjuwGNE",
  authDomain: "pivision-28ddb.firebaseapp.com",
  databaseURL: "https://pivision-28ddb-default-rtdb.firebaseio.com",
  projectId: "pivision-28ddb",
}

const ADMIN_UID   = 'GGxaXSWuo4e9LmaIR6VSsFBU5aL2'

const app  = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db   = getDatabase(app)

// Prompt for credentials
import * as readline from 'readline'
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = q => new Promise(r => rl.question(q, r))

const email    = await ask('Admin email: ')
const password = await ask('Admin password: ')
rl.close()

try {
  await signInWithEmailAndPassword(auth, email, password)
  await set(ref(db, `users/${ADMIN_UID}/role`), 'admin')
  console.log(`\n✓ Done! users/${ADMIN_UID}/role = "admin"`)
  console.log('  You can now delete this file and sign in to the app.')
} catch (e) {
  console.error('\n✗ Failed:', e.message)
  console.error('  Make sure the email/password match the account you created.')
}

process.exit(0)
