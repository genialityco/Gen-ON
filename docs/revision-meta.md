# Revisión de la app de Meta (Tech Provider)

Para pasar la app de Gen.iality a proveedor de tecnología, Meta pide acceso avanzado a
`whatsapp_business_messaging` y `whatsapp_business_management`, con dos videos:

1. **Mensaje**: un mensaje creado y enviado **desde Gen.ON** que llega al WhatsApp del celular.
2. **Plantilla**: Gen.ON creando una plantilla (y, mejor, cómo aparece en el administrador de WhatsApp).

Los dos se graban con el **número de prueba** de la app de Gen.iality, en una organización de demo
de Gen.ON conectada a esa app. Conviene grabar primero el de la plantilla: el video del mensaje
usa esa misma plantilla ya aprobada.

## 1. Antes, en Meta (app de Gen.iality)

- **Portafolio de Gen.iality verificado** (Meta no deja enviar a revisión sin esto).
- **App → Configuración → Básica**: ícono, URL de política de privacidad, URL de eliminación de
  datos y categoría.
- **WhatsApp → Configuración de la API**: anotar el identificador del número de prueba y de su
  cuenta de WhatsApp; en "Para", agregar **tu celular** como destinatario y verificarlo con el
  código (hasta 5 números).
- **Token**: en el portafolio, un usuario del sistema (administrador) con la app y la cuenta de
  WhatsApp de prueba asignadas, y un token sin vencimiento con `whatsapp_business_messaging` y
  `whatsapp_business_management` (y `business_management` si se quiere leer la verificación).
  El token temporal de "Configuración de la API" también sirve, pero vence en 24 h.

## 2. Gen.ON en local

1. **Túnel** para que Meta alcance el webhook (sin él no se ven los estados de entrega):
   ```
   cloudflared tunnel --url http://localhost:3000
   ```
   Copiar la URL `https://….trycloudflare.com` en `PUBLIC_API_URL` de `apps/api/.env`. La URL
   cambia cada vez que se abre el túnel: si se cierra, repetir "Configurar webhook" (paso 8).
2. **Organización de demo**: en `/admin/organizations`, crear p. ej. "Clínica Demo" (no correr
   `seed:demo` en ella: marca plantillas como aprobadas sin pasar por Meta).
3. **Asistente** de la organización, con los datos de la app de Gen.iality:
   empresa → portafolio → verificación → app (id y clave secreta) → token → número de prueba
   (ya viene registrado en la API) → webhook (configurar la app y suscribir la cuenta) → mensaje
   de prueba `hello_world` a tu celular. Debe quedar en "Entregado".
4. **Activar** la organización (Configuración → Estado: Activa). El despachador solo envía a
   organizaciones activas.
5. **Despachador solo para la demo** en `apps/api/.env` (la base es la misma de producción, así
   que no se encienden las demás clínicas):
   ```
   DISPATCH_ENABLED=true
   DISPATCH_ORG_IDS=<id de la organización de demo>
   ```
   Reiniciar `npm run dev:api`; el log debe decir "Despachador encendido … solo para: <id>".
   **Al terminar, volver a `DISPATCH_ENABLED=false`.**
6. Ensayar los dos guiones una vez antes de grabar.

## 3. Video 2: crear una plantilla

Pantalla: navegador con Gen.ON y, en otra pestaña, el administrador de WhatsApp
(business.facebook.com → WhatsApp Manager → Plantillas de mensajes) en la cuenta de prueba.

1. Iniciar sesión en Gen.ON y entrar a la organización de demo.
2. **Plantillas → Nueva plantilla**: categoría Utilidad, idioma español, por ejemplo:
   - Texto: `Hola {{nombre}}, te recordamos tu cita en {{clinica}}. ¿Nos confirmas tu asistencia?`
   - Botones de respuesta rápida: "Confirmo", "Necesito reprogramar".
3. Mostrar la vista previa de WhatsApp, llenar la **validación clínica** y guardar.
4. **Enviar a Meta**: el estado pasa a "En revisión" (o "Aprobada" de inmediato).
5. Cambiar a la pestaña del administrador de WhatsApp y recargar: aparece la plantilla con el
   mismo nombre (`<clave>_v1`).
6. Volver a Gen.ON → **Sincronizar con Meta** (o esperar el webhook): queda "Aprobada".

## 4. Video 1: enviar un mensaje

Pantalla: Gen.ON a un lado y el celular al otro, con el chat visible (WhatsApp Web en otra
ventana sirve, o el celular proyectado con Enlace Móvil/scrcpy).

1. **Pacientes → Nuevo paciente** con tu celular verificado (el destinatario del paso 1) y la
   autorización de datos.
2. Abrir el paciente → **Enviar plantilla** → la plantilla del video 2 → **Enviar**.
3. En la parrilla queda "Programado"; en menos de un minuto el despachador la envía y pasa a
   "Enviado" → "Entregado".
4. Mostrar el mensaje llegando al WhatsApp del celular, con el nombre del paciente reemplazado.
5. Opcional, suma puntos: tocar "Confirmo" en el celular y mostrar en Gen.ON la respuesta
   registrada y el estado "Leído".

Si algo falla con el despachador, el respaldo es el paso 9 del asistente (mensaje de prueba),
que envía al instante.

## 5. Consejos de grabación

- Los revisores leen en inglés: agregar **subtítulos o rótulos en inglés** que expliquen cada
  paso ("Creating a message template from Gen.ON", "Message received on WhatsApp").
- Un solo plano por video, sin cortes en la parte importante (de "Enviar" a "recibido"); sin
  audio está bien. MP4, 1080p, 1 a 3 minutos.
- Que se vea la URL de la app y el inicio de sesión al principio.
- No mostrar el token ni la clave secreta de la app (el asistente los oculta, pero cuidado con
  las pestañas de Meta).

## 6. Texto para la solicitud (en inglés)

**whatsapp_business_messaging**

> Gen.ON is a patient follow-up platform for clinics and aesthetic centers. Clinics register
> patients with their documented consent and schedule WhatsApp template messages (appointment
> reminders, pre- and post-procedure instructions). Our backend sends these messages through the
> Cloud API from each clinic's own WhatsApp Business number, and receives delivery statuses and
> button replies by webhook so the clinic can follow up. The video shows a clinic user sending an
> approved template to a patient from Gen.ON and the message arriving in WhatsApp.

**whatsapp_business_management**

> Clinics write their message templates in Gen.ON; a health professional validates the text and
> Gen.ON submits it to the clinic's WhatsApp Business Account through the API, then keeps its
> review status in sync (and reads phone number and account details during onboarding). The
> video shows a template being created in Gen.ON, appearing in WhatsApp Manager, and its
> approval status synchronized back.
