import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: "#0e3a68",
          light: "#1c5490",
        },
        chip: {
          gold: "#e8b923",
        },
      },
    },
  },
  plugins: [],
};

export default config;
