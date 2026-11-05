// Temas de prueba para el asistente con IA.
//   npm run seed:assistant                    lista las organizaciones (id, nombre, plan)
//   npm run seed:assistant -- <orgId>         crea los temas (aprobados) si no existen
//   npm run seed:assistant -- <orgId> --reset borra solo los creados por este script
//
// Quedan con `demo: true`. Local y producción comparten la base: úsalo solo en
// la organización de demo.
const fs = require('fs');
const path = require('path');

const API = path.resolve(__dirname, '..');
process.chdir(API);
require('@nestjs/config').ConfigModule.forRoot(); // carga apps/api/.env
const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function account() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (inline) return JSON.parse(inline.startsWith('{') ? inline : Buffer.from(inline, 'base64').toString('utf8'));
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  throw new Error('Falta FIREBASE_SERVICE_ACCOUNT o FIREBASE_SERVICE_ACCOUNT_PATH en apps/api/.env');
}

const TOPICS = [
  [
    'Horario de atención',
    'Atendemos de lunes a viernes de 7:00 a. m. a 6:00 p. m. y los sábados de 8:00 a. m. a 1:00 p. m. Domingos y festivos no hay atención. Fuera del horario puedes dejar tu mensaje y te respondemos el siguiente día hábil.',
  ],
  [
    'Ubicación y parqueadero',
    'Estamos en la Calle 100 # 15-20, consultorio 305, Bogotá. El edificio tiene parqueadero para pacientes con validación en recepción (las primeras 2 horas sin costo). Cerca está la estación de TransMilenio Calle 100.',
  ],
  [
    'Medios de pago',
    'Recibimos efectivo, tarjetas débito y crédito (Visa, Mastercard y American Express), transferencia y Nequi. Para procedimientos se paga un anticipo del 30 % al agendar y el saldo el día del procedimiento. Pregunta en recepción por la financiación con entidades aliadas.',
  ],
  [
    'Agendar, cambiar o cancelar una cita',
    'Las citas las agenda, cambia o cancela una persona del equipo por este mismo chat o al teléfono 601 555 1234. Para cambiar o cancelar, avísanos con al menos 24 horas de anticipación. Llega 15 minutos antes de tu cita con tu documento de identidad.',
  ],
  [
    'Antes del procedimiento',
    'Ven sin maquillaje en la zona a tratar, con ropa cómoda y acompañado si te lo indicaron. Si tu procedimiento requiere ayuno, la indicación exacta te la da el profesional en la valoración. Informa siempre los medicamentos que tomas y si tienes alergias.',
  ],
  [
    'Después del procedimiento',
    'Sigue las indicaciones escritas que te entregó el profesional. Es normal algo de inflamación o enrojecimiento los primeros días. No te automediques. Si tienes fiebre, sangrado abundante, dolor que empeora o enrojecimiento que se extiende, acude a urgencias y avísanos.',
  ],
  [
    'Valoración',
    'La valoración es una cita con el profesional para revisar tu caso, resolver dudas y definir el plan de tratamiento. Dura unos 30 minutos y tiene un costo de $80.000, que se descuenta si haces el procedimiento en los siguientes 30 días.',
  ],
];

async function main() {
  const [orgId, flag] = process.argv.slice(2);
  initializeApp({ credential: cert(account()) });
  const db = getFirestore();

  if (!orgId) {
    const orgs = await db.collection('organizations').orderBy('name').get();
    console.log('Organizaciones (id · nombre · plan · estado):');
    orgs.docs.forEach((d) => console.log(`  ${d.id} · ${d.get('name')} · ${d.get('plan')} · ${d.get('status')}`));
    console.log('\nUso: npm run seed:assistant -- <orgId> [--reset]');
    return;
  }

  const org = await db.collection('organizations').doc(orgId).get();
  if (!org.exists) throw new Error(`No existe la organización ${orgId}`);
  const col = org.ref.collection('assistant_knowledge');
  const existing = await col.where('demo', '==', true).get();

  if (flag === '--reset') {
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Borrados ${existing.size} temas de prueba de ${org.get('name')}.`);
    return;
  }

  const titles = new Set(existing.docs.map((d) => d.get('title')));
  const batch = db.batch();
  let created = 0;
  for (const [title, content] of TOPICS) {
    if (titles.has(title)) continue;
    batch.set(col.doc(), {
      title,
      content,
      approved: true,
      approved_by: 'seed',
      approved_by_name: 'Gen.iality (datos de prueba)',
      approved_at: FieldValue.serverTimestamp(),
      updated_by: 'seed',
      updated_at: FieldValue.serverTimestamp(),
      demo: true,
    });
    created++;
  }
  await batch.commit();
  console.log(`${org.get('name')} (plan ${org.get('plan')}): ${created} temas creados, ${TOPICS.length - created} ya existían.`);
  if (org.get('plan') !== 'oraculo') console.log('Aviso: el asistente solo funciona en el plan IA Oráculo.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
