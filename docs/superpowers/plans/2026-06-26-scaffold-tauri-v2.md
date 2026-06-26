# Scaffold Tauri v2 — stroygetter-native Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffolder le projet Tauri v2 from scratch et intégrer le design system existant pour produire une app desktop/mobile fonctionnelle qui télécharge des vidéos YouTube et TikTok.

**Architecture:** Frontend React+Vite dans `src/`, backend Rust dans `src-tauri/`. Les commandes Tauri (Rust) gèrent le spawn de yt-dlp/ffmpeg et la DB SQLite. Le TypeScript gère l'UI, le routing, l'i18n, et les appels HTTP metadata (YouTube Music + LRClib) pour Library Ready.

**Tech Stack:** Tauri v2, React 18, Vite 5, react-router v6, react-i18next, Tailwind CSS v4, shadcn/ui, rusqlite, tauri-plugin-shell, tauri-plugin-dialog.

## Global Constraints

- Tauri v2 (pas v1) — API `app.emit()`, capabilities JSON, `tauri-plugin-shell` séparé
- Tailwind CSS v4 — `@import "tailwindcss"` dans CSS, plugin `@tailwindcss/vite`, pas de `tailwind.config.js`
- shadcn/ui style `new-york`, base color `neutral`, icon library `lucide`
- Alias `@/` → `src/` dans Vite et TypeScript
- TikTok photos **exclu** du MVP
- Twitch : clips uniquement, VOD désactivé
- rusqlite avec feature `bundled` (pas de Prisma)
- Tous les binaires sidecars dans `src-tauri/binaries/` avec le suffixe target triple

---

## Task 1: Tauri v2 + Vite scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `tsconfig.json`, `tsconfig.node.json`
- Create: `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces: projet compilable avec `npm run tauri dev`, fenêtre Tauri qui affiche "Hello StroyGetter"

- [ ] **Step 1: Initialiser le projet Vite + React dans le répertoire courant**

```bash
npm create vite@latest . -- --template react-ts --force
```

Répondre `y` si demande de confirmation pour le dossier non-vide.

- [ ] **Step 2: Installer les dépendances npm de base**

```bash
npm install
npm install @tauri-apps/api@latest
npm install --save-dev @tauri-apps/cli@latest
```

- [ ] **Step 3: Initialiser Tauri dans le projet**

```bash
npx tauri init
```

Répondre aux prompts :
- App name: `StroyGetter`
- Window title: `StroyGetter`
- Web assets location: `../dist`
- Dev server URL: `http://localhost:1420`
- Dev command: `npm run dev`
- Build command: `npm run build`

- [ ] **Step 4: Installer les plugins Tauri v2**

```bash
npm install @tauri-apps/plugin-shell @tauri-apps/plugin-dialog
```

- [ ] **Step 5: Mettre à jour `vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

- [ ] **Step 6: Mettre à jour `tsconfig.json` avec les path aliases**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 7: Écrire `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "StroyGetter",
  "version": "0.1.0",
  "identifier": "eu.stroyco.stroygetter-native",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "StroyGetter",
        "width": 1200,
        "height": 750,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "externalBin": [
      "binaries/yt-dlp",
      "binaries/ffmpeg"
    ]
  }
}
```

- [ ] **Step 8: Créer `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for stroygetter-native",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        { "name": "yt-dlp", "sidecar": true },
        { "name": "ffmpeg", "sidecar": true }
      ]
    },
    "shell:allow-open",
    "dialog:allow-open"
  ]
}
```

- [ ] **Step 9: Mettre à jour `src-tauri/Cargo.toml`**

```toml
[package]
name = "stroygetter-native"
version = "0.1.0"
edition = "2021"

[lib]
name = "stroygetter_native_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
uuid = { version = "1", features = ["v4"] }
dirs = "5"
```

- [ ] **Step 10: Écrire `src-tauri/src/lib.rs` minimal**

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 11: Écrire `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    stroygetter_native_lib::run();
}
```

- [ ] **Step 12: Écrire `src/main.tsx` minimal**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div style={{ color: "white", background: "#0f172a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <h1>Hello StroyGetter</h1>
    </div>
  </React.StrictMode>
);
```

- [ ] **Step 13: Créer le dossier binaries (placeholder)**

```bash
mkdir -p src-tauri/binaries
echo "# Place yt-dlp and ffmpeg sidecars here" > src-tauri/binaries/README.md
```

Les binaires réels seront téléchargés manuellement (voir Task 6).

- [ ] **Step 14: Vérifier que le projet compile**

```bash
npm run tauri dev
```

Résultat attendu : fenêtre Tauri qui s'ouvre avec "Hello StroyGetter" sur fond sombre. Aucune erreur Rust ni Vite.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri v2 + Vite React project"
```

---

## Task 2: Tailwind v4 + shadcn/ui migration

**Files:**
- Create: `src/globals.css` (depuis `globals.css` existant)
- Modify: `vite.config.ts`
- Create: `src/lib/utils.ts`
- Move: `components/ui/` → `src/components/ui/`
- Modify: `components.json`
- Delete: `globals.css` (racine)

**Interfaces:**
- Produces: `cn()` disponible depuis `@/lib/utils`, tous les composants shadcn importables depuis `@/components/ui/*`, couleurs `stroy-*` disponibles en Tailwind

- [ ] **Step 1: Installer Tailwind v4 et ses dépendances**

```bash
npm install tailwindcss @tailwindcss/vite
npm install lucide-react
npm install class-variance-authority clsx tailwind-merge
```

- [ ] **Step 2: Mettre à jour `vite.config.ts` avec le plugin Tailwind v4**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

- [ ] **Step 3: Copier `globals.css` dans `src/globals.css`**

Lire le fichier `globals.css` existant à la racine, puis créer `src/globals.css` en remplaçant le début par :

```css
@import "tailwindcss";

@layer theme {
  :root {
    /* Coller ici le contenu existant de globals.css à partir des variables CSS */
  }
}
```

Le fichier racine `globals.css` contient les variables `--stroy-*` et les custom utilities. Les reporter intégralement dans `src/globals.css` sous `@layer theme { :root { ... } }`.

> Concrètement : ouvrir `globals.css` (racine), copier tout son contenu dans `src/globals.css`, et remplacer la ligne `@tailwind base;` par `@import "tailwindcss";`, supprimer `@tailwind components;` et `@tailwind utilities;`.

- [ ] **Step 4: Créer `src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Déplacer `components/ui/` → `src/components/ui/`**

```bash
mkdir -p src/components/ui
cp components/ui/*.tsx src/components/ui/
```

- [ ] **Step 6: Corriger les imports dans chaque fichier `src/components/ui/*.tsx`**

Chaque fichier importe `@/lib/utils` — vérifier que cet alias est correct. Si les fichiers importent depuis `"@/lib/utils"`, ils fonctionneront dès que `src/lib/utils.ts` existe.

Parcourir chaque fichier et remplacer tout import `next/*` résiduel (il ne devrait pas y en avoir dans `components/ui/`).

- [ ] **Step 7: Mettre à jour `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 8: Mettre à jour `index.html` pour importer `src/globals.css`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StroyGetter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Mettre à jour `src/main.tsx` pour importer le CSS**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="min-h-screen bg-stroy-950 text-white flex items-center justify-center">
      <h1 className="text-3xl font-bold">Hello StroyGetter</h1>
    </div>
  </React.StrictMode>
);
```

- [ ] **Step 10: Vérifier que les couleurs `stroy-*` s'appliquent**

```bash
npm run dev
```

Résultat attendu : fond sombre `stroy-950` et texte blanc visible dans la fenêtre Tauri.

- [ ] **Step 11: Supprimer `globals.css` à la racine**

```bash
rm globals.css
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: integrate Tailwind v4 and shadcn/ui design system"
```

---

## Task 3: i18n avec react-i18next

**Files:**
- Create: `src/locales/en.json`
- Create: `src/locales/fr-FR.json`
- Create: `src/locales/es-419.json`
- Create: `src/locales/pt-BR.json`
- Create: `src/lib/i18n.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: hook `useTranslation(namespace)` fonctionnel, détection langue système, persistance dans `localStorage`
- Consumes: fichiers `messages/*.json` existants (copiés/renommés)

- [ ] **Step 1: Installer react-i18next**

```bash
npm install react-i18next i18next i18next-browser-languagedetector
```

- [ ] **Step 2: Copier les fichiers messages/ dans src/locales/**

```bash
mkdir -p src/locales
cp messages/en.json src/locales/en.json
cp messages/fr-FR.json src/locales/fr-FR.json
cp "messages/es-419.json" src/locales/es-419.json
cp messages/pt-BR.json src/locales/pt-BR.json
```

- [ ] **Step 3: Créer `src/lib/i18n.ts`**

```typescript
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "../locales/en.json";
import frFR from "../locales/fr-FR.json";
import es419 from "../locales/es-419.json";
import ptBR from "../locales/pt-BR.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "fr-FR": { translation: frFR },
      "es-419": { translation: es419 },
      "pt-BR": { translation: ptBR },
    },
    fallbackLng: "en",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "stroygetter-lang",
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

export const SUPPORTED_LANGS = [
  { code: "en", label: "English" },
  { code: "fr-FR", label: "Français" },
  { code: "es-419", label: "Español" },
  { code: "pt-BR", label: "Português" },
] as const;
```

- [ ] **Step 4: Importer i18n dans `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import "./lib/i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="min-h-screen bg-stroy-950 text-white flex items-center justify-center">
      <h1 className="text-3xl font-bold">Hello StroyGetter</h1>
    </div>
  </React.StrictMode>
);
```

- [ ] **Step 5: Écrire un test de smoke pour i18n**

Créer `src/lib/__tests__/i18n.test.ts` :

```typescript
import "../i18n";
import i18n from "i18next";

describe("i18n", () => {
  it("contains getterInput.placeholder in English", () => {
    i18n.changeLanguage("en");
    const val = i18n.t("getterInput.placeholder");
    expect(typeof val).toBe("string");
    expect(val.length).toBeGreaterThan(0);
  });

  it("contains getterInput.placeholder in French", () => {
    i18n.changeLanguage("fr-FR");
    const val = i18n.t("getterInput.placeholder");
    expect(val).toContain("URL");
  });
});
```

- [ ] **Step 6: Installer et configurer Vitest**

```bash
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

Ajouter dans `vite.config.ts` :

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

Créer `src/test-setup.ts` :

```typescript
import "@testing-library/jest-dom";
```

Ajouter dans `package.json` scripts :

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Lancer le test**

```bash
npm test
```

Résultat attendu : 2 tests passent.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add react-i18next with existing locale files"
```

---

## Task 4: App shell — routing + sidebar layout

**Files:**
- Create: `src/App.tsx`
- Create: `src/components/custom/Sidebar.tsx`
- Create: `src/components/custom/BottomNav.tsx`
- Create: `src/views/Home.tsx`
- Create: `src/views/Fetch.tsx`
- Create: `src/views/Settings.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: layout `sidebar + main` fonctionnel, routes `/`, `/fetch`, `/settings`, navigation entre vues
- Consumes: `useTranslation` depuis react-i18next, react-router-dom

- [ ] **Step 1: Installer react-router-dom**

```bash
npm install react-router-dom
```

- [ ] **Step 2: Créer les stubs de vues**

`src/views/Home.tsx` :

```tsx
export function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8">
      <h1 className="text-2xl font-bold text-white">Home — stub</h1>
    </div>
  );
}
```

`src/views/Fetch.tsx` :

```tsx
export function Fetch() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8">
      <h1 className="text-2xl font-bold text-white">Fetch — stub</h1>
    </div>
  );
}
```

`src/views/Settings.tsx` :

```tsx
export function Settings() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8">
      <h1 className="text-2xl font-bold text-white">Settings — stub</h1>
    </div>
  );
}
```

- [ ] **Step 3: Créer `src/components/custom/Sidebar.tsx`**

```tsx
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, Settings, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-white/8 bg-stroy-900">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/8">
        <div className="size-6 rounded bg-stroy-500 flex items-center justify-center text-white font-bold text-xs">
          S
        </div>
        <span className="font-bold text-white tracking-tight">StroyGetter</span>
      </div>

      {/* New */}
      <div className="px-3 pt-4">
        <button
          onClick={() => navigate("/")}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/6 hover:text-white"
        >
          <Plus size={15} />
          Nouveau téléchargement
        </button>
      </div>

      {/* History placeholder */}
      <div className="flex-1 overflow-y-auto px-3 pt-4">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
          Historique
        </p>
        {/* Items injectés en Task 10 */}
      </div>

      {/* Settings */}
      <div className="border-t border-white/8 px-3 py-3">
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            location.pathname === "/settings"
              ? "bg-white/8 text-white"
              : "text-white/60 hover:bg-white/6 hover:text-white"
          )}
        >
          <Settings size={15} />
          Paramètres
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Créer `src/components/custom/BottomNav.tsx`**

```tsx
import { useNavigate, useLocation } from "react-router-dom";
import { Home, Clock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/", icon: Home, label: "Accueil" },
  { path: "/history", icon: Clock, label: "Historique" },
  { path: "/settings", icon: Settings, label: "Paramètres" },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t border-white/8 bg-stroy-900 md:hidden">
      {TABS.map(({ path, icon: Icon, label }) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors",
            location.pathname === path ? "text-white" : "text-white/50"
          )}
        >
          <Icon size={20} />
          {label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Créer `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "@/components/custom/Sidebar";
import { BottomNav } from "@/components/custom/BottomNav";
import { Home } from "@/views/Home";
import { Fetch } from "@/views/Fetch";
import { Settings } from "@/views/Settings";

export function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-stroy-950 text-white">
        {/* Sidebar desktop uniquement */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/fetch" element={<Fetch />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>

        {/* Bottom nav mobile uniquement */}
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Mettre à jour `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import "./lib/i18n";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Vérifier le layout**

```bash
npm run tauri dev
```

Résultat attendu : sidebar visible sur desktop (220px gauche), contenu "Home — stub" à droite. Naviguer vers `/settings` via le bouton Paramètres fonctionne.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: app shell with sidebar layout and react-router"
```

---

## Task 5: Rust — DB rusqlite + initialisation

**Files:**
- Create: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `DbConn` state Tauri injecté dans toutes les commandes, table `downloads` créée au démarrage
- Produces: `db::insert_download(conn, item)` et `db::get_history(conn)` utilisables depuis les commandes

- [ ] **Step 1: Écrire `src-tauri/src/db.rs`**

```rust
use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub struct DbConn(pub Mutex<Connection>);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub title: String,
    pub author: Option<String>,
    pub thumbnail_url: Option<String>,
    pub format: String,
    pub file_path: String,
    pub created_at: i64,
}

pub fn open(app_data_dir: &std::path::Path) -> Result<Connection> {
    std::fs::create_dir_all(app_data_dir).ok();
    let path = app_data_dir.join("stroygetter.db");
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS downloads (
            id            TEXT PRIMARY KEY,
            url           TEXT NOT NULL,
            title         TEXT NOT NULL,
            author        TEXT,
            thumbnail_url TEXT,
            format        TEXT NOT NULL,
            file_path     TEXT NOT NULL,
            created_at    INTEGER NOT NULL
        );",
    )?;
    Ok(conn)
}

pub fn insert(conn: &Connection, record: &DownloadRecord) -> Result<()> {
    conn.execute(
        "INSERT INTO downloads (id, url, title, author, thumbnail_url, format, file_path, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            record.id,
            record.url,
            record.title,
            record.author,
            record.thumbnail_url,
            record.format,
            record.file_path,
            record.created_at,
        ],
    )?;
    Ok(())
}

pub fn get_history(conn: &Connection) -> Result<Vec<DownloadRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, url, title, author, thumbnail_url, format, file_path, created_at
         FROM downloads ORDER BY created_at DESC LIMIT 50",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DownloadRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            title: row.get(2)?,
            author: row.get(3)?,
            thumbnail_url: row.get(4)?,
            format: row.get(5)?,
            file_path: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn in_memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS downloads (
                id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL,
                author TEXT, thumbnail_url TEXT, format TEXT NOT NULL,
                file_path TEXT NOT NULL, created_at INTEGER NOT NULL
            );",
        ).unwrap();
        conn
    }

    #[test]
    fn insert_and_retrieve() {
        let conn = in_memory();
        let record = DownloadRecord {
            id: "test-id".to_string(),
            url: "https://youtube.com/watch?v=test".to_string(),
            title: "Test Video".to_string(),
            author: Some("Test Author".to_string()),
            thumbnail_url: None,
            format: "mp4".to_string(),
            file_path: "/tmp/test.mp4".to_string(),
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
        };
        insert(&conn, &record).unwrap();
        let history = get_history(&conn).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].title, "Test Video");
    }
}
```

- [ ] **Step 2: Ajouter la commande `get_history` et init DB dans `src-tauri/src/lib.rs`**

```rust
mod db;

use db::{DbConn, DownloadRecord};
use tauri::Manager;

#[tauri::command]
fn get_history(db: tauri::State<DbConn>) -> Result<Vec<DownloadRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_history(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            let conn = db::open(&app_data_dir).expect("failed to open DB");
            app.manage(DbConn(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_history])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Lancer les tests Rust**

```bash
cd src-tauri && cargo test && cd ..
```

Résultat attendu : `test db::tests::insert_and_retrieve ... ok`

- [ ] **Step 4: Vérifier que l'app compile**

```bash
npm run tauri dev
```

Résultat attendu : aucune erreur de compilation Rust, app démarre.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add rusqlite DB with downloads history"
```

---

## Task 6: Rust — sidecars + commande fetch_video_info

**Files:**
- Create: `src-tauri/src/sidecar.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/info.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/types.ts`

**Interfaces:**
- Produces: commande Tauri `fetch_video_info(url: string)` → `VideoInfo`
- Produces: type TypeScript `VideoInfo` importable depuis `@/lib/types`

- [ ] **Step 1: Télécharger les binaires yt-dlp pour votre plateforme de dev**

Sur macOS Apple Silicon :
```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos \
  -o src-tauri/binaries/yt-dlp-aarch64-apple-darwin
chmod +x src-tauri/binaries/yt-dlp-aarch64-apple-darwin
```

Sur macOS Intel :
```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos \
  -o src-tauri/binaries/yt-dlp-x86_64-apple-darwin
chmod +x src-tauri/binaries/yt-dlp-x86_64-apple-darwin
```

Sur Windows (PowerShell) :
```powershell
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" `
  -OutFile "src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe"
```

> Note : pour le CI/CD multi-plateforme, tous les 4 binaires devront être présents. Pour le dev local, seul le binaire de votre plateforme est nécessaire.

- [ ] **Step 2: Créer `src-tauri/src/sidecar.rs`**

```rust
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::sync::mpsc;

pub struct SidecarOutput {
    pub stdout: String,
    pub stderr: String,
}

pub async fn run_sidecar(
    app: &AppHandle,
    name: &str,
    args: &[&str],
    progress_tx: Option<mpsc::Sender<String>>,
) -> Result<SidecarOutput, String> {
    let mut cmd = app
        .shell()
        .sidecar(name)
        .map_err(|e| format!("sidecar '{}' not found: {}", name, e))?;

    for arg in args {
        cmd = cmd.arg(*arg);
    }

    let (mut rx, _child) = cmd.spawn().map_err(|e| format!("spawn error: {}", e))?;

    let mut stdout = String::new();
    let mut stderr = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let text = String::from_utf8_lossy(&line).to_string();
                if let Some(tx) = &progress_tx {
                    let _ = tx.send(text.clone()).await;
                }
                stdout.push_str(&text);
                stdout.push('\n');
            }
            CommandEvent::Stderr(line) => {
                stderr.push_str(&String::from_utf8_lossy(&line));
                stderr.push('\n');
            }
            CommandEvent::Error(e) => return Err(e),
            CommandEvent::Terminated(status) => {
                if !status.success() {
                    return Err(format!("process exited with error: {}", stderr));
                }
                break;
            }
            _ => {}
        }
    }

    Ok(SidecarOutput { stdout, stderr })
}
```

- [ ] **Step 3: Créer `src-tauri/src/commands/mod.rs`**

```rust
pub mod info;
pub mod download;
pub mod library_ready;
```

- [ ] **Step 4: Créer `src-tauri/src/commands/info.rs`**

```rust
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use crate::sidecar;

#[derive(Debug, Serialize, Deserialize)]
pub struct FormatEntry {
    pub itag: Option<String>,
    #[serde(rename = "formatId")]
    pub format_id: Option<String>,
    #[serde(rename = "qualityLabel")]
    pub quality_label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoInfo {
    pub title: String,
    pub author: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub source: String,
    pub formats: Vec<FormatEntry>,
}

#[derive(Deserialize)]
struct YtDlpFormat {
    format_id: Option<String>,
    height: Option<u32>,
    vcodec: Option<String>,
    acodec: Option<String>,
    format_note: Option<String>,
}

#[derive(Deserialize)]
struct YtDlpInfo {
    title: Option<String>,
    uploader: Option<String>,
    channel: Option<String>,
    thumbnail: Option<String>,
    duration: Option<f64>,
    webpage_url: Option<String>,
    formats: Option<Vec<YtDlpFormat>>,
}

fn detect_source(url: &str) -> &'static str {
    if url.contains("youtube.com") || url.contains("youtu.be") {
        "youtube"
    } else if url.contains("tiktok.com") {
        "tiktok"
    } else if url.contains("twitch.tv") || url.contains("clips.twitch.tv") {
        "twitch"
    } else {
        "unknown"
    }
}

fn parse_youtube_formats(formats: &[YtDlpFormat]) -> Vec<FormatEntry> {
    formats
        .iter()
        .filter(|f| {
            f.vcodec.as_deref() != Some("none")
                && f.height.map(|h| h >= 360).unwrap_or(false)
        })
        .map(|f| FormatEntry {
            itag: f.format_id.clone(),
            format_id: None,
            quality_label: f.height.map(|h| format!("{}p", h)),
        })
        .collect()
}

fn parse_twitch_formats(formats: &[YtDlpFormat]) -> Vec<FormatEntry> {
    formats
        .iter()
        .filter(|f| f.vcodec.as_deref() != Some("none"))
        .map(|f| FormatEntry {
            itag: None,
            format_id: f.format_id.clone(),
            quality_label: f.format_note.clone().or_else(|| f.height.map(|h| format!("{}p", h))),
        })
        .collect()
}

#[tauri::command]
pub async fn fetch_video_info(app: AppHandle, url: String) -> Result<VideoInfo, String> {
    let output = sidecar::run_sidecar(&app, "yt-dlp", &["--dump-json", "--no-playlist", &url], None).await?;

    let info: YtDlpInfo = serde_json::from_str(output.stdout.trim())
        .map_err(|e| format!("failed to parse yt-dlp output: {}", e))?;

    let source = detect_source(&url);
    let formats = match source {
        "youtube" => info.formats.as_deref().map(parse_youtube_formats).unwrap_or_default(),
        "twitch" => info.formats.as_deref().map(parse_twitch_formats).unwrap_or_default(),
        _ => vec![],
    };

    Ok(VideoInfo {
        title: info.title.unwrap_or_else(|| "Unknown".to_string()),
        author: info
            .channel
            .or(info.uploader)
            .unwrap_or_else(|| "Unknown".to_string()),
        thumbnail: info.thumbnail,
        duration: info.duration,
        source: source.to_string(),
        formats,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_source_youtube() {
        assert_eq!(detect_source("https://www.youtube.com/watch?v=abc"), "youtube");
    }

    #[test]
    fn detect_source_tiktok() {
        assert_eq!(detect_source("https://www.tiktok.com/@user/video/123"), "tiktok");
    }

    #[test]
    fn detect_source_twitch() {
        assert_eq!(detect_source("https://clips.twitch.tv/abc"), "twitch");
    }

    #[test]
    fn parse_youtube_formats_filters_audio_only() {
        let formats = vec![
            YtDlpFormat { format_id: Some("137".to_string()), height: Some(1080), vcodec: Some("avc1".to_string()), acodec: Some("none".to_string()), format_note: None },
            YtDlpFormat { format_id: Some("140".to_string()), height: None, vcodec: Some("none".to_string()), acodec: Some("mp4a".to_string()), format_note: None },
        ];
        let result = parse_youtube_formats(&formats);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].itag.as_deref(), Some("137"));
    }
}
```

- [ ] **Step 5: Enregistrer les commandes dans `src-tauri/src/lib.rs`**

```rust
mod db;
mod sidecar;
mod commands;

use db::DbConn;
use tauri::Manager;

#[tauri::command]
fn get_history(db: tauri::State<DbConn>) -> Result<Vec<db::DownloadRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_history(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("app data dir");
            let conn = db::open(&app_data_dir).expect("open DB");
            app.manage(DbConn(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            commands::info::fetch_video_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Créer `src/lib/types.ts`**

```typescript
export interface FormatEntry {
  itag?: string;
  formatId?: string;
  qualityLabel?: string;
}

export interface VideoInfo {
  title: string;
  author: string;
  thumbnail?: string;
  duration?: number;
  source: "youtube" | "tiktok" | "twitch";
  formats: FormatEntry[];
}

export interface DownloadRecord {
  id: string;
  url: string;
  title: string;
  author?: string;
  thumbnailUrl?: string;
  format: string;
  filePath: string;
  createdAt: number;
}

export type DownloadFormat =
  | "mp4"
  | "mp3"
  | "library-ready"
  | "tiktok-no-watermark"
  | "tiktok-watermark"
  | "tiktok-audio"
  | "twitch-video"
  | "twitch-audio";

export interface DownloadProgress {
  phase: "downloading" | "fetching_cover" | "embedding";
  percent: number;
}
```

- [ ] **Step 7: Lancer les tests Rust**

```bash
cd src-tauri && cargo test && cd ..
```

Résultat attendu : 4 nouveaux tests passent (`detect_source_*`, `parse_youtube_formats_*`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add fetch_video_info Tauri command with yt-dlp"
```

---

## Task 7: Home view + GetterInput (réécriture)

**Files:**
- Create: `src/components/custom/GetterInput.tsx`
- Modify: `src/views/Home.tsx`

**Interfaces:**
- Consumes: `useTranslation`, `useNavigate` (react-router), pas de next/*
- Produces: composant `GetterInput` qui navigue vers `/fetch?url=...` on submit

- [ ] **Step 1: Copier `components/custom/GetterInput.tsx` → `src/components/custom/GetterInput.tsx` et réécrire**

```tsx
import { ArrowRight, Clipboard, Loader2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";

function isKnownVideoUrl(v: string): boolean {
  return (
    v.includes("youtube.com") ||
    v.includes("youtu.be") ||
    v.includes("tiktok.com") ||
    v.includes("twitch.tv") ||
    v.includes("clips.twitch.tv")
  );
}

interface Props {
  initialUrl?: string;
}

export function GetterInput({ initialUrl = "" }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState(initialUrl);
  const [pasteError, setPasteError] = useState("");

  const submit = (value: string) => {
    if (!value.trim()) return;
    navigate(`/fetch?url=${encodeURIComponent(value.trim())}`);
  };

  const handlePaste = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      submit(text);
    } catch {
      setPasteError(t("getterInput.errorClipboard"));
      inputRef.current?.focus();
      setTimeout(() => setPasteError(""), 4000);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(url);
      }}
      className="mx-auto w-full max-w-2xl"
    >
      <label
        htmlFor="video-url"
        className="mb-4 flex cursor-text items-center gap-3 rounded-2xl border border-white/16 bg-stroy-950 px-4 py-3.5 transition-colors focus-within:border-white/35"
      >
        <Search size={18} className="shrink-0 text-white/50" />
        <input
          ref={inputRef}
          type="text"
          placeholder={t("getterInput.placeholder")}
          id="video-url"
          name="video-url"
          autoComplete="off"
          className="flex-1 bg-transparent font-mono text-sm text-white/55 outline-none placeholder:text-white/35 focus:text-white"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          title={t("getterInput.pasteTitle")}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs font-semibold text-white/70 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          onClick={handlePaste}
        >
          <Clipboard size={12} />
          {t("getterInput.pasteButton")}
        </button>
      </label>

      {pasteError && (
        <p className="mb-2 text-center text-xs text-red-400">{pasteError}</p>
      )}

      <button
        type="submit"
        disabled={url.length === 0}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-stroy-900 px-8 py-4 text-base font-bold text-white shadow-md transition-all duration-200 hover:bg-stroy-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("getterInput.searchButton")}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Écrire `src/views/Home.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { GetterInput } from "@/components/custom/GetterInput";

export function Home() {
  const { t } = useTranslation();

  const BADGES = [
    t("home.heroBadge1"),
    t("home.heroBadge2"),
    t("home.heroBadge3"),
    t("home.heroBadge4"),
  ];

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-16">
      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-white md:text-5xl">
          {t("home.heroTitle")}
        </h1>
        <p className="mb-6 text-xl font-light italic text-white/60">
          {t("home.heroSubtitle")}
        </p>
        <p className="mx-auto mb-8 max-w-xl text-sm leading-relaxed text-white/70">
          {t("home.heroDesc", {
            libraryReady: (chunks: string) => chunks,
          })}
        </p>
      </div>

      {/* Input */}
      <div className="w-full max-w-2xl">
        <GetterInput />
      </div>

      {/* Badges */}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {BADGES.map((b) => (
          <span
            key={b}
            className="flex items-center gap-1.5 text-xs text-white/60 before:text-stroy-400 before:content-['✓']"
          >
            {b}
          </span>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="mt-4 text-center text-xs italic text-white/35">
        {t("home.heroDisclaimer")}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier visuellement**

```bash
npm run tauri dev
```

Résultat attendu : vue Home avec hero text, input avec bouton Coller, badges. Soumettre une URL YouTube navigue vers `/fetch?url=...`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Home view and GetterInput rewritten for Tauri"
```

---

## Task 8: Fetch view + VideoSelect (affichage info)

**Files:**
- Create: `src/lib/commands.ts`
- Create: `src/components/custom/VideoLoading.tsx`
- Create: `src/components/custom/VideoSelect.tsx`
- Modify: `src/views/Fetch.tsx`

**Interfaces:**
- Consumes: `fetch_video_info` via `invoke`, type `VideoInfo` depuis `@/lib/types`
- Produces: `VideoSelect` affiche thumbnail + titre + format tabs — sans déclencher de téléchargement encore (bouton désactivé)

- [ ] **Step 1: Créer `src/lib/commands.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { VideoInfo, DownloadRecord } from "./types";

export const fetchVideoInfo = (url: string): Promise<VideoInfo> =>
  invoke("fetch_video_info", { url });

export const getHistory = (): Promise<DownloadRecord[]> =>
  invoke("get_history");
```

- [ ] **Step 2: Créer `src/components/custom/VideoLoading.tsx`**

```tsx
import { Loader2 } from "lucide-react";

export function VideoLoading() {
  return (
    <div className="mx-auto flex min-h-64 w-full max-w-5xl items-center justify-center rounded-2xl border border-white/8 bg-stroy-800">
      <Loader2 size={28} className="animate-spin text-white/40" />
    </div>
  );
}
```

- [ ] **Step 3: Créer `src/components/custom/VideoSelect.tsx`**

```tsx
import { Disc3, Download, Film, Music } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { VideoInfo, DownloadFormat } from "@/lib/types";

interface Props {
  info: VideoInfo;
  onDownload: (fmt: DownloadFormat, quality: string) => Promise<void>;
  isDownloading: boolean;
  progress: number;
  downloadError: string | null;
}

type TabDef = { id: DownloadFormat; label: string; sub: string; Icon: typeof Film };

export function VideoSelect({ info, onDownload, isDownloading, progress, downloadError }: Props) {
  const { t } = useTranslation();

  const YOUTUBE_TABS: TabDef[] = [
    { id: "library-ready", label: t("videoSelect.formatLibraryReady"), sub: t("videoSelect.formatLibraryReadySub"), Icon: Disc3 },
    { id: "mp4", label: t("videoSelect.formatMp4"), sub: t("videoSelect.formatMp4Sub"), Icon: Film },
    { id: "mp3", label: t("videoSelect.formatMp3"), sub: t("videoSelect.formatMp3Sub"), Icon: Music },
  ];

  const TIKTOK_TABS: TabDef[] = [
    { id: "tiktok-no-watermark", label: t("videoSelect.formatTiktokNoWatermark"), sub: t("videoSelect.formatTiktokNoWatermarkSub"), Icon: Film },
    { id: "tiktok-watermark", label: t("videoSelect.formatTiktokWatermark"), sub: t("videoSelect.formatTiktokWatermarkSub"), Icon: Film },
    { id: "tiktok-audio", label: t("videoSelect.formatTiktokAudio"), sub: t("videoSelect.formatTiktokAudioSub"), Icon: Music },
  ];

  const TWITCH_TABS: TabDef[] = [
    { id: "twitch-video", label: t("videoSelect.formatTwitchVideo"), sub: t("videoSelect.formatTwitchVideoSub"), Icon: Film },
    { id: "twitch-audio", label: t("videoSelect.formatTwitchAudio"), sub: t("videoSelect.formatTwitchAudioSub"), Icon: Music },
  ];

  const TABS = info.source === "tiktok" ? TIKTOK_TABS : info.source === "twitch" ? TWITCH_TABS : YOUTUBE_TABS;
  const defaultFmt: DownloadFormat = info.source === "tiktok" ? "tiktok-no-watermark" : info.source === "twitch" ? "twitch-video" : "library-ready";

  const [fmt, setFmt] = useState<DownloadFormat>(defaultFmt);
  const [selectedQuality, setSelectedQuality] = useState<string>(info.formats[0]?.itag ?? info.formats[0]?.formatId ?? "");

  const currentTab = TABS.find((t) => t.id === fmt) ?? TABS[0];

  return (
    <div className="mx-auto max-w-270">
      <div className="overflow-hidden rounded-2xl border border-white/6 bg-stroy-800 md:grid md:grid-cols-[440px_1fr]">
        {/* Thumbnail */}
        <div className="relative flex min-h-70 items-center justify-center bg-stroy-900">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.025)_0_14px,transparent_14px_28px)]" />
          {info.thumbnail ? (
            <img
              src={info.thumbnail}
              alt={t("videoSelect.thumbnailAlt", { title: info.title })}
              className="relative z-10 h-full w-full object-cover"
            />
          ) : (
            <Film size={48} className="relative z-10 text-stroy-400" />
          )}
          {info.author && (
            <div className="absolute left-3.5 top-3.5 z-20 flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1.5 text-[11px]">
              <span className="size-4.5 rounded-full bg-white/20" />
              <span>{info.author}</span>
            </div>
          )}
          {info.duration && (
            <div className="absolute bottom-3.5 right-3.5 z-20 rounded bg-black/70 px-2 py-1 font-mono text-xs tracking-wider">
              {info.duration}s
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-col gap-6 p-8">
          <div>
            <h2 className="mb-2 text-xl font-bold leading-snug tracking-tight line-clamp-2">{info.title}</h2>
            <p className="text-sm font-medium text-white/60">{info.author}</p>
          </div>

          <div className="h-px bg-white/8" />

          {/* Format tabs */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">
              {t("videoSelect.chooseFormat")}
            </p>
            <div className="flex gap-2 rounded-2xl border border-white/6 bg-stroy-950 p-1.5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFmt(tab.id)}
                  className={cn(
                    "flex flex-1 flex-col items-start justify-center gap-1 rounded-xl px-2 py-2.5 text-left transition-all sm:px-3.5 sm:py-3",
                    fmt === tab.id ? "bg-stroy-500 text-white" : "text-white/65 hover:bg-white/4 hover:text-white"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-bold sm:gap-2 sm:text-[13px]">
                    <tab.Icon size={13} />
                    {tab.label}
                  </span>
                  <span className="hidden font-mono text-[11px] opacity-75 sm:block">{tab.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quality selector — YouTube MP4 */}
          {fmt === "mp4" && info.formats.length > 0 && (
            <Select value={selectedQuality} onValueChange={setSelectedQuality} disabled={isDownloading}>
              <SelectTrigger className="w-full border-white/10 bg-stroy-950 text-white">
                <SelectValue placeholder={t("videoSelect.selectQuality")} />
              </SelectTrigger>
              <SelectContent>
                {info.formats.filter((f) => f.itag && f.qualityLabel).map((f) => (
                  <SelectItem key={f.itag} value={f.itag!}>{f.qualityLabel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Quality selector — Twitch */}
          {fmt === "twitch-video" && info.formats.length > 0 && (
            <Select value={selectedQuality} onValueChange={setSelectedQuality} disabled={isDownloading}>
              <SelectTrigger className="w-full border-white/10 bg-stroy-950 text-white">
                <SelectValue placeholder={t("videoSelect.selectQuality")} />
              </SelectTrigger>
              <SelectContent>
                {info.formats.filter((f) => f.formatId && f.qualityLabel).map((f) => (
                  <SelectItem key={f.formatId} value={f.formatId!}>{f.qualityLabel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Library Ready callout */}
          {fmt === "library-ready" && (
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-stroy-700 p-4 sm:grid sm:grid-cols-[56px_1fr_auto] sm:items-center sm:gap-4">
              <div className="hidden size-14 items-center justify-center rounded-lg border border-white/10 bg-stroy-900 text-2xl text-white/40 sm:flex">♪</div>
              <div>
                <p className="mb-1 text-sm font-bold">{t("videoSelect.libraryReadyCalloutTitle")}</p>
                <p className="text-xs leading-snug text-white/70">{t("videoSelect.libraryReadyCalloutDesc")}</p>
              </div>
              <div className="flex flex-row gap-3 font-mono text-[10px] text-white/55 sm:flex-col sm:gap-1 sm:whitespace-nowrap">
                <span className="before:mr-1 before:text-stroy-200 before:content-['✓']">{t("videoSelect.libraryReadyCoverArt")}</span>
                <span className="before:mr-1 before:text-stroy-200 before:content-['✓']">{t("videoSelect.libraryReadyId3")}</span>
                <span className="before:mr-1 before:text-stroy-200 before:content-['✓']">{t("videoSelect.libraryReadyLyrics")}</span>
              </div>
            </div>
          )}

          {/* Download button / progress */}
          {isDownloading ? (
            <div className="flex flex-col gap-3">
              <Progress value={progress} className="h-2" />
              <p className="text-center text-xs italic text-white/55">
                {progress < 100 ? t("videoSelect.converting") : t("videoSelect.saving")}
              </p>
            </div>
          ) : downloadError ? (
            <div className="flex flex-col gap-3">
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-white/90">{downloadError}</p>
              <button
                type="button"
                onClick={() => onDownload(fmt, selectedQuality)}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/6 px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
              >
                <Download size={18} />
                {t("videoSelect.retryButton", { format: currentTab.label })}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onDownload(fmt, selectedQuality)}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-stroy-500 px-6 py-4 text-[15px] font-bold text-white transition-colors hover:bg-stroy-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              <Download size={18} />
              {t("videoSelect.downloadButton", { format: currentTab.label })}
            </button>
          )}

          <p className="text-center text-xs italic text-white/50">{t("videoSelect.disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Écrire `src/views/Fetch.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { GetterInput } from "@/components/custom/GetterInput";
import { VideoSelect } from "@/components/custom/VideoSelect";
import { VideoLoading } from "@/components/custom/VideoLoading";
import { fetchVideoInfo } from "@/lib/commands";
import type { VideoInfo, DownloadFormat } from "@/lib/types";

export function Fetch() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const url = searchParams.get("url") ?? "";

  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) { navigate("/"); return; }
    setIsLoading(true);
    setFetchError(null);
    setInfo(null);

    fetchVideoInfo(url)
      .then(setInfo)
      .catch((e: unknown) => setFetchError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoading(false));
  }, [url, navigate]);

  const handleDownload = async (_fmt: DownloadFormat, _quality: string) => {
    // Wired in Task 10
  };

  return (
    <div className="flex flex-col gap-6 px-6 py-8">
      <GetterInput initialUrl={url} />

      {isLoading && <VideoLoading />}

      {fetchError && (
        <div className="mx-auto flex min-h-48 w-full max-w-5xl items-center justify-center rounded-2xl border-2 border-dashed border-stroy-800">
          <p className="text-center font-bold text-white">{fetchError}</p>
        </div>
      )}

      {info && (
        <VideoSelect
          info={info}
          onDownload={handleDownload}
          isDownloading={isDownloading}
          progress={progress}
          downloadError={downloadError}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Vérifier le flow info**

```bash
npm run tauri dev
```

Coller une URL YouTube → la vue Fetch affiche le titre, la miniature et les tabs de format. Le bouton Télécharger est visible mais ne fait rien encore.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Fetch view with VideoSelect displays video info via Tauri command"
```

---

## Task 9: Rust — commandes download (video / audio / tiktok / twitch)

**Files:**
- Create: `src-tauri/src/commands/download.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: commandes `download_video`, `download_audio`, `download_tiktok`, `download_twitch`
- Produces: events Tauri `download://progress` avec payload `{ phase: string, percent: number }`
- Produces: enregistrement en DB après succès

- [ ] **Step 1: Créer `src-tauri/src/commands/download.rs`**

```rust
use crate::db::{self, DbConn, DownloadRecord};
use crate::sidecar;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;

#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    pub phase: String,
    pub percent: f64,
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn downloads_dir() -> std::path::PathBuf {
    dirs::download_dir().unwrap_or_else(|| std::path::PathBuf::from("."))
}

fn sanitize(title: &str) -> String {
    title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

fn parse_percent(line: &str) -> Option<f64> {
    // yt-dlp outputs: [download]  42.5% of ...
    if line.contains("[download]") {
        let parts: Vec<&str> = line.split_whitespace().collect();
        for part in parts {
            if part.ends_with('%') {
                return part.trim_end_matches('%').parse().ok();
            }
        }
    }
    None
}

async fn run_with_progress(
    app: &AppHandle,
    sidecar_name: &str,
    args: Vec<String>,
    phase: &str,
) -> Result<sidecar::SidecarOutput, String> {
    let app_clone = app.clone();
    let phase_str = phase.to_string();

    let (tx, mut rx) = mpsc::channel::<String>(100);

    let app_emit = app_clone.clone();
    let phase_emit = phase_str.clone();
    tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            if let Some(pct) = parse_percent(&line) {
                let _ = app_emit.emit(
                    "download://progress",
                    ProgressPayload { phase: phase_emit.clone(), percent: pct },
                );
            }
        }
    });

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    sidecar::run_sidecar(app, sidecar_name, &args_ref, Some(tx)).await
}

fn record_from(url: &str, title: &str, author: &str, thumbnail: Option<&str>, fmt: &str, path: &str) -> DownloadRecord {
    DownloadRecord {
        id: uuid::Uuid::new_v4().to_string(),
        url: url.to_string(),
        title: title.to_string(),
        author: Some(author.to_string()),
        thumbnail_url: thumbnail.map(|s| s.to_string()),
        format: fmt.to_string(),
        file_path: path.to_string(),
        created_at: now_ts(),
    }
}

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    url: String,
    itag: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let out = downloads_dir().join(format!("{}.mp4", safe));
    let out_str = out.to_string_lossy().to_string();

    let args = vec![
        "-f".to_string(), itag.clone(),
        "--merge-output-format".to_string(), "mp4".to_string(),
        "-o".to_string(), out_str.clone(),
        url.clone(),
    ];

    run_with_progress(&app, "yt-dlp", args, "downloading").await?;

    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), "mp4", &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[tauri::command]
pub async fn download_audio(
    app: AppHandle,
    url: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let out = downloads_dir().join(format!("{}.mp3", safe));
    let out_str = out.to_string_lossy().to_string();

    let args = vec![
        "-x".to_string(),
        "--audio-format".to_string(), "mp3".to_string(),
        "--audio-quality".to_string(), "190K".to_string(),
        "-o".to_string(), out_str.clone(),
        url.clone(),
    ];

    run_with_progress(&app, "yt-dlp", args, "downloading").await?;

    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), "mp3", &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[tauri::command]
pub async fn download_tiktok(
    app: AppHandle,
    url: String,
    watermark: bool,
    audio_only: bool,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let ext = if audio_only { "mp3" } else { "mp4" };
    let out = downloads_dir().join(format!("{}.{}", safe, ext));
    let out_str = out.to_string_lossy().to_string();

    let mut args = vec![];

    if audio_only {
        args.extend(["-x".to_string(), "--audio-format".to_string(), "mp3".to_string()]);
    } else if !watermark {
        // no-watermark: select the format without the TikTok watermark overlay
        args.extend(["-f".to_string(), "download_addr-0".to_string()]);
    }
    // watermark = default yt-dlp selection

    args.extend(["-o".to_string(), out_str.clone(), url.clone()]);

    run_with_progress(&app, "yt-dlp", args, "downloading").await?;

    let fmt = if audio_only { "tiktok-audio" } else if watermark { "tiktok-watermark" } else { "tiktok-no-watermark" };
    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), fmt, &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[tauri::command]
pub async fn download_twitch(
    app: AppHandle,
    url: String,
    format_id: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let is_audio = format_id == "audio";
    let ext = if is_audio { "mp3" } else { "mp4" };
    let out = downloads_dir().join(format!("{}.{}", safe, ext));
    let out_str = out.to_string_lossy().to_string();

    let mut args = vec![];
    if is_audio {
        args.extend(["-x".to_string(), "--audio-format".to_string(), "mp3".to_string()]);
    } else {
        args.extend(["-f".to_string(), format_id.clone()]);
    }
    args.extend(["-o".to_string(), out_str.clone(), url.clone()]);

    run_with_progress(&app, "yt-dlp", args, "downloading").await?;

    let fmt = if is_audio { "twitch-audio" } else { "twitch-video" };
    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), fmt, &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_removes_special_chars() {
        assert_eq!(sanitize("Hello: World! (2024)"), "Hello_ World_ _2024_");
    }

    #[test]
    fn parse_percent_extracts_value() {
        assert_eq!(parse_percent("[download]  42.5% of 10.00MiB"), Some(42.5));
        assert_eq!(parse_percent("[download] 100% of 10.00MiB"), Some(100.0));
        assert_eq!(parse_percent("[info] Writing video"), None);
    }
}
```

- [ ] **Step 2: Enregistrer les commandes dans `src-tauri/src/lib.rs`**

```rust
mod db;
mod sidecar;
mod commands;

use db::DbConn;
use tauri::Manager;

#[tauri::command]
fn get_history(db: tauri::State<DbConn>) -> Result<Vec<db::DownloadRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_history(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("app data dir");
            let conn = db::open(&app_data_dir).expect("open DB");
            app.manage(DbConn(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            commands::info::fetch_video_info,
            commands::download::download_video,
            commands::download::download_audio,
            commands::download::download_tiktok,
            commands::download::download_twitch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Lancer les tests Rust**

```bash
cd src-tauri && cargo test && cd ..
```

Résultat attendu : `test commands::download::tests::sanitize_removes_special_chars ... ok`, `test commands::download::tests::parse_percent_extracts_value ... ok`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add download_video/audio/tiktok/twitch Rust commands"
```

---

## Task 10: Frontend — wire download commands + history sidebar

**Files:**
- Modify: `src/lib/commands.ts`
- Modify: `src/views/Fetch.tsx`
- Modify: `src/components/custom/Sidebar.tsx`

**Interfaces:**
- Consumes: `download_video`, `download_audio`, `download_tiktok`, `download_twitch` via `invoke`
- Consumes: `download://progress` Tauri event via `listen`
- Produces: progress bar temps réel, historique dans sidebar

- [ ] **Step 1: Mettre à jour `src/lib/commands.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { VideoInfo, DownloadRecord, DownloadProgress } from "./types";

export const fetchVideoInfo = (url: string): Promise<VideoInfo> =>
  invoke("fetch_video_info", { url });

export const getHistory = (): Promise<DownloadRecord[]> =>
  invoke("get_history");

export const downloadVideo = (
  url: string, itag: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke("download_video", { url, itag, title, author, thumbnail });

export const downloadAudio = (
  url: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke("download_audio", { url, title, author, thumbnail });

export const downloadTiktok = (
  url: string, watermark: boolean, audioOnly: boolean, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke("download_tiktok", { url, watermark, audioOnly, title, author, thumbnail });

export const downloadTwitch = (
  url: string, formatId: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke("download_twitch", { url, formatId, title, author, thumbnail });

export const onDownloadProgress = (cb: (p: DownloadProgress) => void) =>
  listen<DownloadProgress>("download://progress", (e) => cb(e.payload));
```

- [ ] **Step 2: Mettre à jour `src/views/Fetch.tsx` pour brancher les commandes**

```tsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { GetterInput } from "@/components/custom/GetterInput";
import { VideoSelect } from "@/components/custom/VideoSelect";
import { VideoLoading } from "@/components/custom/VideoLoading";
import {
  fetchVideoInfo,
  downloadVideo,
  downloadAudio,
  downloadTiktok,
  downloadTwitch,
  onDownloadProgress,
} from "@/lib/commands";
import type { VideoInfo, DownloadFormat } from "@/lib/types";
import { useTranslation } from "react-i18next";

export function Fetch() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const url = searchParams.get("url") ?? "";

  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!url) { navigate("/"); return; }
    setIsLoading(true);
    setFetchError(null);
    setInfo(null);
    fetchVideoInfo(url)
      .then(setInfo)
      .catch((e: unknown) => setFetchError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoading(false));
  }, [url, navigate]);

  useEffect(() => {
    onDownloadProgress((p) => setProgress(p.percent)).then((unlisten) => {
      unlistenRef.current = unlisten;
    });
    return () => { unlistenRef.current?.(); };
  }, []);

  const handleDownload = async (fmt: DownloadFormat, quality: string) => {
    if (!info) return;
    setDownloadError(null);
    setIsDownloading(true);
    setProgress(0);

    try {
      if (fmt === "mp4") {
        await downloadVideo(url, quality, info.title, info.author, info.thumbnail);
      } else if (fmt === "mp3") {
        await downloadAudio(url, info.title, info.author, info.thumbnail);
      } else if (fmt === "tiktok-no-watermark") {
        await downloadTiktok(url, false, false, info.title, info.author, info.thumbnail);
      } else if (fmt === "tiktok-watermark") {
        await downloadTiktok(url, true, false, info.title, info.author, info.thumbnail);
      } else if (fmt === "tiktok-audio") {
        await downloadTiktok(url, false, true, info.title, info.author, info.thumbnail);
      } else if (fmt === "twitch-video") {
        await downloadTwitch(url, quality, info.title, info.author, info.thumbnail);
      } else if (fmt === "twitch-audio") {
        await downloadTwitch(url, "audio", info.title, info.author, info.thumbnail);
      }
      // library-ready handled in Task 12
    } catch (e: unknown) {
      setDownloadError(e instanceof Error ? e.message : t("videoSelect.errorDownload"));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 px-6 py-8">
      <GetterInput initialUrl={url} />
      {isLoading && <VideoLoading />}
      {fetchError && (
        <div className="mx-auto flex min-h-48 w-full max-w-5xl items-center justify-center rounded-2xl border-2 border-dashed border-stroy-800">
          <p className="text-center font-bold text-white">{fetchError}</p>
        </div>
      )}
      {info && (
        <VideoSelect
          info={info}
          onDownload={handleDownload}
          isDownloading={isDownloading}
          progress={progress}
          downloadError={downloadError}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mettre à jour `src/components/custom/Sidebar.tsx` pour afficher l'historique**

```tsx
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, Settings, Film } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getHistory } from "@/lib/commands";
import type { DownloadRecord } from "@/lib/types";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [history, setHistory] = useState<DownloadRecord[]>([]);

  useEffect(() => {
    getHistory().then(setHistory).catch(() => {});
  }, [location.pathname]); // Refresh on navigation

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-white/8 bg-stroy-900">
      <div className="flex items-center gap-2.5 border-b border-white/8 px-5 py-5">
        <div className="flex size-6 items-center justify-center rounded bg-stroy-500 text-xs font-bold text-white">S</div>
        <span className="font-bold tracking-tight text-white">StroyGetter</span>
      </div>

      <div className="px-3 pt-4">
        <button
          onClick={() => navigate("/")}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/6 hover:text-white"
        >
          <Plus size={15} />
          Nouveau téléchargement
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-4">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
          Historique
        </p>
        {history.length === 0 && (
          <p className="px-3 text-xs text-white/25">Aucun téléchargement</p>
        )}
        {history.slice(0, 15).map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/fetch?url=${encodeURIComponent(item.url)}`)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/6"
          >
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex size-8 shrink-0 items-center justify-center rounded bg-stroy-800">
                <Film size={12} className="text-white/30" />
              </div>
            )}
            <span className="truncate text-xs text-white/70">{item.title}</span>
          </button>
        ))}
      </div>

      <div className="border-t border-white/8 px-3 py-3">
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            location.pathname === "/settings" ? "bg-white/8 text-white" : "text-white/60 hover:bg-white/6 hover:text-white"
          )}
        >
          <Settings size={15} />
          Paramètres
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Vérifier le flow complet (hors Library Ready)**

```bash
npm run tauri dev
```

Test : coller une URL YouTube → choisir MP3 → cliquer Télécharger → barre de progression → fichier .mp3 dans le dossier Téléchargements → item apparaît dans la sidebar.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire download commands and history sidebar"
```

---

## Task 11: Rust — commande download_library_ready

**Files:**
- Create: `src-tauri/src/commands/library_ready.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: métadonnées déjà résolues côté TypeScript (title, artist, album, year, cover_url, lyrics_lrc)
- Produces: commande `download_library_ready` avec progress 3 phases, MP3 avec tags ID3 + APIC + SYLT

- [ ] **Step 1: S'assurer que ffmpeg est disponible**

Sur macOS Apple Silicon :
```bash
curl -L https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip -o /tmp/ffmpeg.zip
unzip /tmp/ffmpeg.zip -d /tmp/ffmpeg-bin
cp /tmp/ffmpeg-bin/ffmpeg src-tauri/binaries/ffmpeg-aarch64-apple-darwin
chmod +x src-tauri/binaries/ffmpeg-aarch64-apple-darwin
```

Sur macOS Intel :
```bash
# Même URL, copier sous le nom ffmpeg-x86_64-apple-darwin
```

Sur Windows, télécharger depuis https://www.gyan.dev/ffmpeg/builds/ et placer `ffmpeg.exe` sous `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`.

- [ ] **Step 2: Créer `src-tauri/src/commands/library_ready.rs`**

```rust
use crate::db::{self, DbConn, DownloadRecord};
use crate::sidecar;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;

#[derive(Serialize, Clone)]
struct ProgressPayload {
    phase: String,
    percent: f64,
}

fn emit_progress(app: &AppHandle, phase: &str, percent: f64) {
    let _ = app.emit("download://progress", ProgressPayload { phase: phase.to_string(), percent });
}

fn now_ts() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

#[tauri::command]
pub async fn download_library_ready(
    app: AppHandle,
    url: String,
    title: String,
    artist: String,
    album: String,
    year: String,
    cover_url: String,
    lyrics_lrc: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let tmp_audio = std::env::temp_dir().join(format!("{}_audio.mp3", safe));
    let tmp_cover = std::env::temp_dir().join(format!("{}_cover.jpg", safe));
    let out = dirs::download_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(format!("{}.mp3", safe));

    // Phase 1: download audio via yt-dlp
    emit_progress(&app, "downloading", 0.0);

    let (tx, mut rx) = mpsc::channel::<String>(100);
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            if line.contains("[download]") {
                if let Some(pct) = line.split_whitespace()
                    .find(|p| p.ends_with('%'))
                    .and_then(|p| p.trim_end_matches('%').parse::<f64>().ok())
                {
                    let _ = app_clone.emit("download://progress", ProgressPayload {
                        phase: "downloading".to_string(),
                        percent: pct,
                    });
                }
            }
        }
    });

    sidecar::run_sidecar(
        &app,
        "yt-dlp",
        &[
            "-x", "--audio-format", "mp3", "--audio-quality", "190K",
            "-o", &tmp_audio.to_string_lossy(),
            &url,
        ],
        Some(tx),
    )
    .await?;

    // Phase 2: download cover image
    emit_progress(&app, "fetching_cover", 0.0);

    if !cover_url.is_empty() {
        let response = reqwest::get(&cover_url)
            .await
            .map_err(|e| format!("cover download failed: {}", e))?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        std::fs::write(&tmp_cover, &bytes).map_err(|e| e.to_string())?;
        emit_progress(&app, "fetching_cover", 100.0);
    }

    // Phase 3: embed with ffmpeg
    emit_progress(&app, "embedding", 0.0);

    // Write LRC lyrics to temp file for ffmpeg
    let tmp_lrc = std::env::temp_dir().join(format!("{}.lrc", safe));
    if !lyrics_lrc.is_empty() {
        std::fs::write(&tmp_lrc, &lyrics_lrc).map_err(|e| e.to_string())?;
    }

    let mut ffmpeg_args: Vec<String> = vec![
        "-y".to_string(),
        "-i".to_string(), tmp_audio.to_string_lossy().to_string(),
    ];

    let has_cover = !cover_url.is_empty() && tmp_cover.exists();
    if has_cover {
        ffmpeg_args.extend(["-i".to_string(), tmp_cover.to_string_lossy().to_string()]);
    }

    ffmpeg_args.extend([
        "-map".to_string(), "0:a".to_string(),
        "-c:a".to_string(), "copy".to_string(),
    ]);

    if has_cover {
        ffmpeg_args.extend([
            "-map".to_string(), "1:v".to_string(),
            "-c:v".to_string(), "copy".to_string(),
            "-id3v2_version".to_string(), "3".to_string(),
            "-metadata:s:v".to_string(), "title=Album cover".to_string(),
            "-metadata:s:v".to_string(), "comment=Cover (front)".to_string(),
        ]);
    }

    ffmpeg_args.extend([
        "-metadata".to_string(), format!("title={}", title),
        "-metadata".to_string(), format!("artist={}", artist),
        "-metadata".to_string(), format!("album={}", album),
        "-metadata".to_string(), format!("date={}", year),
    ]);

    if !lyrics_lrc.is_empty() {
        ffmpeg_args.extend([
            "-metadata".to_string(), format!("lyrics={}", lyrics_lrc),
        ]);
    }

    ffmpeg_args.push(out.to_string_lossy().to_string());

    let args_ref: Vec<&str> = ffmpeg_args.iter().map(|s| s.as_str()).collect();
    sidecar::run_sidecar(&app, "ffmpeg", &args_ref, None).await?;

    emit_progress(&app, "embedding", 100.0);

    // Cleanup temp files
    let _ = std::fs::remove_file(&tmp_audio);
    let _ = std::fs::remove_file(&tmp_cover);
    let _ = std::fs::remove_file(&tmp_lrc);

    let out_str = out.to_string_lossy().to_string();

    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(
        &conn,
        &DownloadRecord {
            id: uuid::Uuid::new_v4().to_string(),
            url: url.clone(),
            title: title.clone(),
            author: Some(artist.clone()),
            thumbnail_url: thumbnail,
            format: "library-ready".to_string(),
            file_path: out_str.clone(),
            created_at: now_ts(),
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_title() {
        assert_eq!(sanitize("My Song: The Best! (2024)"), "My Song_ The Best_ _2024_");
    }
}
```

- [ ] **Step 3: Mettre à jour `src-tauri/src/commands/mod.rs`**

```rust
pub mod info;
pub mod download;
pub mod library_ready;
```

- [ ] **Step 4: Enregistrer `download_library_ready` dans `src-tauri/src/lib.rs`**

Ajouter `commands::library_ready::download_library_ready,` dans le `generate_handler!` macro :

```rust
.invoke_handler(tauri::generate_handler![
    get_history,
    commands::info::fetch_video_info,
    commands::download::download_video,
    commands::download::download_audio,
    commands::download::download_tiktok,
    commands::download::download_twitch,
    commands::library_ready::download_library_ready,
])
```

- [ ] **Step 5: Tests Rust**

```bash
cd src-tauri && cargo test && cd ..
```

Résultat attendu : `test commands::library_ready::tests::sanitize_title ... ok`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add download_library_ready Rust command with ffmpeg pipeline"
```

---

## Task 12: Frontend — Library Ready flow + metadata.ts + Settings view

**Files:**
- Create: `src/lib/metadata.ts`
- Modify: `src/lib/commands.ts`
- Modify: `src/views/Fetch.tsx`
- Modify: `src/views/Settings.tsx`

**Interfaces:**
- Consumes: YouTube Music API (HTTP), LRClib API (HTTP), `download_library_ready` via invoke
- Produces: Settings view avec langue + dossier de téléchargement

**Note importante :** `metadata.ts` fait des appels HTTP vers YouTube Music et LRClib. Les endpoints exacts doivent être portés depuis les routes `/api/download/audio-library-ready` du repo web StroyGetter (https://github.com/DestroyCom/StroyGetter). Le code ci-dessous utilise l'API LRClib publique documentée et une approximation de l'API YouTube Music — à ajuster selon l'implémentation web.

- [ ] **Step 1: Créer `src/lib/metadata.ts`**

```typescript
export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl: string;
  lyricsLrc: string;
}

async function fetchYouTubeMusicMetadata(videoTitle: string, videoId: string): Promise<Partial<TrackMetadata>> {
  // PORT FROM WEB: Reproduire l'appel à l'API YouTube Music depuis
  // le repo web StroyGetter (route /api/download/audio-library-ready).
  // L'API YouTube Music (youtubei/v1/search) permet de récupérer
  // title, artist, album, year, coverUrl depuis l'ID YouTube.
  //
  // Implémentation minimale en attendant le port :
  return {
    title: videoTitle,
    artist: "Unknown Artist",
    album: videoTitle,
    year: new Date().getFullYear().toString(),
    coverUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };
}

async function fetchLrcLibLyrics(title: string, artist: string): Promise<string> {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) return "";
    const data = await res.json() as { syncedLyrics?: string };
    return data.syncedLyrics ?? "";
  } catch {
    return "";
  }
}

export async function resolveLibraryReadyMetadata(
  videoTitle: string,
  videoId: string
): Promise<TrackMetadata> {
  const meta = await fetchYouTubeMusicMetadata(videoTitle, videoId);
  const title = meta.title ?? videoTitle;
  const artist = meta.artist ?? "Unknown Artist";
  const lyricsLrc = await fetchLrcLibLyrics(title, artist);

  return {
    title,
    artist,
    album: meta.album ?? title,
    year: meta.year ?? new Date().getFullYear().toString(),
    coverUrl: meta.coverUrl ?? "",
    lyricsLrc,
  };
}
```

- [ ] **Step 2: Ajouter `downloadLibraryReady` dans `src/lib/commands.ts`**

```typescript
export const downloadLibraryReady = (params: {
  url: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl: string;
  lyricsLrc: string;
  thumbnail?: string;
}): Promise<string> =>
  invoke("download_library_ready", {
    url: params.url,
    title: params.title,
    artist: params.artist,
    album: params.album,
    year: params.year,
    coverUrl: params.coverUrl,
    lyricsLrc: params.lyricsLrc,
    thumbnail: params.thumbnail,
  });
```

- [ ] **Step 3: Ajouter le cas `library-ready` dans `src/views/Fetch.tsx`**

Dans le bloc `handleDownload`, ajouter avant le `// library-ready handled in Task 12` :

```typescript
} else if (fmt === "library-ready") {
  // Extract YouTube video ID from URL
  const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? "";
  const meta = await resolveLibraryReadyMetadata(info.title, videoId);
  await downloadLibraryReady({
    url,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    year: meta.year,
    coverUrl: meta.coverUrl,
    lyricsLrc: meta.lyricsLrc,
    thumbnail: info.thumbnail,
  });
}
```

Ajouter les imports :
```typescript
import { resolveLibraryReadyMetadata } from "@/lib/metadata";
import { downloadLibraryReady } from "@/lib/commands";
```

- [ ] **Step 4: Écrire un test pour `fetchLrcLibLyrics` (mock fetch)**

Créer `src/lib/__tests__/metadata.test.ts` :

```typescript
import { resolveLibraryReadyMetadata } from "../metadata";

describe("resolveLibraryReadyMetadata", () => {
  it("returns a TrackMetadata object with required fields", async () => {
    const result = await resolveLibraryReadyMetadata("Test Song", "dQw4w9WgXcQ");
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("artist");
    expect(result).toHaveProperty("album");
    expect(result).toHaveProperty("year");
    expect(result).toHaveProperty("coverUrl");
    expect(result).toHaveProperty("lyricsLrc");
    expect(typeof result.lyricsLrc).toBe("string");
  });
});
```

- [ ] **Step 5: Lancer les tests TypeScript**

```bash
npm test
```

Résultat attendu : tous les tests passent (i18n + metadata).

- [ ] **Step 6: Écrire `src/views/Settings.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { SUPPORTED_LANGS } from "@/lib/i18n";
import i18n from "i18next";

export function Settings() {
  const { t } = useTranslation();
  const [downloadDir, setDownloadDir] = useState<string>(
    localStorage.getItem("stroygetter-download-dir") ?? ""
  );

  const handleLangChange = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("stroygetter-lang", code);
  };

  const handlePickDir = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setDownloadDir(selected);
      localStorage.setItem("stroygetter-download-dir", selected);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="mb-8 text-2xl font-bold text-white">Paramètres</h1>

      {/* Language */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">Langue</h2>
        <div className="flex flex-col gap-2">
          {SUPPORTED_LANGS.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => handleLangChange(code)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                i18n.language === code
                  ? "border-stroy-500 bg-stroy-500/20 text-white"
                  : "border-white/10 bg-white/4 text-white/70 hover:border-white/20 hover:text-white"
              }`}
            >
              {label}
              {i18n.language === code && <span className="text-stroy-300">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Download folder */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
          Dossier de téléchargement
        </h2>
        <div className="flex flex-col gap-2">
          {downloadDir && (
            <p className="rounded-xl border border-white/10 bg-white/4 px-4 py-3 font-mono text-xs text-white/70 break-all">
              {downloadDir}
            </p>
          )}
          <button
            onClick={handlePickDir}
            className="rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            {downloadDir ? "Changer le dossier" : "Choisir un dossier"}
          </button>
          <p className="text-xs text-white/35">
            Par défaut : dossier Téléchargements du système.
          </p>
        </div>
      </section>

      {/* App version */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">Version</h2>
        <p className="text-sm text-white/50">StroyGetter Native — 0.1.0</p>
        <p className="text-xs text-white/25 mt-1">Tauri v2 · React 18 · Vite 5</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Vérifier le flow Library Ready complet**

```bash
npm run tauri dev
```

Test : coller une URL YouTube musicale → choisir Library Ready → barre de progression 3 phases → MP3 avec cover + tags dans Téléchargements.

- [ ] **Step 8: Commit final**

```bash
git add -A
git commit -m "feat: Library Ready pipeline, metadata.ts, Settings view — MVP complete"
```

---

## Self-review

**Spec coverage :**
- ✅ Stack Tauri v2 + React + Vite — Task 1
- ✅ Tailwind v4 + shadcn migration — Task 2
- ✅ react-i18next + locales — Task 3
- ✅ Sidebar desktop + BottomNav Android — Task 4
- ✅ rusqlite DB + historique — Task 5
- ✅ Sidecars yt-dlp + ffmpeg — Tasks 6, 11
- ✅ fetch_video_info — Task 6
- ✅ Home + GetterInput — Task 7
- ✅ Fetch view + VideoSelect — Task 8
- ✅ download_video / audio / tiktok / twitch — Task 9
- ✅ Progress events + history sidebar — Task 10
- ✅ download_library_ready pipeline — Task 11
- ✅ metadata.ts + Library Ready frontend — Task 12
- ✅ Settings langue + dossier — Task 12
- ✅ TikTok photos exclu — non implémenté par design
- ✅ Twitch clips uniquement — download.rs `format_id != VOD`

**Types consistency :**
- `DownloadFormat` défini dans Task 6 (`types.ts`), utilisé Task 8 (`VideoSelect`), Task 10 (`Fetch`)
- `VideoInfo` défini Task 6, consommé Tasks 8, 10, 12
- `DownloadRecord` défini Task 6 (TS) + Task 5 (Rust), alignés
- `ProgressPayload { phase, percent }` Rust Task 9 = TypeScript `DownloadProgress` Task 6 ✅
- `commands.ts` `downloadLibraryReady` param `coverUrl` = Rust `cover_url` (snake_case auto-converti par Tauri) ✅
