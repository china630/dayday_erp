/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#34495E", // DESIGN.md — Slate Blue
        secondary: "#EBEDF0", // DESIGN.md — system gray background
        muted: "#7F8C8D",
        /** Strong blue CTAs; `action-hover` for pressed / hover states */
        action: {
          DEFAULT: "#2980B9",
          hover: "#2471A3",
        },
        accent: "#14b8a6", // ₼ highlight
      },
      boxShadow: {
        md: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
      },
      borderRadius: {
        xl: "1rem",
      },
    },
  },
  plugins: [],
};

