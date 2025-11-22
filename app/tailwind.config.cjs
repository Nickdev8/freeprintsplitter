/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', "Manrope", "Inter", "sans-serif"],
        body: ["Manrope", "Inter", "sans-serif"]
      },
      colors: {
        ink: "#0f0e12",
        mist: "#f3f2ff",
        dusk: "#2b2a38"
      }
    }
  },
  plugins: []
};
