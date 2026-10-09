import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "docs/**"] },
  {
    // Naming the React version skips the plugin's auto-detection, which ESLint 10 no longer supports.
    settings: { react: { version: "19.3" } },
    rules: {
      // Reading the theme class, the rail state or "mounted" after hydration is a one-time sync with the DOM.
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
];

export default config;
