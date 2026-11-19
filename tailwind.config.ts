import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--c-text)",
        muted: "var(--c-muted)",
        canvas: "var(--c-bg)",
        surface: "var(--c-surface)",
        line: "var(--c-border)",
        primary: "var(--c-primary)",
        onprimary: "var(--c-on-primary)",
        accent: "var(--c-accent)",
        success: "var(--c-success)",
        danger: "var(--c-danger)",
        "primary-soft": "var(--c-primary-soft)",
        "accent-soft": "var(--c-accent-soft)",
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(55,31,23,0.04), 0 12px 28px -18px rgba(55,31,23,0.25)",
        lift: "0 2px 6px rgba(55,31,23,0.06), 0 24px 48px -24px rgba(55,31,23,0.35)",
      },
      maxWidth: {
        content: "1200px",
        wide: "1440px",
      },
    },
  },
  plugins: [],
};

export default config;
