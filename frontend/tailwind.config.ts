import type { Config } from "tailwindcss";

// AlertGuard design tokens — Frontend PRD Section 3.
// Keep these hex values in sync with the mobile app's Compose theme so the
// two surfaces never visually drift apart (PRD Section 9).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0F1A",
        "ink-2": "#141B2E",
        "ink-3": "#1B2338",
        fog: "#EDE7DB",
        mist: "#8891A6",
        line: "rgba(237,231,219,0.14)",
        accent: "#F2A93B",
        brake: "#C1443B",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-space-grotesk)", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        btn: "10px",
      },
      spacing: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
