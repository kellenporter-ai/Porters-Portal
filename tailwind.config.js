
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      keyframes: {
        'glass-turn': {
          '0%': { opacity: '0', transform: 'perspective(1000px) rotateY(-30deg) translateX(-50px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'perspective(1000px) rotateY(0) translateX(0) scale(1)' },
        },
        'fade-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6', boxShadow: '0 0 15px 0 currentColor' },
          '50%': { opacity: '1', boxShadow: '0 0 25px 5px currentColor' },
        },
      },
      animation: {
        'glass-turn': 'glass-turn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'fade-slide-up': 'fade-slide-up 0.6s ease-out forwards',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
