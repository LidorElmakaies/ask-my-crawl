# Admin Dashboard: User Management + Gated Grafana/Kafka UI Proxy

> **Handoff doc** — written to be executed by a fresh agent with none of the conversation history
> that produced it. Read the "Onboarding" section first, then the plan. Everything you need is
> below or in the files it points at; nothing here assumes you remember a prior conversation.

## Onboarding — read before touching anything

This is the **askmycrawl** repo. Read, in order:
1. `CLAUDE.md` (repo root) — current project state.
2. `.claude/agents/frontend.md` in full — the frontend persona/conventions this plan follows.
3. `.claude/agents/devops.md` in full — the devops persona/conventions this plan follows
   (particularly relevant: how `devops/*.yml` files are structured today — they were split into
   `devops/<unit>/docker-compose.yml` + a root `include:` file + a shared `devops/common.yml` via
   `extends:`, in a session shortly before this plan was written; don't reintroduce a single
   monolithic `devops/docker-compose.yml`).
4. `docs/specs/backend-architecture.md` — the clean-architecture layering every NestJS service
   (including Gateway) follows; read the "Applies beyond HTTP services too" and multi-concern-app
   sections specifically.
5. `docs/specs/api-contracts.md` and `docs/specs/auth.md` — the existing `/admin/users*` API and
   token model this plan builds on.
6. `frontend/CLAUDE.md` — existing frontend stack/structure/theme system.

## What the user wants (their own words, lightly cleaned up)

> Work with the frontend agent and make a page for admin role only where they can get proxy to
> Grafana and Kafka UI. An admin dashboard page — go to Grafana or see all of Grafana's stuff, and
> Kafka UI's stuff, and in the future use the admin dashboard for managing the database and its
> storage capacity, and users — configure/change them as needed or remove them (user management
> page). For now: only user management page, Kafka UI, and Grafana.

So: **three things now** (user management; admin-only reachability into Grafana; admin-only
reachability into Kafka UI), **one thing explicitly deferred** (database/storage management — don't
build it, but don't design anything that blocks adding a 4th tile for it later).

## Why this is more than "add two links"

Grafana and Kafka UI are full multi-asset SPAs (dozens of JS/CSS/API requests each), not a single
JSON endpoint — the existing `auth-proxy/` pattern (forward one JSON request, relay one JSON
response) doesn't fit; this needs a genuine streaming reverse proxy. And the thing that will display
them (a `WebView` navigating to a URL) **cannot attach a custom `Authorization` header** the way this
app's `fetch()` calls do — so the existing Bearer-token auth model doesn't reach a route addressed by
raw URL navigation. Solving that cleanly is the crux of the backend half of this plan.

## Already-verified facts — treat as ground truth, don't re-derive

Gathered and verified this pass (file reads + official-docs research) — re-verify only if something
here looks stale by the time this is executed.

**Gateway (`backend/apps/gateway`)**
- `main.ts` bootstraps via `NestFactory.create(GatewayModule)` with no explicit adapter → Express
  under the hood (`@nestjs/platform-express` is a dependency). `app.use(...)` Express middleware is
  already used there (line 15, request logging) and confirmed to work, running *before* Nest's own
  routing/guards. CORS: `app.enableCors({ origin: true })`. **Do not edit `main.ts` for this
  feature** — its import order is load-bearing for OTel init (`startOtel()` must be the literal first
  statement) and its SIGTERM/SIGINT shutdown wiring is easy to break by touching it unnecessarily;
  everything below is achievable via a new Nest module instead.
- `gateway.module.ts`: multi-concern app (per `backend-architecture.md`), imports `RealtimeModule` +
  `AuthProxyModule`, owns no providers itself. `tokens.ts` holds DI tokens grouped by concern with a
  header comment.
- Existing proxy pattern, `auth-proxy/` (`backend/apps/gateway/src/auth-proxy/`): one
  `@nestjs/axios` `HttpService` call per route, controllers guarded with
  `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')` from `@app/auth-kernel`. **This pattern
  does NOT apply to Grafana/Kafka UI** (single JSON request/response only) — noted here so it isn't
  mistakenly copied for this feature.
- `@app/auth-kernel` JWT verification: **no standalone exported verify function exists** — only
  DI-resolvable services. `IJwtService.verify(token): JwtPayload | null` (sync, `{sub, role}}`,
  token `JWT_SERVICE`) or `IAuthTokenService.verify(token): Promise<AuthTokenPayload|null>` (async,
  reshaped to `{userId, role}`, token `AUTH_TOKEN_SERVICE`) — both provided by `AuthKernelModule`.
  `UserRole = 'admin' | 'user'`. Secret via `ConfigService.get('JWT_SECRET')`, HS256
  (`jsonwebtoken` lib). Use `AUTH_TOKEN_SERVICE` via normal constructor injection in a new
  `@Injectable()` Nest middleware class (see plan below) — don't reach into `jsonwebtoken` directly,
  that's restricted by convention to `JsonWebTokenService`.
- `backend/package.json` has `@nestjs/axios`, `axios`, `jsonwebtoken`, `@nestjs/platform-express`,
  **`@types/express: ^5.0.0` (Express 5)** — no `http-proxy-middleware` yet. Express 5 changed its
  wildcard route syntax (path-to-regexp v6+, bare `*` no longer valid alone) — **verify the actual
  working wildcard/sub-path route-matching syntax during implementation**, don't assume old Express
  4 patterns.
- `backend/apps/gateway/Dockerfile`: multi-stage; `npm install` in both stages picks up a new
  runtime dependency automatically, **no Dockerfile change needed** for adding
  `http-proxy-middleware`. `npm run build:gateway` = `build:libs && nest build gateway && tsc-alias`;
  only relevant if a *new shared lib* were added under `backend/libs/` (this plan doesn't need one —
  everything lives inside `apps/gateway`).

**Devops / target services** (both compose files already restructured this session into
`devops/<unit>/docker-compose.yml`, pulled in via the root `devops/docker-compose.yml`'s `include:`,
with shared `restart`/`logging` factored into `devops/common.yml` via `extends:` — follow that
existing style for any edit, don't reintroduce a monolithic file)
- `kafka-ui`: `devops/kafka/docker-compose.yml`, service name `kafka-ui`, container port `8080`
  (currently ALSO published to host as `8080:8080`), network `askmycrawl`. Image
  `ghcr.io/kafbat/kafka-ui:v1.5.0` (Spring Boot app). No auth configured today (open access).
  Gateway is already on `askmycrawl` — no new network wiring needed to reach `http://kafka-ui:8080`.
- `grafana`: `devops/observability/docker-compose.yml`, service name `grafana`, container port
  `3000` (currently published to host as `3001:3000`), network `observability`. Image
  `grafana/grafana:13.2.0`. Current env: `GF_AUTH_ANONYMOUS_ENABLED=true`,
  `GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer`, `GF_AUTH_DISABLE_LOGIN_FORM=false`,
  `GF_SECURITY_ADMIN_USER=admin`, `GF_SECURITY_ADMIN_PASSWORD=admin` — **Grafana already permits
  anonymous Viewer access**, so once a request passes our own Gateway-level admin gate, Grafana
  needs no further identity-trust mechanism (no need to implement Grafana's `[auth.proxy]`
  header-trust feature) — it'll just render as an anonymous Viewer. Gateway is already on
  `observability` (joined for OTel) — no new network wiring needed to reach `http://grafana:3000`.

**Reverse-proxy config, verified against official docs**
- Grafana needs to know its own mount path or its rendered asset/API links break: set
  `GF_SERVER_ROOT_URL=http://localhost:8000/admin/grafana/` and
  `GF_SERVER_SERVE_FROM_SUB_PATH=true`. With these set, Grafana *expects to receive* requests with
  the `/admin/grafana` prefix still attached — **don't strip the prefix when proxying**.
- Kafka UI (Spring Boot) supports `SERVER_SERVLET_CONTEXT_PATH=/admin/kafka-ui` for the same
  purpose (confirmed via kafbat's own example compose file, `documentation/compose/auth-context.yaml`
  in their GitHub repo). **Real, unconfirmed risk**: a historical GitHub issue on the predecessor
  project (`provectus/kafka-ui#2346`) reported the frontend's own client-side routing *ignoring*
  this exact setting after a refactor. Unknown whether kafbat `v1.5.0` still has this bug — **must be
  smoke-tested live** after deploying; if it reproduces (blank page / broken routing), the fallback
  is proxy-side path handling instead of relying on kafka-ui's own context-path awareness.
- Grafana blocks iframe embedding by default (`X-Frame-Options: deny`; toggle is
  `GF_SECURITY_ALLOW_EMBEDDING=true`). **This plan deliberately renders Grafana full-screen, never
  framed — so this setting is NOT needed and should NOT be added.** (Rationale below.)

**Frontend (`frontend/`, Expo Router + Redux Toolkit)**
- `app/(tabs)/_layout.js`: hardcoded `TABS` array drives both `<Tabs.Screen>` registration and the
  custom tab bar; currently `index`, `scraper`, `settings`.
- `app/_layout.js`'s `AuthGate` gates all of `(tabs)` behind a valid session (token presence + not
  expired) — but that's session gating, not role gating. `.claude/agents/frontend.md` explicitly
  requires role-gating any admin screen on the decoded role claim too: *"gate these on the decoded
  JWT's role claim, not just on hiding a tab (a hidden tab is not access control; the backend
  enforces the real boundary)."*
- `authSlice.user` already holds `{ id, email, name, role, phone_number, telegram_chat_id }` from
  login/register — `role` is directly available in Redux state, no JWT decoding needed for it.
  `src/utils/jwt.js` only decodes `exp` for expiry checks.
- Services-layer convention (strict, see `frontend/CLAUDE.md` "Services Layer"): all I/O in
  `src/services/*.js` (plain functions, no Redux) → called only from thunks in
  `src/store/slices/*.js` → components only `dispatch()`/`useSelector()`.
- **No existing authenticated-fetch pattern anywhere in the codebase yet** — neither
  `authService.js` (register/login don't need a token) nor `scraperService.js` sends an
  `Authorization` header today. This feature's admin API calls will be the first. Build one small
  reusable helper rather than duplicating header-attachment logic (see plan below) — per
  frontend.md's "build for reuse" rule, and because more authenticated calls will likely follow this
  feature.
- `src/config/urls.js`: flat `{ base, gateway: {...}, auth: {...} }` shape, all pointing at the
  Gateway's own origin (`http://localhost:8000`) — a new `admin: {...}` entry follows this shape.
- `src/services/apiError.js`'s `parseErrorMessage(response)` is reusable for the new admin service.
- Reusable components available: `GlowCard`, `GradientButton`, `InputField`, `SpaceBackground`,
  `ConnectionStatus`, `ThemeProvider` (`src/components/`) — check fit before inventing new ones.
  Theming is always via `useAppTheme()` (`{ isDark, colors, colorMode }`), never hardcoded colors.
- **`react-native-webview` is not a dependency yet** — needed to actually display Grafana/Kafka UI
  inside the app. Add via `npx expo install react-native-webview` (Expo's own resolution command,
  not a hand-edited `package.json` — this project's frontend persona is strict about following
  Expo's own tooling, see `.claude/agents/frontend.md`'s Expo-57 warning).
- Access token TTL is **15 minutes** (`docs/specs/auth.md`) — relevant to the proxy-session cookie's
  `maxAge` below.
- A seeded admin account exists for testing: `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars
  (`backend/.env`), auto-promoted/created on Auth Service boot (`AdminSeedService`).

## Decisions made, with reasoning (don't re-litigate without new information)

1. **Full-screen WebView per tool, not an embedded iframe pane inside the dashboard.** Avoids
   needing `GF_SECURITY_ALLOW_EMBEDDING` at all (nothing is framing anything), gives Grafana the
   real screen space it needs to be usable, and needs only one generic reusable WebView screen
   (`url`/`title` params) instead of iframe-sizing/scrolling work squeezed into a dashboard layout.
2. **Gateway-level gate via query-param token (first request) upgrading to an httpOnly cookie
   (every request after), not header-based auth.** A WebView navigation can't carry a custom
   `Authorization` header the way `fetch()` does, and neither can the SPA's own subsequent
   sub-resource requests once loaded (Grafana's own JS knows nothing about our JWT). Query-param
   token on the very first navigation → verified once → Gateway sets a same-origin, `httpOnly`,
   `sameSite: 'lax'` cookie scoped to `path: '/admin'` → every later request (including the proxied
   app's own asset/API calls, since they're same-origin through the Gateway) carries it
   automatically, no cookie-parser dependency needed (Express's `res.cookie()` is built in; reading
   the one known cookie name back out is a few lines, not worth a dependency). Stateless — the
   cookie just holds the same JWT, re-verified each time, no server-side session store.
   **Known, accepted tradeoff**: a short-lived (≤15 min) token briefly appears in a URL/server log —
   consistent with this project's existing dev-phase risk posture (CORS wide open, Kafka plaintext,
   etc.), not a production-grade pattern. Flag, don't silently "fix" beyond this project's current
   phase.
3. **Neither Grafana's `[auth.proxy]` header-trust mode nor Kafka UI's `LOGIN_FORM`/OAuth auth are
   needed.** Both tools already permit open/anonymous access today — the Gateway's own gate (above)
   is the only access control that matters for "can a non-admin app user reach these through the
   Admin Dashboard." Implementing either tool's own auth integration would be unnecessary complexity
   on top of an already-sufficient design.
4. **Direct host port publishes for Grafana (`3001:3000`) and Kafka UI (`8080:8080`) are removed.**
   Decided explicitly (asked and confirmed) — without this, the Gateway gate would be bypassable by
   anyone who can reach the host directly, making "admin-only" an in-app convenience rather than a
   real boundary. This does mean losing direct `localhost:3001`/`:8080` access for local debugging —
   accepted tradeoff for a real access boundary.

## Plan

### Backend — Gateway: new `tool-proxy` concern module

New self-contained module, sibling to `auth-proxy/`/`realtime/`
(`backend/apps/gateway/src/tool-proxy/`), added to `gateway.module.ts`'s `imports`. No
API/Application/Infrastructure layering needed here (no new business logic — it depends on
`AUTH_TOKEN_SERVICE`'s *existing* interface, satisfying `backend-architecture.md`'s "depend on an
interface" rule without a new one).

**Why Nest middleware (`NestModule.configure()`), not raw `app.use()` in `main.ts`**: keeps the DI
container available (the gate needs `AUTH_TOKEN_SERVICE`) without touching the load-bearing
`main.ts` file.

Files to create:
- `tool-proxy.module.ts` — `implements NestModule`, imports `AuthKernelModule`; `configure()`
  applies `AdminAuthGateMiddleware` + a Grafana-targeting proxy middleware to Grafana's route(s), and
  the same gate + a Kafka-UI-targeting proxy middleware to Kafka UI's route(s).
- `infrastructure/middleware/admin-auth-gate.middleware.ts` — `@Injectable() implements
  NestMiddleware`, constructor-injects `@Inject(AUTH_TOKEN_SERVICE) private authTokenService:
  IAuthTokenService`. On each request: read token from `req.query.token` → parsed
  `admin_proxy_session` cookie → `Authorization: Bearer` header (in that priority order); verify;
  401 if invalid, 403 if `role !== 'admin'`; if sourced from the query param, `res.cookie(...)` as
  described in Decision 2 above; `next()`.
- `infrastructure/proxy/tool-proxy.factory.ts` — `createToolProxyMiddleware(target: string)` using
  `http-proxy-middleware`'s `createProxyMiddleware({ target, changeOrigin: true, ws: true })` (`ws:
  true` for Grafana Live; coexists with Socket.IO's own `/ws` upgrade handling since they're
  different path prefixes). Two call sites: `http://grafana:3000`, `http://kafka-ui:8080`.
- `backend/package.json` — add `http-proxy-middleware` as a runtime dependency.

**Implementation-time verification, don't assume**: confirm the actual Express-5-compatible route
pattern that matches both `admin/grafana` itself and everything under it (dashboards, assets, API
calls) — bare `*` wildcards are no longer valid alone under path-to-regexp v6+.

### Devops

`devops/observability/docker-compose.yml`, `grafana` service `environment:` — add:
```yaml
- GF_SERVER_ROOT_URL=http://localhost:8000/admin/grafana/
- GF_SERVER_SERVE_FROM_SUB_PATH=true
```
Remove its `ports: ["3001:3000"]` block (Decision 4). Do not add `GF_SECURITY_ALLOW_EMBEDDING`
(Decision 1 — never framed).

`devops/kafka/docker-compose.yml`, `kafka-ui` service `environment:` — add:
```yaml
- SERVER_SERVLET_CONTEXT_PATH=/admin/kafka-ui
```
with a comment recording the unconfirmed provectus/kafka-ui#2346 risk (see above) and the
smoke-test-live instruction. Remove its `ports: ["8080:8080"]` block (Decision 4).

Match both files' existing comment density/style (explain "why," pinned versions untouched,
`extends:`/`common.yml` structure preserved).

### Frontend

- `npx expo install react-native-webview`.
- `src/config/urls.js` — add `admin: { users: \`${BASE_URL}/admin/users\`, grafana:
  \`${BASE_URL}/admin/grafana/\`, kafkaUi: \`${BASE_URL}/admin/kafka-ui/\` }`. Token-appending for
  the WebView URLs happens where they're opened (see below), not baked into this static file.
- `src/services/httpClient.js` (new) — `authorizedFetch(url, token, options)`: wraps `fetch`,
  attaches `Authorization: Bearer <token>`, reuses `apiError.js`'s `parseErrorMessage` on failure.
  The first authenticated-fetch helper in the codebase — built shared, not inlined, since more
  authenticated calls will follow.
- `src/services/adminService.js` (new) — `listUsers(token)`, `updateUser(token, id, patch)`,
  `deleteUser(token, id)`, each a thin call through `authorizedFetch` to `URLS.admin.users(/:id)`
  — mirrors `authService.js`'s shape.
- `src/store/slices/adminSlice.js` (new) — `fetchUsers`/`updateUser`/`removeUser` thunks calling
  `adminService`, token from `getState().auth.accessToken`. Ephemeral state (not persisted), same
  pattern as `scraperSlice`/`wsSlice`. Register in `src/store/index.js`.
- Route structure, nested stack under the existing `(tabs)` group:
  ```
  app/(tabs)/admin/
    _layout.js   # Stack — dashboard tiles, users list, generic webview screen
    index.js     # Admin Dashboard: data-driven tile list (Users / Grafana / Kafka UI — a future
                 # "Database" tile is just one more array entry), built from GlowCard. Its own role
                 # redirect here too (role !== 'admin' -> router.replace('/')), mirroring AuthGate's
                 # pattern — required because a hidden tab alone is not access control.
    users.js     # Real user list (fetchUsers on mount); per-row edit (email/phone/role via
                 # InputField + a role picker, PATCH) and delete (confirm, DELETE)
    webview.js   # Generic full-screen react-native-webview screen, `url`/`title` route params —
                 # reused for both Grafana and Kafka UI
  ```
  Grafana/Kafka UI tiles navigate to `webview.js` with `url = URLS.admin.grafana + '?token=' +
  accessToken` (one-time — the gate middleware upgrades this into the cookie for every request
  after, per Decision 2).
- `app/(tabs)/_layout.js` — add a 4th `TABS` entry (`name: 'admin'`), shown only when
  `useSelector(state => state.auth.user?.role) === 'admin'`. **Verify Expo Router 57's exact API for
  a registered-but-hidden-from-tab-bar route against https://docs.expo.dev/versions/v57.0.0/ before
  writing this** — per the frontend agent's own standing rule not to assume older Expo Router
  patterns still apply.

## Verification — prove it, don't assume it

1. Rebuild/redeploy the stack with the Gateway changes and the two devops env-var changes; confirm
   `grafana`/`kafka-ui` still boot healthy (check logs — a bad `root_url` is a realistic way to break
   Grafana's own startup).
2. **Backend first, via curl, before touching the frontend:**
   - Log in as the seeded admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) via `POST /auth/login`, capture
     `access_token`. Also create/log in a plain `user`-role account for the negative test.
   - `curl -i "http://localhost:8000/admin/grafana/?token=<admin_token>"` → 200, real Grafana HTML,
     `Set-Cookie: admin_proxy_session=...` present.
   - Same URL with no token, and with the `user`-role token → 401/403, confirm Grafana's HTML is
     genuinely not returned.
   - `curl -b "admin_proxy_session=<jwt>" http://localhost:8000/admin/grafana/api/..."` (no query
     token this time) → still 200 — proves the cookie fallback actually authenticates subsequent
     requests, not just the first one.
   - Repeat all four checks for `/admin/kafka-ui/`.
3. **Frontend**, web build first (`expo start --web`): log in as admin, confirm the Admin tab
   appears; log in as a `user`-role account, confirm it does not. As admin:
   - Users: real list renders; edit a throwaway test user's role/phone and confirm it persists
     (reload); delete a throwaway test user, confirm it's gone.
   - Grafana tile: dashboard UI renders correctly — check the browser devtools network tab
     specifically for 404s/broken asset paths (the concrete symptom of a `root_url` misconfiguration).
   - Kafka UI tile: renders and lists the topic set — the specific check for the flagged
     `SERVER_SERVLET_CONTEXT_PATH` risk; if it loads blank/broken, that bug reproduced and needs the
     fallback mentioned above.
4. Test at least once on native (Expo Go/simulator) if available — `react-native-webview` can behave
   differently there than the web build's iframe-based shim; acceptable to defer if unavailable, but
   note it as untested rather than assuming parity.
