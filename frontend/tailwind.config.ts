import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F2E9D0',
        'paper-2': '#E9DFC4',
        'paper-card': '#EDE3C8',
        ink: '#1C1A17',
        'muted-ink': '#5E574A',
        night: '#0C0B0A',
        'night-2': '#151311',
        'on-night': '#EDE6DA',
        amber: '#D98A4E',
        copper: '#B5562F',
        umber: '#6E3B2A',
      },
      fontFamily: {
        serif: ['Fraunces', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderColor: {
        hairline: 'rgba(140,120,76,0.22)',
      },
    },
  },
  plugins: [],
};

export default config;
