# Gen.ON

Seguimiento de pacientes por WhatsApp para clínicas, centros de estética y consultorios: secuencias
de mensajes desde la fecha del procedimiento, respuestas con botones, alertas para la clínica y
métricas. Cada clínica usa su propio número y su propia app de Meta; Gen.iality los conecta desde el
asistente de configuración.

## Estructura

```
packages/shared   Tipos y constantes compartidos (roles, planes, pasos del asistente)
apps/api          NestJS + firebase-admin: API, asistente de Meta, webhooks por organización
apps/web          React + Vite + Mantine: una sola app con roles
firestore.rules   Reglas de Firestore (solo lectura de la propia organización desde el navegador)
.do/app.yaml      DigitalOcean App Platform (API)
netlify.toml      Netlify (web)
```

## Primer uso

1. En la consola de Firebase (`gen-on-f897a`):
   - **Authentication → Comenzar** y activar **Correo electrónico/contraseña**.
   - **Configuración del proyecto → Tus apps → Web**: registrar la app y copiar `apiKey` y `appId`.
2. Variables:
   - `apps/api/.env` (ver `apps/api/.env.example`).
   - `apps/web/.env` (ver `apps/web/.env.example`).
3. `npm install` en la raíz.
4. Crear el primer superadmin: `npm run superadmin -- correo@dominio.com`. Luego, en el login,
   "¿Olvidaste tu contraseña?" para definirla.
5. `npm run dev:api` y `npm run dev:web` (http://localhost:5173).

## Datos (Firestore)

```
organizations/{orgId}                  datos, plan, estado, zona horaria, hora de envío, días sin envíos,
                                       texto de autorización de datos (con versión)
  members/{uid}                        rol en la organización
  meta_connection/main                 estado del asistente y datos públicos de la conexión
  templates/{id}                       plantillas: contenido, validación clínica, estado en Meta,
                                       versión aprobada que se envía (approved)
  protocols/{id}                       pasos: día relativo (-2, 0, +7…), hora y plantilla
  patients/{id}                        datos y autorización (texto exacto, versión, quién y cuándo), baja
  enrollments/{id}                     paciente + protocolo + fecha del procedimiento o cita
  appointments/{id}                    citas agendadas a mano con sus recordatorios (sin protocolo)
  outbox/{id}                          la parrilla: un documento por envío (queue_at solo mientras está programado)
  messages/{wamid}                     enviados y recibidos, con su historial de estados
  wa_contacts/{wa_id}                  último mensaje del paciente (ventana de 24 h)
  stats_daily/{YYYY-MM-DD}             contadores por día (sent, delivered, read, failed, inbound, billable)
  usage_monthly/{YYYY-MM}              pacientes nuevos del mes (base del cobro) y mensajes enviados (messages_sent)
  webhook_events/{id}                  eventos crudos de Meta
  clinical_records/{patientId}         ficha clínica: antecedentes (versiones anteriores en history/)
  clinical_notes/{id}                  notas de la ficha: no se editan ni se borran (aclaraciones con amends)
  clinical_access/{id}                 quién consultó o modificó cada ficha y cuándo
library_templates/{id}                 biblioteca global de Gen.iality
library_protocols/{id}
org_secrets/{orgId}                    token, clave de la app, verify token y PIN, cifrados (solo la API)
users/{uid}                            espejo de rol y organización
```

Ninguna consulta necesita índices compuestos.

## Flujo de mensajes

1. **Plantillas**: se copian de la biblioteca (o se crean), un profesional de la salud registra la
   validación clínica y se envían a Meta. Editar una aprobada crea una versión nueva en borrador; la
   aprobada se sigue enviando hasta que Meta apruebe la nueva.
2. **Protocolo**: pasos con día relativo a la fecha del procedimiento. Si un paso cae en un día sin
   envíos, se corre hacia atrás si es antes del procedimiento y hacia adelante si es después.
3. **Paciente**: se registra con su autorización de datos y se inscribe a un protocolo. La
   inscripción arma su parrilla; los pasos cuya hora ya pasó quedan omitidos. Si a un mensaje le
   faltaría un dato ({{hora}}, {{profesional}}), la inscripción se rechaza.
4. **Citas** (Citas o Parrilla → Programar recordatorio): fecha, hora, motivo y profesional, con hasta
   5 recordatorios (N días antes a una hora, o N horas antes). Reprogramar cancela lo pendiente y lo
   vuelve a programar; cancelar la cita o marcarla asistió/no asistió cancela lo que no ha salido.
   Los recordatorios que ya pasaron no se programan. Un envío manual suelto toma los datos de la
   última inscripción activa o, si no hay, de la próxima cita.
5. **Despachador** (`DISPATCH_ENABLED=true`, cada minuto, solo organizaciones activas): toma cada
   envío con una transacción, lo envía con la versión aprobada y deja el resultado. Límites de Meta
   y fallas temporales se reintentan (1, 4, 9, 16 min); un envío atrasado más de 12 h se omite; uno
   interrumpido a mitad queda fallido para revisar (pudo haber salido). "Enviar ahora" (envío manual
   o desde la parrilla) no espera al despachador: sale en el momento y muestra el resultado.
   **Límite mensual** (`monthly_message_limit` de la organización, lo fija el superadmin; vacío =
   sin límite): cuenta los mensajes enviados a pacientes en el mes de la clínica; al llegar al
   límite, el resto del mes queda omitido con el motivo y se puede reenviar si se sube el límite. La
   clínica ve el uso en Inicio y recibe aviso desde el 80 %. El mensaje de prueba del asistente no cuenta.
6. **Webhook**: estados de entrega a la parrilla, el botón que tocó el paciente (payload
   `o:<envío>:<botón>`) y la aprobación de plantillas.

## Cuentas y accesos

- **Rol global** (custom claim `role` del token): `superadmin` (todo) o `staff` (equipo Gen.iality:
  WhatsApp, plantillas y protocolos solo en sus organizaciones asignadas). Los usuarios de clínica
  no tienen rol global.
- **Accesos por organización** (`organizations/{org}/members/{uid}` y `users/{uid}.memberships`):
  una persona puede estar en varias organizaciones con un rol distinto en cada una (`org_admin`,
  `clinician` (profesional de salud), `operator`, o `staff` para el equipo Gen.iality). No van en el token, así que quitar un acceso
  aplica de inmediato (máx. 30 s de caché por instancia).
- Jerarquía dentro de una organización: operador = profesional de salud < administrador < equipo
  Gen.iality < superadmin.
  En la API, `@OrgAccess('org_admin')` exige ese rol mínimo en la organización de la ruta.
- **Usuarios** (`/admin/users`, solo superadmin): crear cuentas, tipo de cuenta, accesos, contraseña
  y desactivar. Cambiar el tipo o desactivar cierra las sesiones abiertas.
- **Ficha clínica** (`@Clinical`): la leen y escriben el profesional de salud y el administrador de
  la clínica; el superadmin solo la lee (soporte). El equipo Gen.iality y los operadores no la ven.
  Cada consulta queda en `clinical_access` (el administrador ve el registro), y las reglas de
  Firestore la bloquean desde el navegador. Complementa la historia clínica legal, que sigue en el
  software de la clínica.
- La clínica gestiona su propio equipo (administradores, profesionales y operadores); el equipo Gen.iality
  asignado solo se gestiona desde Usuarios.

## Webhook por organización

`/webhooks/meta/{orgId}`: GET para la verificación (verify token propio de la organización) y POST
para eventos, firmados con la clave secreta de **su** app. Los eventos repetidos no se cuentan dos
veces y un estado nunca retrocede.

## Despliegue

**API (App Platform)**: crear la app desde el repositorio con `.do/app.yaml` y cargar:

- `FIREBASE_SERVICE_ACCOUNT`: el JSON de la cuenta de servicio, completo o en base64.
- `SECRETS_KEY`: **la misma que en local**, porque local y producción usan la misma base. Si se
  pierde, hay que volver a cargar los tokens de todas las organizaciones.
- `WEB_ORIGINS`: la URL de Netlify.

**Web (Netlify)**: el repo con `netlify.toml`. Variables `VITE_API_URL` (URL de App Platform) y
`VITE_FIREBASE_*`.

**Reglas de Firestore**: `npx firebase-tools login` y `npx firebase-tools deploy --only firestore`.

## Pruebas

`npm test` (API).

Revisión de la app de Meta (videos de proveedor de tecnología): [docs/revision-meta.md](docs/revision-meta.md).
