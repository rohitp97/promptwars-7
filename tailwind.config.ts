import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Text/background pairs are checked against WCAG AA in src/__tests__/contrast.test.ts.
      colors: {
        paper: '#f3f6f5',
        card: '#ffffff',
        ink: '#16232a',
        muted: '#475861',
        line: '#d5dfe2',
        brand: '#0b5566',
        brandSoft: '#e0eff2',
        // AQI categories: dark text on a soft tint (badges) …
        good: '#1b6635',
        goodSoft: '#e1f3e6',
        satisfactory: '#466410',
        satisfactorySoft: '#edf5da',
        moderate: '#735400',
        moderateSoft: '#fcf1cc',
        poor: '#8f4300',
        poorSoft: '#fde6d3',
        veryPoor: '#9e1f27',
        veryPoorSoft: '#fbe2e3',
        severe: '#6a0f31',
        severeSoft: '#f5dde7',
        warn: '#7a4b00',
        warnSoft: '#fdf0d5',
      },
      fontFamily: {
        // System fonts only: no third-party font requests; Windows/Android ship Devanagari faces.
        sans: ['system-ui', '"Segoe UI"', '"Nirmala UI"', '"Noto Sans Devanagari"', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { rise: 'rise 0.25s ease-out' },
    },
  },
  plugins: [],
} satisfies Config
