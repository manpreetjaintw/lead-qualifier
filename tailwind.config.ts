import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        accent: "hsl(var(--accent))",
        card: "hsl(var(--card))",
        hot: { DEFAULT: "hsl(var(--hot))", bg: "hsl(var(--hot-bg))" },
        warm: { DEFAULT: "hsl(var(--warm))", bg: "hsl(var(--warm-bg))" },
        cold: { DEFAULT: "hsl(var(--cold))", bg: "hsl(var(--cold-bg))" },
        bad: { DEFAULT: "hsl(var(--bad))", bg: "hsl(var(--bad-bg))" },
      },
      borderRadius: { lg: "0.75rem", md: "0.5rem", sm: "0.375rem" },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
