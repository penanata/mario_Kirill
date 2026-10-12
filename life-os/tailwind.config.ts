import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "ui-serif", "Georgia"],
      },
      colors: {
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        surface: "var(--surface)",
        canvas: "var(--bg)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        warn: "var(--warn)",
        danger: "var(--danger)",
        good: "var(--good)",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.65) inset, 0 12px 40px rgba(48, 36, 22, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
