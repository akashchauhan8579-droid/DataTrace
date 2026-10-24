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
        paper: '#EFEBE2',
        'paper-2': '#E6E1D6',
        ink: '#1B1814',
        'muted-ink': '#6B645A',
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
        hairline: 'rgba(27,24,20,0.14)',
      },
    },
  },
  plugins: [],
};

export default config;
