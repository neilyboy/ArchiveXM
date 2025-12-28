/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sxm': {
          'dark': '#0a0a0f',
          'darker': '#050508',
          'card': '#12121a',
          'border': '#1e1e2e',
          'accent': '#6366f1',
          'accent-hover': '#818cf8',
          'success': '#22c55e',
          'warning': '#f59e0b',
          'error': '#ef4444'
        }
      }
    },
  },
  plugins: [],
}
