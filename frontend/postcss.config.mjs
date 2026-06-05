// Tailwind v4 runs as a PostCSS plugin. Next.js picks this config up
// automatically for all CSS imported in the app.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
