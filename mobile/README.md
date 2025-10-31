# Clearview Mobile (Expo React Native)

This directory contains the starting point for Clearview’s mobile companion app built with [Expo](https://expo.dev/) and React Native. The goal is to mirror the core web experience (auth, project list, daily timeline) while reusing Supabase as the backend.

## Prerequisites

- Node.js 18+
- `npm` or `yarn`
- Expo CLI (`npm install -g expo-cli`) or use `npx expo`
- Supabase project with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Getting Started

```bash
cd mobile
npm install

# optionally copy .env.example -> .env and fill in Supabase keys
npm start
```

By default Expo looks for environment variables prefixed with `EXPO_PUBLIC_…`. You can place them in:

- `app.json` → `"expo": { "extra": { "EXPO_PUBLIC_SUPABASE_URL": "...", ... }}`
- or a `.env` file (requires `expo dotenv` plugin if you prefer that route).

### Scripts

- `npm start` – start the Expo dev server
- `npm run android` / `ios` – launch simulator
- `npm run web` – run in browser for quick layout checks

## Project Structure

```
mobile/
  App.tsx                     # root navigator deciding between auth/projects flow
  src/
    lib/supabase.ts           # Supabase client (AsyncStorage persistence)
    hooks/useSupabaseAuth.ts  # tracks auth session
    screens/
      LoginScreen.tsx
      ProjectListScreen.tsx
      TimelineScreen.tsx      # read-only timeline preview
    types/navigation.ts       # navigation stack types
```

## Next Steps

- Flesh out timeline to match the web UI (files, posts, uploads).
- Add project member management, change orders, etc.
- Integrate push notifications / offline cache as mobile-first enhancements.
- Polish styling and add dark-mode toggles or system theming.

Happy shipping!
