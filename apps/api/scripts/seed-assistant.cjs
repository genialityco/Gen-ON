// Temas de prueba para el asistente con IA.
//   npm run seed:assistant                    lista las organizaciones (id, nombre, plan)
//   npm run seed:assistant -- <orgId>         crea los temas (aprobados) si no existen y notas de
//                                             control con indicaciones en 3 pacientes de demostración
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

// [tema, contenido, procedimiento al que aplica (null = todos)]
const TOPICS = [
  [
    'Cuidados después de la rinoplastia',
    'Duerme con la cabeza elevada (dos almohadas) las primeras 2 semanas. No te suenes la nariz ni uses gafas apoyadas sobre ella por 4 semanas. Haz los lavados nasales con suero fisiológico como te indicaron. Evita el sol directo, el ejercicio intenso y agacharte bruscamente por 3 semanas. La férula se retira en el control de los 7 días. Es normal la inflamación y los morados alrededor de los ojos la primera semana.',
    'rinoplastia',
  ],
  [
    'Cuidados después de la liposucción',
    'Usa la faja de compresión día y noche durante 4 semanas; solo te la quitas para bañarte. Camina desde el primer día para mejorar la circulación. Toma mucha agua. No hagas ejercicio fuerte por 4 semanas. Los masajes de drenaje linfático inician cuando te lo indique el profesional, normalmente desde el día 3 al 5.',
    'liposucción',
  ],
  [
    'Cuidados después de la blefaroplastia',
    'Aplica compresas frías sobre los párpados 10 minutos cada hora durante los primeros 2 días. Duerme con la cabeza elevada. No te maquilles los ojos ni uses lentes de contacto por 2 semanas. Usa gafas de sol al salir. Los puntos se retiran entre el día 5 y 7.',
    'blefaroplastia',
  ],
  [
    'Cuidados después de la toxina botulínica',
    'Durante las 4 horas siguientes no te acuestes, no hagas ejercicio y no masajees ni presiones la zona. Evita el sauna y el sol intenso por 24 horas. El efecto empieza entre el día 3 y 5 y es completo a los 15 días; si se necesita, el retoque se hace en el control.',
    'toxina botulínica',
  ],
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

// Notas de control con indicaciones para el paciente en pacientes de demostración:
// [nombre, días desde hoy, procedimiento, nota interna, indicaciones, próximo control en días]
const DEMO_NOTES = [
  [
    'María Fernanda',
    -2,
    'Rinoplastia',
    'Control posoperatorio. Edema leve esperado, sin signos de infección.',
    {
      instructions: 'Continúa los lavados nasales con suero fisiológico 3 veces al día y duerme con la cabeza elevada hasta el próximo control.',
      medications: 'Acetaminofén 500 mg cada 8 horas solo si hay dolor, máximo 3 días.',
      restrictions: 'No uses gafas apoyadas en la nariz ni hagas ejercicio intenso hasta el 1 de diciembre. Evita el sol directo.',
      warning_signs: 'Sangrado por la nariz que no para en 10 minutos, fiebre mayor a 38 °C o dificultad para respirar.',
    },
    12,
  ],
  [
    'Valentina',
    -1,
    'Blefaroplastia superior',
    'Control día 4. Sutura en buen estado.',
    {
      instructions: 'Compresas frías 10 minutos cada 2 horas mientras estés despierta. Limpia la herida con suero y gasa.',
      medications: null,
      restrictions: 'No te maquilles los ojos ni uses lentes de contacto hasta el retiro de puntos.',
      warning_signs: 'Dolor intenso en el ojo, visión borrosa o pus en la herida.',
    },
    3,
  ],
  [
    'Carlos Eduardo',
    -3,
    'Toxina botulínica',
    'Control a las 2 semanas. Resultado simétrico; retoque leve en entrecejo.',
    {
      instructions: 'El retoque se hace en el próximo control. No necesitas cuidados especiales hasta entonces.',
      medications: null,
      restrictions: 'Evita sauna y sol intenso las 24 horas siguientes al retoque.',
      warning_signs: 'Párpado caído o dificultad para cerrar el ojo.',
    },
    5,
  ],
];

async function seedNotes(db, org) {
  const ref = org.ref;
  const tz = org.get('timezone') || 'America/Bogota';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const addDays = (ymd, n) => new Date(Date.parse(ymd) + n * 86_400_000).toISOString().slice(0, 10);
  const patients = (await ref.collection('patients').where('demo', '==', true).get()).docs;
  let n = 0;
  for (const [name, days, procedure, body, guidance, nextControl] of DEMO_NOTES) {
    const p = patients.find((d) => d.get('first_name') === name);
    if (!p) continue;
    const existing = await ref.collection('clinical_notes').where('patient_id', '==', p.id).get();
    if (existing.docs.some((d) => d.get('seed_assistant'))) continue;
    await ref.collection('clinical_notes').add({
      patient_id: p.id,
      kind: 'control',
      date: addDays(today, days),
      body,
      procedure: { name: procedure, area: null, product: null, lot: null, quantity: null },
      amends: null,
      guidance: { ...guidance, next_control: addDays(today, nextControl) },
      share_with_assistant: true,
      author_uid: 'seed',
      author_name: 'Dra. Laura Gómez (demo)',
      author_email: null,
      author_role: 'clinician',
      created_at: FieldValue.serverTimestamp(),
      seed_assistant: true,
      demo: true,
    });
    n++;
  }
  return n;
}

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
    const notes = await org.ref.collection('clinical_notes').where('seed_assistant', '==', true).get();
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));
    notes.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Borrados ${existing.size} temas y ${notes.size} notas de prueba de ${org.get('name')}.`);
    return;
  }

  const titles = new Set(existing.docs.map((d) => d.get('title')));
  const batch = db.batch();
  let created = 0;
  for (const [title, content, procedure = null] of TOPICS) {
    if (titles.has(title)) continue;
    batch.set(col.doc(), {
      title,
      content,
      procedure,
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
  const notes = await seedNotes(db, org);
  console.log(`${org.get('name')} (plan ${org.get('plan')}): ${created} temas creados, ${TOPICS.length - created} ya existían, ${notes} notas con indicaciones.`);
  if (org.get('plan') !== 'oraculo') console.log('Aviso: el asistente solo funciona en el plan IA Oráculo.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
