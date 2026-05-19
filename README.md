# Meridian Software

Landing page, panel administrativo interno y backend serverless de **Meridian Software**. Tres superficies sobre un mismo proyecto de Firebase:

- **Landing** (`index.html`) — sitio público en [meridian-software.com](https://www.meridian-software.com) con autenticación Google/Apple, formularios de contacto y demo, gating de acceso a productos.
- **Admin** (`admin.html`, ruta `/admin`) — panel interno gateado por custom claim `admin == true`. Gestiona leads (contactos + solicitudes de demo) y usuarios (acceso a demos por producto, roles de admin).
- **Cloud Functions** (`functions/`) — validación de reCAPTCHA, callable `setAdminClaim`, y suite completa de facturación electrónica AFIP para Stock Manager.

## Stack

- **Frontend**: JavaScript vanilla (sin framework, sin TypeScript), Vite 8, GSAP 3 para animaciones
- **Firebase**: Auth, Firestore, App Check (reCAPTCHA Enterprise), Analytics, Hosting, Cloud Functions
- **Estilo CSS**: tokens en `src/styles/variables.css`, modules por sección, dark theme

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

> ⚠️ **No buildear sin `.env`.** Vite no podrá sustituir las variables, los placeholders quedarán en el bundle, y [`FirebaseConfig.js`](src/config/FirebaseConfig.js) tira un error al inicializarse que rompe el bootstrap entero (la página queda en blanco). Si `vite build` imprime un warning sobre `%VITE_*%` no definido, abortar.

## Comandos

```bash
npm run dev              # dev server con HMR (http://localhost:5173)
npm run build            # producción → dist/
npm run preview          # servir dist/ localmente para sanity check
npx firebase deploy --only hosting   # deploy del frontend
npx firebase deploy                  # deploy completo (hosting + functions + firestore rules)
```

## Estructura

```
.
├── index.html                  # entry de la landing
├── admin.html                  # entry del panel admin
├── public/                     # assets estáticos (logo, favicons, /privacy, /terms)
├── src/
│   ├── main.js                 # bootstrap landing
│   ├── components/             # secciones de la landing
│   ├── admin/
│   │   ├── main.js             # bootstrap admin
│   │   ├── components/         # AdminGate, AdminShell, LeadsTab, UsersTab
│   │   ├── services/           # AdminService (callable wrappers)
│   │   └── styles/admin.css    # sistema visual del admin (sidebar + topbar dashboard)
│   ├── config/FirebaseConfig.js
│   ├── services/               # AuthenticationService, DemoAccessService, etc.
│   ├── styles/                 # variables, reset, módulos CSS por sección
│   └── utils/
├── functions/                  # Cloud Functions (Node)
├── firestore.rules             # rules compartidas con StockManager y Medicus
├── firebase.json               # hosting + functions + rewrites + headers
└── vite.config.js              # multi-entry: index.html + admin.html
```

## Admin

- Acceso: https://www.meridian-software.com/admin
- Gateo: requiere claim `admin == true` en el ID token (set vía Firebase Admin SDK, no editable desde el cliente).
- Otorgar admin la primera vez: usar [`functions/scripts/grant-first-admin.mjs`](functions/scripts/grant-first-admin.mjs) con un service-account.json. Subsecuentes admins se otorgan desde el panel mismo (tab Usuarios).
- Layout: sidebar (260px) + topbar + master-detail. No usa modal-style cards.

## Demo gating

Tres apps comparten un único proyecto de Firebase y la misma colección `users/{uid}`. Stock Manager y Medicus **no** crean cuentas — el registro pasa solo por meridian-software.com. El acceso a cada producto se gateá vía `users/{uid}/demoAccess/{productId}`:

- `productId` ∈ `{'stock-manager', 'medicus'}`
- Demos self-service de 7 días, con cap en las firestore rules.
- Admins pueden extender / revocar / re-otorgar desde el panel; cap del UI = 7 días. Vía Firebase Admin SDK no hay cap.
- Las rules viven en este repo (`firestore.rules`) y los repos hermanos (`StockManager/firebase.json`, `Medicus/firebase.json`) las referencian con `../MeridianSoftware/firestore.rules`.

## Cloud Functions

- `validateDemoRecaptcha` — filtra demoRequests por score de reCAPTCHA Enterprise.
- `setAdminClaim` — callable, solo para admins existentes.
- Suite AFIP — facturación electrónica para Stock Manager, usa `@afipsdk/afip.js` y el Firebase Secret `AFIPSDK_ACCESS_TOKEN`.

```bash
cd functions && npm run deploy   # deploy solo de functions
```

## Deploy operacional

- Deploy del frontend Meridian: `npx firebase deploy --only hosting` desde este repo.
- Deploy combinado de los tres sitios (Meridian + Stock Manager + Medicus): se hace desde el repo de Stock Manager con `npm run deploy`, que builds + copia los `dist/` de cada app dentro de `MeridianSoftware/dist/<target>/` y deploya todo junto.
- Rollback de Firebase Hosting: vía consola web (Hosting → Release history → Rollback) o vía REST API si la consola no es opción.

## Convenciones

- Commits en inglés, con descripción de **why** sobre **what** (un PR no se entiende solo del título — el cuerpo debe explicar la motivación).
- No commitear `dist/`, `node_modules/`, `.env*`, `service-account.json` (todos ignorados).
- Antes de un deploy de hosting: rebuildar limpio (`rm -rf dist && npm run build`), grep contra placeholders en `dist/`, y luego deploy.

## Licencia

Privado.
