# Frontend — Claude Code Guide

> Expo 57 has breaking changes. Always read versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing code.

## Stack

- **Framework**: React Native 0.86 + Expo ~57.0.0
- **Routing**: Expo Router (file-based, `app/` directory)
- **State**: Redux Toolkit + redux-persist → AsyncStorage
- **UI**: Gluestack UI 1.1.73 (theming), Expo LinearGradient, react-native-svg
- **Icons**: Expo Vector Icons (Ionicons)
- **Navigation**: react-navigation 7 + Expo Router tabs

## Project Structure

```
app/
  _layout.js          # Root provider stack (Redux, PersistGate, ThemeProvider, ThemeAnimProvider,
                       # RealtimeConnectionManager — auto connects/disconnects the WS on token change)
  (tabs)/
    _layout.js        # Custom animated tab bar
    index.js          # Home / landing screen
    scraper.js        # URL input + scrape result display
    settings.js       # Theme toggle + connection status indicator
src/
  components/
    ConnectionStatus.js # Dot + label, reads wsSlice.status
    GlowCard.js       # Themed card with glow shadow
    GradientButton.js # LinearGradient button with loading state
    InputField.js     # Reusable labeled text input — use this, don't hand-roll TextInput
    SpaceBackground.js# Animated dual-layer starfield background
    ThemeProvider.js  # Gluestack UI provider wired to Redux theme
  context/
    ThemeAnimContext.js # Shared Animated.Value (0=light, 1=dark) for 600ms transitions
  hooks/
    useAppTheme.js    # Returns { isDark, colors, colorMode } — use this everywhere
  services/            # All I/O lives here — see "Services Layer" below
    socketService.js   # Socket.IO client wrapper (connect/disconnect/isConnected)
    scraperService.js  # POST /api/scrape
  store/
    index.js          # Store config: scraper + ws (ephemeral), theme + auth (persisted)
    slices/
      authSlice.js    # accessToken — store-managed only, no UI ever shows/edits it directly
      scraperSlice.js # Thunk → scraperService.submitScrapeRequest, status/result/error
      themeSlice.js   # mode: null | 'light' | 'dark'
      wsSlice.js      # Thunks → socketService, status/lastMessage/error
  theme/
    colors.js         # Dual palettes: dark (indigo/cyan) + light (indigo/teal)
  config/
    urls.js           # BASE_URL, URLS.gateway.scrape, URLS.gateway.wsOrigin/wsPath,
                       # URLS.auth.origin (see "HTTP API" below) — all the Gateway's own origin
```

## Theme System

**Four-layer pipeline** — touch only the layer you need:

1. **Redux state** (`themeSlice`): `mode = null | 'light' | 'dark'`. `null` means follow system.
2. **Derivation** (`useAppTheme`): resolves `isDark`, returns `colors` palette and `colorMode` string.
3. **Animation** (`ThemeAnimContext`): single `Animated.Value` (progress 0→1). Drives 600ms interpolations. `useNativeDriver: false` required for color interpolation.
4. **Gluestack** (`ThemeProvider`): receives `colorMode` so Gluestack components follow the same state.

To theme a new component: import `useAppTheme` and `useThemeAnim`. Use `colors.*` for static values; interpolate `progress` for animated color transitions.

## Services Layer — where all I/O lives

Every network call (HTTP or WebSocket) lives in a plain module under `src/services/`, never inline
inside a thunk and never inside a component:

- **Services** (`src/services/*.js`) own the raw I/O — `fetch`, `socket.io-client`, whatever the
  call needs. They know nothing about Redux: no `dispatch`, no reading store state. They expose
  plain functions (`submitScrapeRequest(url)`) or a callback-based API for long-lived connections
  (`connect(token, { onMessage, ... })`).
- **Thunks** (`src/store/slices/*.js`) call the service and translate the result into dispatched
  actions. This is the *only* layer allowed to import a service module.
- **Components** only ever `dispatch()` a thunk and `useSelector()` state — never import a service
  directly, never hold connection/request state in `useState`.
- **Custom hooks are the exception, not the default** — only reach for one when a component
  genuinely needs something no thunk/selector combination can give it. The default path is always
  component → thunk → service.

Concretely: `wsSlice.js`'s thunks call `socketService.js`; `scraperSlice.js`'s thunk calls
`scraperService.js`. Auth Service now exists (see "HTTP API" below) — login/register/etc. thunks
should call a new `authService.js` the same way. This is the established pattern for all future
I/O, not WS-specific.

## HTTP API

```
POST http://localhost:8000/api/scrape
Body: { "url": "<string>", "query": "<string>" }
```

Both fields are required — `query` is free text (what to ask about the page), no format
validation beyond non-empty. `scraperSlice.submitScrapeRequest({ url, query })` is the async thunk
(calls `scraperService`). Results are **not persisted** — cleared on reload or via
`clearScraper()`.

**Auth — through the Gateway, same origin as everything else.** The Gateway proxies `/auth/*`,
`/me`, `/admin/users*` to Auth Service (`docs/specs/services.md`) — `authService.js` calls
`URLS.auth.origin`, which is the Gateway's own origin (`http://localhost:8000`, same as
`URLS.gateway.*`), not Auth Service's. The frontend never talks to Auth Service (or any backend
service) directly, only the Gateway — this used to be a documented stopgap (Auth Service's own
origin, port 8001) exactly because the proxy didn't exist yet; it's gone now, and `authService.js`
itself didn't need to change at all when it did — only `URLS.auth.origin`'s value, confirming the
services-layer pattern did what it was meant to. Request/response bodies stay snake_case, matching
`docs/specs/api-contracts.md` exactly (`phone_number`, `access_token`, ...) — don't camelCase them
client-side before sending.

## WebSocket (Socket.IO)

Connects to `URLS.gateway.wsOrigin` at path `URLS.gateway.wsPath` (`/ws`), token sent as
`auth: { token }` in the handshake — see `docs/specs/api-contracts.md`. `wsSlice`'s
`connectWebSocket()`/`disconnectWebSocket()` thunks call `socketService`; `app/_layout.js`'s
`RealtimeConnectionManager` dispatches them automatically whenever `authSlice.accessToken`
changes, so nothing else needs to call them manually. Socket.IO reconnects automatically on drop
(`wsSlice` reflects that as `status: 'connecting'`, not a dead-end `disconnected`).

Change either URL in [src/config/urls.js](src/config/urls.js).

## Provider Order (root layout)

```
Redux Provider
  └─ PersistGate (rehydrates theme + auth from AsyncStorage)
     └─ ThemeProvider (Gluestack colorMode)
        └─ ThemeAnimProvider (animation context)
           └─ RealtimeConnectionManager (no UI — dispatches connectWebSocket()/
              disconnectWebSocket() whenever authSlice.accessToken changes)
           └─ Stack (Expo Router)
```

Order matters — do not reorder providers.

## Key Conventions

- **Always use `useAppTheme()`** for colors, never hardcode or reference `colors.js` directly in components.
- **Build shared UI as components in `src/components/`, not duplicated per-screen markup** — e.g. a single reusable input-field component used by the URL/query submission screen, register, and login, rather than each screen hand-rolling its own `TextInput`. See [../.claude/agents/frontend.md](../.claude/agents/frontend.md)'s "Build for reuse" section.
- **All I/O goes through `src/services/`, called only from thunks** — see "Services Layer" above. Never inline a `fetch`/`socket.io-client` call in a thunk or a component.
- **Scraper state is ephemeral** — do not add persistence to `scraperSlice`.
- **The access token is never shown or manually entered in the UI** — `authSlice` is store-managed only, set by the real login/register thunks.
- **Theme persistence is automatic** — `redux-persist` handles it; do not manually write to AsyncStorage.
- Tab icons follow the `<name>-outline` / `<name>` Ionicons pattern for inactive/active states.
- Custom tab bar lives in `app/(tabs)/_layout.js` — the `CustomTabBar` component uses `progress.interpolate()` for smooth color transitions, not `useAppTheme()` directly.

## Running

```bash
npx expo start          # Expo Go / dev client
npx expo start --android
npx expo start --ios
npx expo start --web
```

Backend must be running for the app to be useful — the frontend only ever talks to the Gateway at
`localhost:8000` (scraper tab, WS, and now register/login/`/me` too, proxied to Auth Service).
Easiest way to bring the whole backend up: `cd devops/observability && docker compose up -d`, then
`cd .. && docker compose up -d --build` (observability must come up first — see root `CLAUDE.md`).
