---
description: "Use when editing or adding React components, pages, contexts, hooks, API clients, or tests in packages/web. Covers the request<T>() pattern, MSW handlers, custom render util, and Tailwind v4 conventions."
applyTo: "packages/web/**"
---
# Web Guidelines (`packages/web`)

## Stack

React 19 + Vite 6 + React Router v7 + Tailwind CSS v4. Dev server proxies `/api` → `http://localhost:3001` ([vite.config.ts](../../packages/web/vite.config.ts)).

## Folder Conventions

- `src/api/` — typed fetch clients, one file per resource (`families.ts`, `meals.ts`, `weekPlan.ts`, `grocery.ts`).
- `src/components/` — reusable presentational + small interactive components.
- `src/context/` — React contexts (`AuthContext`, `ThemeContext`, `ToastContext`, `WeekContext`). Each exports a Provider and a `useX()` hook.
- `src/hooks/` — cross-cutting hooks (e.g. `useFamily`).
- `src/pages/` — route-level components, wired in [src/App.tsx](../../packages/web/src/App.tsx).
- `src/test-utils/` — custom `render()` that wraps providers; use it in component tests.

## API Client Pattern

Reuse the local `request<T>()` helper inside each `src/api/*.ts` file. It already sets `credentials: 'include'` and JSON headers, and parses errors. Don't call `fetch` directly from components or pages.

```ts
const API_BASE = '/api/meals';
export async function listMeals(familyId: string): Promise<Meal[]> {
  return request<Meal[]>(`${API_BASE}?familyId=${familyId}`);
}
```

## Tests

- Vitest with `globals: true` — `describe`/`it`/`expect` are global.
- Environment: `jsdom`. Setup at [tests/setup.ts](../../packages/web/tests/setup.ts) — `@testing-library/jest-dom/vitest`, `window.matchMedia` polyfill, MSW server lifecycle, `localStorage.clear()` after each test.
- **Network: MSW only.** Add or override handlers in [tests/msw](../../packages/web/tests/msw) (typically `handlers.ts` + `server.ts`). Do not stub `global.fetch` directly.
- Component tests use the custom render from `src/test-utils/` to get providers (Auth/Theme/Toast/Week) for free.
- Hooks: `renderHook` from `@testing-library/react` with the custom wrapper when context is needed.

## Conventions

- Tailwind v4 — utility classes inline. No separate CSS modules; only [src/index.css](../../packages/web/src/index.css) imports Tailwind.
- Theme toggling routes through `ThemeContext`; do not read/write `document.documentElement.classList` from components directly.
- Toasts go through `useToast()` from `ToastContext` — never call DOM-mutating notification APIs.
- Protected routes wrap pages with `ProtectedRoute` in `App.tsx`; do not reimplement auth gating per page.
