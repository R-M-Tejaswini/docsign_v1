/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        success: '#10b981',
        warning: '#f59e0b',
      },
    },
  },
  plugins: [],
}