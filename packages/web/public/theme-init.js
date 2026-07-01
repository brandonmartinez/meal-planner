// Pre-hydration theme bootstrap. Runs before first paint to add the `dark`
// class so the initial render matches the user's stored/system preference and
// avoids a light-mode flash (FOUC). ThemeContext takes over once React mounts.
//
// This lives as an external file (rather than an inline <script>) on purpose:
// the API serves the SPA under a strict Content-Security-Policy with
// `script-src 'self'` and no `'unsafe-inline'`. An inline script would be
// blocked; an external same-origin file is allowed. Keep this logic in sync
// with getStoredTheme/getSystemTheme in src/context/ThemeContext.tsx.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark = stored === "dark" || (stored !== "light" && prefersDark);
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
