import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // `no-undef` catches references to identifiers that were never declared or
  // imported. eslint-config-next omits it because a TypeScript project gets this
  // from the compiler — but this app is plain JS, so nothing else does.
  //
  // It earned its place the hard way: moving the globe's zoom helpers into
  // globeVisibility.js left two footer labels still calling `minVisibleCount`,
  // which had been deleted from Globe.jsx. The production build succeeded and
  // `next lint` was clean, because neither tool resolves identifiers at all.
  // The page then threw "minVisibleCount is not defined" on every render of the
  // region and city tiers — i.e. exactly when you zoomed in.
  {
    rules: {
      "no-undef": "error",
    },
  },
  // Pre-existing backlog, demoted to warnings so the lint gate is usable.
  //
  // Turning on the rules above surfaced 93 errors, every one of them already in
  // the tree. That is exactly why nobody was running lint: a gate that has never
  // been green gets ignored, and then it catches nothing — which is how a
  // deleted function reference shipped to production in the first place.
  //
  // These are the newer compiler-era advisory rules plus one cosmetic JSX rule.
  // They are worth working through, but not at the cost of the gate never
  // passing again, so they report without blocking. `no-undef` stays an error
  // because it is the rule that catches a reference to something that does not
  // exist, which is a crash rather than a style preference.
  //
  // Re-promote these to "error" once the backlog is cleared.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Built desktop bundles and vendored deps are not ours to lint.
    "desktop/src-tauri/target/**",
    "**/node_modules/**",
  ]),
]);

export default eslintConfig;
