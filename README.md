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
   **Importar/Exportar** (Pacientes): Excel con Nombres, Apellidos y Celular (Documento, Correo y
   Notas opcionales), hasta 1.000 filas; una misma autorización (método y nota) para todo el
   archivo, los celulares ya registrados se omiten y no se inscriben a protocolos (no cuentan en el
   cobro hasta que se inscriban). Exportar descarga lo que muestra la lista (todo o la búsqueda).
   **Importar → Fichas de seguimiento** (profesional de salud o administrador,
   `POST /organizations/{org}/clinical/import`): una fila por atención; el paciente se busca por
   celular o documento. Las columnas de antecedentes que vienen reemplazan solo esos campos (con
   la versión anterior en `history/`); si la fila trae nota, procedimiento o indicaciones para el
   paciente, se crea una nota a nombre de quien importa (`imported_from`). Cada ficha tocada
   queda en `clinical_access`.
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
   `o:<envío>:<botón>`) y la aprobación de plantillas. Al tocar un botón se ejecuta su acción
   (`AutoReplyService`): la respuesta automática (`reply_text`, solo planes con `auto_replies`) y la
   baja (`opt_out`, en todos los planes). Escribir solo "BAJA", "STOP" o "darme de baja" también da
   de baja al paciente de ese número. Las respuestas salen como texto libre (la ventana de 24 h está
   abierta porque el paciente acaba de escribir) y quedan en `messages` con `kind`.
7. **WhatsApp uno a uno** (pestaña WhatsApp del paciente, `ChatService`, planes con `one_to_one`):
   la conversación con su número (lo que escribió, botones, plantillas de la parrilla, respuestas
   automáticas y mensajes de la clínica, con su estado de entrega). Se puede escribir texto libre
   solo dentro de las 24 h siguientes a su último mensaje (`wa_contacts.last_inbound_at`, regla de
   Meta); fuera de esa ventana hay que enviar una plantilla. Responder deja atendidos sus mensajes
   en "Requiere atención". Los mensajes de la clínica no cuentan en el límite mensual.
8. **Inicio** (`GET /organizations/{org}/home`): "Requiere atención" junta los últimos 7 días de
   botones con alerta, envíos fallidos o no entregados y mensajes escritos por pacientes; "Atendido"
   marca el envío (`attention_resolved_at`) o los mensajes de ese número (`handled`). Una respuesta
   nueva a una alerta ya atendida vuelve a aparecer. También aparecen los mensajes con botones sin
   respuesta tras `no_response_hours` (Configuración → Alertas; 48 h por defecto, `null` = no).
   **Aviso por WhatsApp al equipo** (`AlertNotifierService`, planes con `alerts`): al tocar un botón
   de alerta desde el nivel mínimo (`alert_notify_level`), se avisa a los celulares de
   `alert_notify_phones` con la plantilla `genon_aviso_alerta_vN`, que Gen.ON crea en la cuenta de
   la clínica con "Activar avisos" (estado en `organizations/{org}.alert_template`, se actualiza
   por el webhook o con "Revisar estado"). "Agenda de hoy" muestra las citas del día con
   el último botón de sus recordatorios y las de los 14 días anteriores sin marcar asistencia.

## Planes

`PLANS[plan].features` (`packages/shared/src/plans.ts`) decide qué tiene cada organización; se
revisa con `hasFeature` en la API (`OrganizationsService.withFeature` responde 403 con el plan que
la incluye) y en el web (`PlanGate`). Esencial: envíos programados, botones, historial y "Requiere
atención" con fallas y mensajes escritos. Adherencia agrega respuestas automáticas, alertas (en
Inicio y aviso por WhatsApp), Métricas, chat uno a uno y **Reporte mensual** (Reporte mensual →
mes → "Imprimir o guardar PDF"). La baja por botón o por "BAJA" funciona en todos los planes.

## Asistente IA (plan IA Oráculo)

`apps/api/src/assistant`: cuando un paciente escribe texto (y no es "BAJA"), el webhook llama a
`AssistantService.handle` sin esperar. Espera 4 s para juntar mensajes seguidos, arma el prompt
(`prompt.ts`: reglas de seguridad, datos de la clínica, **solo** el contenido aprobado de
`assistant_knowledge` y, si escribe un paciente, lo que puede consultar de sí mismo
(`patient-context.ts`: datos registrados, citas próximas y anteriores, procedimientos e
indicaciones que ya recibió con el texto aprobado de cada plantilla; con `assistant.use_clinical`,
alergias, medicamentos que toma y las "Indicaciones para el paciente" (`guidance`) de las notas de
la ficha marcadas `share_with_assistant`, nunca el texto interno; cada uso queda en
`clinical_access` como "Consultó el asistente IA"). Un tema con `procedure`
solo se usa con pacientes de ese procedimiento. Va con las últimas 24 h de la
conversación y llama a Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL`, por defecto
`gemini-3.5-flash-lite`) pidiendo JSON `{reply, handoff, reason, urgent}`.

- Responde por WhatsApp (`messages.kind = 'assistant'`) y deja atendido el mensaje.
- `handoff`: envía su texto o `assistant.handoff_message`, marca el mensaje (`handoff_reason`, se
  ve en Requiere atención), avisa al equipo como alerta (urgente si `urgent`) y se pausa 12 h con
  ese número (`wa_contacts.assistant_paused_until`).
- También se pausa 12 h cuando alguien de la clínica escribe por el chat; "Atendido" lo reanuda.
- Máximo 15 respuestas por número al día; después pasa a una persona. Si Gemini falla, no
  responde y el mensaje queda en Requiere atención.
- Se configura en **Asistente IA** (administrador): activar, temas con aprobación (queda quién
  aprobó), indicaciones de tono, mensaje de transferencia y "Probar" (no envía nada).

Los mensajes de los pacientes se envían a Google (Gemini) para generar la respuesta: Google es
encargado del tratamiento y debe figurar como tal en la política de datos de la clínica.

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
