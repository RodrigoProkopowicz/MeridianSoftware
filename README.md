# Meridian Software

Landing, secciones de cuenta/ventas y backend serverless de **Meridian Software**. Es un **build multi-página de Vite con 4 entries** sobre un único proyecto de Firebase (Auth + Firestore + App Check + Functions + Hosting):

- **Landing** (`index.html` → `src/main.js`) — sitio público en [meridian-software.com](https://www.meridian-software.com): login por **email + contraseña** (las cuentas las crea un admin; no hay auto-registro), formulario de contacto y **formulario público de solicitud de prueba gratuita**, y gating de acceso a los productos in-house.
- **/promo** (`promo.html` → `src/PromotionalSection/`) — vende webs mensuales a comercios locales vía **suscripciones de Mercado Pago** (preapproval). Cuenta regresiva, logos de clientes.
- **/cuenta** (`cuenta.html` → `src/account/`) — "Mis Productos": el usuario logueado (con la cuenta que le creó el admin) ve sus webs (suscripciones) y demos, y puede **auto-cancelar** suscripciones pagas. Lee vía un callable saneado (`listMyProducts`), no Firestore directo.
- **/admin** (`admin.html` → `src/admin/`) — panel interno gateado por custom claim `admin == true`. Tabs: **Pedidos** (contactos + solicitudes de prueba del formulario público, con acción "crear cuenta desde el pedido"), **Usuarios** (crear usuarios, grant/revoke admin, borrar usuarios, demos por producto) y **Promocional** (gestión de suscripciones + precio por cliente).
- **Cloud Functions** (`functions/`) — reCAPTCHA, gestión de admins/usuarios, la suite de facturación AFIP (Stock Manager) y la suite de pagos de Mercado Pago (`functions/promotional/`).

## Stack

- **Frontend**: JavaScript vanilla (sin framework, sin TypeScript, sin router), Vite 8, GSAP 3 para animaciones.
- **Firebase**: Auth, Firestore, App Check (reCAPTCHA Enterprise), Analytics, Hosting, Cloud Functions (Node 22).
- **Pagos**: Mercado Pago (preapproval / suscripciones) — ver [/promo](#promo--suscripciones-mercado-pago).
- **Estilo CSS**: tokens en `src/styles/variables.css`, módulos por sección, dark theme.

## Setup local

```bash
git clone git@github.com:RodrigoProkopowicz/MeridianSoftware.git
cd MeridianSoftware
npm install
```

Copiar el `.env` con las credenciales reales de Firebase + reCAPTCHA al root del repo. Las variables requeridas:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=meridiansoftware-6ae75
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_RECAPTCHA_SITE_KEY=...
```

> ⚠️ **No buildear sin `.env`.** Vite no podrá sustituir las variables, los placeholders quedarán en el bundle, y [`FirebaseConfig.js`](src/config/FirebaseConfig.js) tira un error al inicializarse que rompe el bootstrap entero (la página queda en blanco). Si `vite build` imprime un warning sobre `%VITE_*%` no definido, abortar. El guard `npm run check:deploy` (ver abajo) atrapa esto automáticamente.

## Comandos

```bash
npm run dev              # dev server con HMR (http://localhost:5173)
npm run build            # producción → dist/
npm run preview          # servir dist/ localmente para sanity check
npm run check:deploy     # guard pre-deploy: placeholders, key real, apps hermanas
npx firebase deploy --only hosting   # deploy del frontend (corre check:deploy antes vía predeploy hook)
npx firebase deploy                  # deploy completo (hosting + functions + firestore rules)
```

`check:deploy` está cableado como `predeploy` hook de hosting en `firebase.json`, así que corre solo antes de cualquier `firebase deploy --only hosting`. Aborta si el bundle tiene placeholders sin sustituir o no tiene una API key real; avisa (sin abortar) si faltan las apps hermanas en `dist/`. Para exigir las apps hermanas: `node scripts/preflight-deploy.mjs --require-subapps`.

## Estructura

```
.
├── index.html                  # entry de la landing
├── promo.html                  # entry de /promo (suscripciones MP)
├── cuenta.html                 # entry de /cuenta (Mis Productos)
├── admin.html                  # entry del panel admin
├── public/                     # assets estáticos (logo, favicons, /privacy, /terms)
├── scripts/
│   └── preflight-deploy.mjs    # guard pre-deploy (check:deploy)
├── src/
│   ├── main.js                 # bootstrap landing
│   ├── components/             # secciones de la landing
│   ├── PromotionalSection/     # /promo: components/ services/ styles/ utils/ config.js main.js
│   ├── account/                # /cuenta: components/ services/ styles/ utils/ main.js
│   ├── admin/                  # /admin: components/ services/ styles/ utils/ main.js
│   ├── config/FirebaseConfig.js
│   ├── services/               # AuthenticationService, DemoAccessService, RecaptchaService, etc.
│   ├── styles/                 # variables, reset, módulos CSS por sección
│   └── utils/
├── functions/                  # Cloud Functions (Node 22)
│   ├── index.js                # reCAPTCHA, setAdminClaim, deleteUser + re-exports
│   ├── afip/                   # facturación electrónica AFIP (Stock Manager)
│   └── promotional/            # suite Mercado Pago (preapproval + webhook)
├── firestore.rules             # rules compartidas con StockManager y Medicus
├── firebase.json               # hosting + functions + rewrites + headers + predeploy guard
└── vite.config.js              # multi-entry: index + promo + cuenta + admin
```

## /promo — suscripciones Mercado Pago

Vende webs mensuales vía **preapproval** de Mercado Pago (suscripción sin plan asociado). Flujo: form gateado tras login → `createPromotionalPreapproval` (valida reCAPTCHA + App Check, guarda el lead en `promotionalSubscriptions`, crea la preapproval en MP, devuelve `init_point`) → el usuario paga en MP → `mercadoPagoWebhook` sincroniza el estado.

- **Secrets** (Firebase Secret Manager): `MP_ACCESS_TOKEN` (producción, `APP_USR-…`) y `MP_WEBHOOK_SECRET`. La función se debe **redeployar** tras setearlos.
- **Webhook**: `https://us-central1-meridiansoftware-6ae75.cloudfunctions.net/mercadoPagoWebhook`. `MP_WEBHOOK_SECRET` debe ser **exactamente** la "Clave secreta" que MP genera al configurar el webhook en su dashboard; si no coincide, el webhook rechaza las notificaciones reales con 401 y los estados nunca sincronizan. Es idempotente (dedupe por `x-request-id` en `promoWebhookEvents`) y **nunca confía en el body** — re-consulta el recurso contra la API de MP.
- **Precio**: el monto inicial vive en `functions/promotional/config.js` (`PLAN.amount`, fuente de verdad del cobro). El admin ajusta el precio por cliente desde la tab Promocional (`updatePromotionalAmount`).
- El access token de MP vive **solo** en el backend; el cliente nunca lo ve ni escribe en `promotionalSubscriptions` (las rules lo prohíben).

## /cuenta — Mis Productos

Dashboard de cuenta del usuario logueado. Lista sus webs (suscripciones) y sus demos activas/expiradas, y permite **cancelar** suscripciones pagas (baja self-service). Toda la data llega vía el callable `listMyProducts` (vista saneada — sin campos de pago sensibles), nunca por lectura directa de Firestore.

## Admin

- Acceso: https://www.meridian-software.com/admin
- Gateo: requiere el custom claim `admin == true` en el ID token (set vía Admin SDK, no editable desde el cliente). El claim se espeja en `users/{uid}.admin` solo para mostrar el badge en el panel.
- **Primer admin (email + contraseña):** [`functions/scripts/create-admin-user.mjs`](functions/scripts/create-admin-user.mjs) crea la cuenta, setea el claim y escribe el perfil. Con ADC (`gcloud auth application-default login`), desde `functions/`: `npm run create-admin -- --email you@example.com --password 'StrongPass' --name 'Tu Nombre'`. Después iniciás sesión en `/admin` y creás el resto desde el panel.
- Los siguientes usuarios/admins se crean desde el panel (tab **Usuarios** → "Crear usuario") vía el callable `createUser`; el rol admin también se otorga/revoca con `setAdminClaim`.
- Tabs: **Pedidos**, **Usuarios** (crear usuario, grant/revoke admin, borrar usuario, demos por producto), **Promocional** (suscripciones MP + precio por cliente).
- Layout: sidebar (260px) + topbar + master-detail.

## Demo gating

Tres apps comparten un único proyecto de Firebase y la misma colección `users/{uid}`. **Ninguna** app crea cuentas por auto-registro: las cuentas las crea un admin (callable `createUser`) desde el panel. El acceso a cada producto se gatea vía `users/{uid}/demoAccess/{productId}`:

- `productId` ∈ `{'stock-manager', 'medicus'}`
- El demo se **solicita** por el formulario público (`demoRequests`); un admin lo otorga desde el panel (o al crear la cuenta con `createUser`). Ya **no** hay auto-servicio: `demoAccess` create/update/delete es admin-only en las rules.
- Admins pueden otorgar / extender / revocar desde el panel; cap del UI = 7 días (ajustable). Vía Admin SDK no hay cap.
- Las rules viven en este repo (`firestore.rules`) y los repos hermanos (`StockManager/firebase.json`, `Medicus/firebase.json`) las referencian con `../MeridianSoftware/firestore.rules`.

## Cloud Functions

- `validateDemoRecaptcha` — filtra `demoRequests` por score de reCAPTCHA Enterprise.
- `createUser` — callable admin (App Check): crea la cuenta de Auth (email + contraseña), escribe el perfil `users/{uid}`, y opcionalmente otorga claim admin y accesos demo. Es la única vía de alta de usuarios.
- `setAdminClaim` — callable, solo para admins existentes; setea/revoca el claim `admin`.
- `deleteUser` — callable admin (App Check): borra cuenta de Auth + doc `users/{uid}` + subcolección `demoAccess`.
- **Suite AFIP** (`functions/afip/`) — facturación electrónica para Stock Manager (`@afipsdk/afip.js`, Secret `AFIPSDK_ACCESS_TOKEN`).
- **Suite promocional** (`functions/promotional/`) — Mercado Pago: `createPromotionalPreapproval`, `mercadoPagoWebhook`, `cancelPromotionalSubscription` (admin o dueño), `updatePromotionalAmount`, `listMyProducts`. Los callables de pago exigen App Check.

```bash
cd functions && npm run deploy   # deploy solo de functions
```

## Deploy operacional

- Deploy del frontend Meridian: `npx firebase deploy --only hosting` desde este repo. El `predeploy` hook corre `check:deploy` automáticamente.
- **Deploy combinado de los 3 sitios** (Meridian + Stock Manager + Medicus): se hace desde el repo de Stock Manager con `npm run deploy`, que buildea + copia los `dist/` de cada app dentro de `MeridianSoftware/dist/<target>/` y deploya todo junto. ⚠️ Un `firebase deploy --only hosting` desde acá con un `dist/` que **no** tiene `stock-manager/` ni `medicus/` deja esas apps en 404 (Hosting reemplaza el sitio entero). El guard avisa de esto.
- Rollback de Firebase Hosting: vía consola web (Hosting → Release history → Rollback) o vía REST API.

## Convenciones

- Commits en inglés, con descripción de **why** sobre **what** (el cuerpo debe explicar la motivación, no solo el qué).
- No commitear `dist/`, `node_modules/`, `.env*`, `service-account.json` (todos ignorados).
- Antes de un deploy de hosting: rebuildar limpio (`rm -rf dist && npm run build`) y dejar que `check:deploy` valide el bundle (corre solo vía el predeploy hook).

## Licencia

Privado.
