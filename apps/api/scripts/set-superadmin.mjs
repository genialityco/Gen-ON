// Uso: npm run superadmin -- correo@dominio.com [contraseña]
// Crea el usuario si no existe y le da el rol superadmin. Con contraseña, la
// define (o la cambia); sin ella, se define con "¿Olvidaste tu contraseña?"
// en el login.
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const here = dirname(fileURLToPath(import.meta.url));
try {
  for (const line of readFileSync(resolve(here, '../.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];
if (!email) {
  console.error('Uso: npm run superadmin -- correo@dominio.com [contraseña]');
  process.exit(1);
}
if (password !== undefined && password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres');
  process.exit(1);
}

const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
const account = inline
  ? JSON.parse(inline.startsWith('{') ? inline : Buffer.from(inline, 'base64').toString('utf8'))
  : JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));

initializeApp({ credential: cert(account) });
const auth = getAuth();

let user = await auth.getUserByEmail(email).catch((e) => {
  if (e.code === 'auth/user-not-found') return null;
  if (e.code === 'auth/configuration-not-found') {
    console.error('Authentication no está activado: en la consola de Firebase, Authentication → Comenzar → Correo/contraseña');
    process.exit(1);
  }
  throw e;
});
const created = !user;
if (!user) user = await auth.createUser({ email, ...(password ? { password } : {}) });
else if (password) await auth.updateUser(user.uid, { password });
await auth.setCustomUserClaims(user.uid, { role: 'superadmin' });
await getFirestore()
  .collection('users')
  .doc(user.uid)
  .set({ email, role: 'superadmin', updated_at: FieldValue.serverTimestamp() }, { merge: true });

const note = password
  ? ' (contraseña definida)'
  : created
    ? ' (usuario nuevo: define la contraseña desde el login)'
    : '';
console.log(`${email} es superadmin${note}`);
