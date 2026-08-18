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
  _layout.js          # Root provider stack (Redux, PersistGate, ThemeProvider, ThemeAnimProvider)
  (tabs)/
    _layout.js        # Custom animated tab bar
    index.js          # Home / landing screen
    scraper.js        # URL input + scrape result display
    settings.js       # Light/dark theme toggle
src/
  components/
    GlowCard.js       # Themed card with glow shadow
    GradientButton.js # LinearGradient button with loading state
    SpaceBackground.js# Animated dual-layer starfield background
    ThemeProvider.js  # Gluestack UI provider wired to Redux theme
  context/
    ThemeAnimContext.js # Shared Animated.Value (0=light, 1=dark) for 600ms transitions
  hooks/
    useAppTheme.js    # Returns { isDark, colors, colorMode } — use this everywhere
  store/
    index.js          # Store config: scraper (ephemeral) + theme (persisted)
    slices/
      scraperSlice.js # Async thunk → POST /api/scrape, status/result/error
      themeSlice.js   # mode: null | 'light' | 'dark'
  theme/
    colors.js         # Dual palettes: dark (indigo/cyan) + light (indigo/teal)
  config/
    urls.js           # BASE_URL = http://localhost:8000, URLS.gateway.scrape
```

## Theme System

**Four-layer pipeline** — touch only the layer you need:

1. **Redux state** (`themeSlice`): `mode = null | 'light' | 'dark'`. `null` means follow system.
2. **Derivation** (`useAppTheme`): resolves `isDark`, returns `colors` palette and `colorMode` string.
3. **Animation** (`ThemeAnimContext`): single `Animated.Value` (progress 0→1). Drives 600ms interpolations. `useNativeDriver: false` required for color interpolation.
4. **Gluestack** (`ThemeProvider`): receives `colorMode` so Gluestack components follow the same state.

To theme a new component: import `useAppTheme` and `useThemeAnim`. Use `colors.*` for static values; interpolate `progress` for animated color transitions.

## API

Single endpoint, no auth:

```
POST http://localhost:8000/api/scrape
Body: { "url": "<string>" }
```

`scraperSlice.submitScrapeRequest(url)` is the async thunk. Results are **not persisted** — cleared on reload or via `clearScraper()`.

Change the URL in [src/config/urls.js](src/config/urls.js).

## Provider Order (root layout)

```
Redux Provider
  └─ PersistGate (rehydrates theme from AsyncStorage)
     └─ ThemeProvider (Gluestack colorMode)
        └─ ThemeAnimProvider (animation context)
           └─ Stack (Expo Router)
```

Order matters — do not reorder providers.

## Key Conventions

- **Always use `useAppTheme()`** for colors, never hardcode or reference `colors.js` directly in components.
- **Build shared UI as components in `src/components/`, not duplicated per-screen markup** — e.g. a single reusable input-field component used by the URL/query submission screen, register, and login, rather than each screen hand-rolling its own `TextInput`. See [../.claude/agents/frontend.md](../.claude/agents/frontend.md)'s "Build for reuse" section.
- **Scraper state is ephemeral** — do not add persistence to `scraperSlice`.
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

Backend must be running at `localhost:8000` for the scraper tab to work.
