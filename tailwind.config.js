/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-dark': '#0f0f13',
        'brand-card': '#1a1a24',
        'brand-purple': '#7b2cbf',
        'brand-light-purple': '#9d4edd'
      }
    },
  },
  plugins: [],
}
