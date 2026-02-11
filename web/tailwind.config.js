/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Vermillion red - bold Chinese red (from album cover)
        vermillion: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',  // Classic vermillion
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
        // Ink black - woodblock print black
        ink: {
          50: '#f7f7f6',
          100: '#e5e4e2',
          200: '#cccac6',
          300: '#a8a5a0',
          400: '#85817a',
          500: '#6b6660',
          600: '#56524d',
          700: '#474440',
          800: '#3b3936',
          900: '#2a2826',  // Woodblock black
          950: '#1c1a18',  // Deep ink
        },
        // Canvas/paper - aged khaki tones (from album cover)
        canvas: {
          50: '#faf9f7',
          100: '#f3f1ed',
          200: '#e8e4dc',  // Light aged paper
          300: '#d9d3c5',
          400: '#c4bba8',  // Khaki/olive paper
          500: '#a89f8b',  // Muted canvas
          600: '#8f856f',
          700: '#766d5a',
          800: '#625a4b',
          900: '#514a3f',
          950: '#2c2721',
        },
        // Seal red - traditional Chinese seal/stamp red
        seal: {
          50: '#fdf3f3',
          100: '#fce4e4',
          200: '#facece',
          300: '#f5abab',
          400: '#ed7b7b',
          500: '#e15252',
          600: '#cc3333',  // Seal red
          700: '#ab2828',
          800: '#8d2424',
          900: '#752424',
          950: '#3f0e0e',
        },
        // Jade - muted traditional jade green
        jade: {
          50: '#f4f9f4',
          100: '#e6f2e6',
          200: '#cee5cf',
          300: '#a6d0a9',
          400: '#76b37b',
          500: '#529458',
          600: '#3f7944',  // Muted jade
          700: '#346138',
          800: '#2d4e30',
          900: '#264129',
          950: '#112314',
        },
        // Gold/bronze - aged metallic tones
        bronze: {
          50: '#faf8f3',
          100: '#f3efe2',
          200: '#e6ddc4',
          300: '#d5c69e',
          400: '#c2aa76',
          500: '#b4955a',  // Aged bronze
          600: '#a17c4a',
          700: '#86633f',
          800: '#6e5138',
          900: '#5b4431',
          950: '#322318',
        },
        // Cyber accent - for futuristic touches
        cyber: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
      },
      fontFamily: {
        // DM Sans - Geometric humanist (similar to Styrene B)
        sans: ['var(--font-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
        // Crimson Pro - Elegant serif for English headers/marketing
        display: ['var(--font-display)', 'Crimson Pro', 'Georgia', 'serif'],
        // Noto Serif TC - Traditional Chinese serif for Chinese text
        'serif-tc': ['var(--font-serif-tc)', 'Noto Serif TC', 'Georgia', 'serif'],
        // Zhi Mang Xing - Calligraphy for logo only
        brush: ['var(--font-brush)', 'Zhi Mang Xing', 'cursive'],
      },
      backgroundImage: {
        // Aged canvas/paper gradient
        'canvas-gradient': 'linear-gradient(135deg, #e8e4dc 0%, #c4bba8 100%)',
        // Vermillion to seal gradient
        'vermillion-gradient': 'linear-gradient(135deg, #b91c1c 0%, #cc3333 100%)',
        // Ink wash gradient
        'ink-gradient': 'linear-gradient(180deg, #2a2826 0%, #1c1a18 100%)',
      },
      boxShadow: {
        'vermillion': '0 4px 14px 0 rgba(185, 28, 28, 0.2)',
        'seal': '0 4px 14px 0 rgba(204, 51, 51, 0.15)',
        'ink': '0 4px 14px 0 rgba(28, 26, 24, 0.25)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
