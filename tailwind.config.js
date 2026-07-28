/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: 'jit',
  important: true,
  content: ['./public/**/*.html', './src/**/*.{js,jsx,ts,tsx,mdx}'],
  theme: {
    fontFamily: {
      display: [
        '"Alte Haas Grotesk"',
        'Helvetica',
        'Arial',
        'system-ui',
        'sans-serif',
      ],
      ui: ['Manrope', 'system-ui', 'sans-serif'],
      micro: ['Inter', 'sans-serif'],
      inter: ['Inter', 'sans-serif'],
      sans: ['Manrope', 'Helvetica', 'Arial', 'system-ui', 'sans-serif'],
    },
    extend: {
      colors: {
        // Standard Design System Nomenclature
        indigo: { DEFAULT: '#4036d2', light: '#646cff' },
        steel: { DEFAULT: '#525252' },
        hairline: { DEFAULT: '#E0E0E0' },
        graphite: { DEFAULT: '#303030' },
        status: {
          blue: { bg: '#E0E7FF', fg: '#4036d2' },
          green: { bg: '#E6FAEB', fg: '#007C00' },
          yellow: { bg: '#FFF6D6', fg: '#8A6A00' },
          red: { bg: '#FFE2E2', fg: '#C0212B' },
          orange: { bg: '#FFE7D2', fg: '#B0530A' },
          gray: { bg: '#E5E7EB', fg: '#525252' },
        },
        
        // Legacy Aliases
        blue: { DEFAULT: '#4036d2' },
        lightblue: { DEFAULT: '#646cff' },
        lightgray: { DEFAULT: '#525252' },
        white: { DEFAULT: '#FFFFFF' },
        whitish: { DEFAULT: '#E0E0E0' },
        gray: {
          DEFAULT: '#6A6A6A',
          50: '#f9f9f9',
          100: '#f2f2f2',
          200: '#e0e0e0',
          300: '#c6c6c6',
          400: '#8d8d8d',
          500: '#6A6A6A',
          600: '#515151',
          700: '#3b3b3b',
          800: '#262626',
          900: '#121212',
        },
        dark: { DEFAULT: '#303030' },
        black: { DEFAULT: '#000000' },
        orange: {
          DEFAULT: '#F57C13'
        },
        rock: {
          DEFAULT: '#ee7725'
        },
        teal: { DEFAULT: '#14B8A6' },
        red: { DEFAULT: '#FF0000' },
      },
    },
  },
  plugins: [require('@tailwindcss/aspect-ratio')],
};
