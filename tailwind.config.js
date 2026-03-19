
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1440px',   // bumped from 1280 — Chromebooks (1366px) stay in lg tier
      '2xl': '1920px',  // bumped from 1536 — HD monitors stay in xl tier
    },
    extend: {
      colors: {
        surface: {
          base: 'var(--surface-base)',
          raised: 'var(--surface-raised)',
          sunken: 'var(--surface-sunken)',
          overlay: 'var(--surface-overlay)',
          glass: 'var(--surface-glass)',
          'glass-heavy': 'var(--surface-glass-heavy)',
        },
        theme: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          muted: 'var(--text-muted)',
          inverted: 'var(--text-inverted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          muted: 'var(--accent-muted)',
          text: 'var(--accent-text)',
        },
        'theme-border': {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
          accent: 'var(--border-accent)',
        },
        sidebar: {
          bg: 'var(--sidebar-bg)',
          text: 'var(--sidebar-text)',
          border: 'var(--sidebar-border)',
        },
      },
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
