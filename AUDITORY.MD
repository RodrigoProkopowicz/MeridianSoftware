# Auditoría de integridad estructural — Meridian Software

**Fecha:** 2026-05-29
**Alcance:** repositorio `MeridianSoftware` (landing + `/promo` + `/cuenta` + `/admin`, Cloud Functions, Firestore rules compartidas con StockManager y Medicus).
**Método:** lectura directa de la columna de seguridad (`firestore.rules`, `functions/promotional/`), barridos paralelos de XSS y de consistencia/dead-code sobre `src/` (61 JS / 20 CSS / ~7k LOC) y `functions/` (9 archivos / ~1.8k LOC), más verificación de tooling (tests, CI, lint, secretos).
**Naturaleza:** análisis read-only. No se modificó código de la app.

---

## 1. Veredicto

**Base sólida, con una brecha de madurez desproporcionada a su perfil de riesgo.**

La **seguridad** y la **arquitectura** están bien: las reglas de Firestore son rigurosas, la higiene anti-XSS es excelente y los internals de pago viven solo del lado del servidor. Lo que falta es la **red de contención**: cero tests, cero CI, cero lint, y un flujo de pago con dinero real que nunca se ejecutó end-to-end. A eso se suma **deuda de consistencia** acumulada (modelo de admin dual, drift de configuración, dead code) y un **problema operativo en vivo** (las apps hermanas `/stock-manager` y `/medicus` devuelven 404 en producción).

| Dimensión | Estado |
|---|---|
| Seguridad (rules, App Check, pagos, secretos, XSS) | 🟢 Fuerte |
| Arquitectura / patrón de módulos | 🟢 Coherente |
| Manejo de errores (capa UI) | 🟢 Uniforme |
| Manejo de errores (capa de servicios) | 🟡 Inconsistente |
| Consistencia / duplicación / dead code | 🟡 Deuda acumulada |
| Modelo de autorización admin | 🟠 Dual e inconsistente |
| Testing / CI / tooling | 🔴 Ausente |
| Build / deploy (acople 3 apps) | 🟠 Frágil; apps hermanas caídas |
| Contenido de producción | 🟡 Placeholders en vivo |

---

## 2. Fortalezas (lo que está bien hecho)

- **Reglas de Firestore rigurosas** (`firestore.rules`): whitelisting de campos por colección (`hasOnly`), límite de payload por cantidad de campos, inmutabilidad parcial donde corresponde (facturas, movimientos, historia clínica con soft-delete y revisiones inmutables — Ley 26.529), `secrets/` accesible solo vía Functions, y **default-deny** final (`match /{document=**} { allow read, write: if false; }`).
- **Internals de pago server-side only**: el cliente **no puede** crear `promotionalSubscriptions` (`allow create: if false`, líneas 137); el access token de MP vive solo en Secret Manager; el admin solo puede editar `workStatus`/`adminNotes` vía rules, nunca los campos de pago.
- **Webhook de MP defensivo** (`functions/promotional/index.js:133`): idempotencia por `x-request-id` (colección `promoWebhookEvents`), y **nunca confía en el body** — siempre re-consulta el recurso contra la API de MP con el token propio. En error libera el evento y responde 500 para que MP reintente.
- **App Check** forzado en todos los callables sensibles (`createPromotionalPreapproval`, `listMyProducts`, `cancel`, `updateAmount`, `deleteUser`).
- **Higiene anti-XSS excelente**: un solo tipo de sink (`innerHTML`), y **todo** valor controlable por usuario/remoto (`displayName`, `email`, `photoURL`, campos de Firestore, datos derivados de MP, mensajes de error, valores prellenados) pasa por un `escapeHtml()` correcto (`src/utils/DomHelper.js:115`). No se encontró ningún vector HIGH/MED.
- **Secretos fuera de git**: `.gitignore` cubre `.env*`, `dist/`, `**/service-account.json`, `*.log`. Verificado: `service-account.json` **no** está trackeado.
- **Patrón de módulos coherente** en las 4 superficies (`render*()`/`init*()` + `services/` + `styles/` + `main.js`).
- **Comentarios "por qué" bilingües** de alta calidad que documentan decisiones no obvias.

---

## 3. Hallazgos por severidad

### 🔴 Altos (atacar primero)

**A1 — Cero tests automatizados en una plataforma de dinero real + datos médicos + facturación.**
No hay `*.test.js`, ni vitest/jest, ni `@firebase/rules-unit-testing`. Las `firestore.rules` (376 líneas, backbone de seguridad de **3 apps**) no tienen una sola prueba; un cambio puede abrir acceso entre clientes sin que nada lo detecte. El flujo de pago de MP tampoco tiene cobertura. Para este perfil de riesgo, es el gap estructural #1.

**A2 — El flujo de pago de Mercado Pago nunca se ejecutó end-to-end.**
(login → form → checkout MP → webhook → estado "Activa" → cancelación). Está deployado y App Check confirmado, pero el round-trip real con dinero sigue sin validarse. Es la ruta de ingresos del producto y hoy es código no verificado.

**A3 — Las apps hermanas están caídas en producción.**
`https://www.meridian-software.com/stock-manager/` y `/medicus/` devuelven **404** ahora mismo. El `dist/` local no contiene esos subdirectorios y Firebase Hosting reemplaza el sitio entero en cada deploy, por lo que **un deploy de Meridian standalone borra silenciosamente las apps hermanas**. El deploy combinado correcto vive en el repo de StockManager (`npm run deploy` → `scripts/deploy-into-meridian.mjs`). Riesgo estructural: cualquiera que corra `firebase deploy --only hosting` desde acá vuelve a tirar abajo `/stock-manager` y `/medicus`.

### 🟠 Medios-altos

**M1 — Modelo de autorización admin dual e inconsistente.**
Existen **tres** campos relacionados: el custom claim `admin`, el espejo `users/{uid}.admin` (solo para mostrar el badge), y `users/{uid}.role == 'admin'`.
- `firestore.rules` `isAdmin()` (líneas 46–51) acepta **claim OR role** — es el **único** lugar que honra `role` (~40 call sites).
- **Todo el resto trusta solo el claim**: cliente (`AdminService.js:62`, `UserProfileBadge.js:52`, `AdminGate.js:61`, `UsersTab.js:192`) y servidor (`functions/index.js:154,197`, `functions/promotional/index.js:218,321`).
- **Consecuencia:** un usuario promovido solo con `set-admin-role.mjs` (`role='admin'`) pasa **todas** las reglas de Firestore pero **falla** todos los callables y el panel `/admin`. Queda medio-privilegiado. La propia regla lo marca como transitorio ("mientras se unifica el modelo", línea 38); la unificación nunca pasó.

**M2 — Webhook fail-open ante secreto ausente.**
`verifySignature()` (`functions/promotional/index.js:454`) devuelve `true` si `MP_WEBHOOK_SECRET` no está seteado (`if (!secret) return true`) o si falta el header de firma. Mitigado por la re-consulta a MP (no se puede forjar un estado), pero la verificación de firma es bypasseable si el secreto no está configurado. Debería fallar-cerrado en producción.

### 🟡 Medios

**M3 — Drift de configuración: el precio vive en ~6 lugares.**
`PLAN.amount = 6499` coincide entre `functions/promotional/config.js:29` y `src/PromotionalSection/config.js:11`, **pero** además está hardcodeado en `PromotionalTab.js:201,227,346` (`?? 6499`), `PromoFAQ.js:11` (`'$6.499'`), `PromoPricing.js:4` (comentario) y `account/utils/format.js:23` (comentario). Si cambia el precio, hay que tocar 6 puntos.

**M4 — Constantes duplicadas verbatim entre los dos módulos de Functions.**
`SITE_KEY`, `PROJECT_ID` y `THRESHOLD (0.5)` están copiados en `functions/index.js:22-24` y `functions/promotional/config.js:43-45`. La site key de reCAPTCHA y el project id se mantienen a mano en dos lugares.

**M5 — Validación duplicada cliente ↔ servidor.**
El form de promo se valida en `src/PromotionalSection/utils/validators.js` y otra vez en `functions/promotional/index.js:402` (`validateAndClean`), con la **misma** regex de email en 3 archivos (`validators.js:8`, `ValidationHelper.js:14`, `functions/promotional/index.js:415`). Además `ValidationHelper.validateForm` y `validators.validateForm` tienen firmas divergentes (misma intención, contratos distintos).

**M6 — Contenido placeholder en producción.**
El landing está en vivo con datos ficticios marcados con TODO: `StatsBar.js:12` (métricas en 0 — "replace with real metrics before going live"), `TrustBarSection.js:15` (logos ficticios Northwind/Helix/Kepler/…), `CaseStudiesSection.js:13` y `TestimonialsSection.js:11` (casos y testimonios inventados). Social proof falso en un sitio comercial vivo.

**M7 — README desactualizado.**
[README.md](README.md) describe solo 3 superficies / 2 entries y **no menciona** `/promo`, `/cuenta` ni toda la suite de Mercado Pago. La documentación del repo miente sobre su propia arquitectura.

**M8 — Sin CI/CD ni linter/formatter.**
No hay `.github/workflows`, ni eslint, ni prettier. Deploys 100% manuales desde local; la única red de seguridad pre-deploy son los greps de placeholders documentados en memoria. El dead code y los drifts de arriba existen en parte por falta de lint.

### 🟢 Bajos / cosméticos

- **B1 — Dead code.** `FirestoreService.js` (4 de 5 exports sin uso — la abstracción CRUD genérica está muerta; todos usan el SDK directo), helpers sin importar en `DomHelper.js` (`querySelector`, `createElement`, `setHTML`…), `ValidationHelper.validateField`/`clearFormErrors`, `ScrollAnimationController.js:115` (re-export muerto de gsap + `prefersReducedMotion` + `destroyAllAnimations`), `AdminGate.refreshGate`, `AdminService.getUserProfile`, `validators.isValidPhone`, `config.CONTACT_WHATSAPP`.
- **B2 — `DEMO_PRODUCTS` colisiona**: exportado con **formas distintas** en `DemoAccessService.js:32` (objeto) vs `AdminService.js:34` (array), más copias server (`DEMO_LABELS`/`DEMO_URLS`). La lista `stock-manager`/`medicus` aparece en 4+ lugares + las rules.
- **B3 — Inconsistencia de casing/estructura**: `admin/utils/Format.js` (PascalCase) vs `account/utils/format.js` (lowercase); directorio `src/PromotionalSection/` (PascalCase) vs `src/admin`, `src/account` (lowercase). Tres módulos de formato date/money casi idénticos.
- **B4 — Async sin guard**: `signOut()` (`AuthenticationService.js:73`) es un `await` pelado invocado como fire-and-forget en ~6 click handlers sin `.catch` → unhandled rejection si falla. `DeviceScene.js` tiene un `await` sin try/catch en el render path.
- **B5 — Capa de servicios sin convención de errores**: unos tiran (`AdminService`, `AccountService`, `FirestoreService`, `DemoAccessService` — 0 try/catch, dependen del caller), otros tragan (`AnalyticsService`, `RecaptchaService`, `createOrUpdateUserProfile`). Funciona, pero el contrato no es uniforme.
- **B6 — Cruft**: worktree stale `.claude/worktrees/nostalgic-varahamihira-9fc505/` (2.8M, copia vieja del árbol).
- **B7 — `firestore.indexes.json` ausente**: los índices compuestos no están versionados (hoy solo se usan queries de campo único, así que el impacto es nulo, pero es drift potencial).
- **B8 — XSS defense-in-depth (no explotable)**: atributos `class="admin-pill--${x}"` sin comillas en `LeadsTab.js:117,120` y `PromotionalTab.js:162-163`; los valores hoy son escapados o vienen de whitelists, pero el patrón es frágil (`escapeHtml` no escapa espacios).

---

## 4. Mejoras propuestas (roadmap priorizado)

### Ahora (cierra los riesgos altos)
1. **Tests de reglas de Firestore** con `@firebase/rules-unit-testing`: casos de aislamiento entre owners, gating de admin, inmutabilidad de HC/facturas, y que `secrets/` y `promotionalSubscriptions` create estén cerrados. Es el mayor ROI de seguridad. (A1)
2. **Probar el pago de MP end-to-end** una vez, con monto válido (≥ mínimo), y documentar el resultado. Desbloquea la confianza en la ruta de ingresos. (A2)
3. **Arreglar el acople de deploy**: o restaurar `/stock-manager` + `/medicus` con el deploy combinado desde StockManager, o agregar un guard que aborte `firebase deploy` si `dist/stock-manager` y `dist/medicus` no existen, para no volver a tirarlas. (A3)

### Próximo (consistencia y hardening)
4. **Unificar el modelo de admin**: elegir el custom claim `admin` como única fuente de verdad, migrar los `role=='admin'` restantes a claim, y sacar la rama `role` de `isAdmin()` en las rules. (M1)
5. **Fail-closed en el webhook** cuando `MP_WEBHOOK_SECRET` esté seteado pero la firma no valide; en producción, exigir el secreto. (M2)
6. **Una sola fuente de verdad para el precio**: que el front lea el monto desde el callable/Firestore en vez de hardcodearlo, y borrar los ~5 literales. (M3, M4, M5)
7. **Actualizar el README** a las 4 superficies + suite de MP. (M7)
8. **Decidir sobre el contenido placeholder** (M6): contenido real o quitar las secciones antes de promocionar el sitio.

### Cuando haya aire (madurez)
9. **CI mínimo** (GitHub Actions): `npm run build` + los greps de placeholders + tests de rules en cada push; idealmente deploy desde CI en vez de local. (M8)
10. **ESLint + Prettier**: `no-unused-vars` solo barre el dead code de B1/B2; formato consistente elimina B3.
11. **Limpieza**: borrar dead code (B1), unificar `DEMO_PRODUCTS` y los módulos de formato (B2/B3), guardar `signOut()`/`DeviceScene` (B4), fijar convención de errores de servicios (B5), borrar el worktree stale (B6), comillar los atributos `class` dinámicos (B8).

---

## 5. Resumen de una línea

Cimientos de seguridad y arquitectura **sólidos**; lo que falta no es código mejor, sino **red de contención** (tests, CI), **unificar** las dos cosas que quedaron a mitad de camino (admin dual, deploy de 3 apps) y **terminar** lo que está marcado como provisorio (placeholders, README, drift de precio).
