/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1f3d72',
          deep: '#16284f',
          soft: '#2e508f',
        },
        gold: {
          DEFAULT: '#b89650',
          light: '#d4b47a',
          pale: '#e8d4a8',
        },
        cream: '#faf8f4',
        section: '#f4f1eb',
        rule: '#d0c8b8',
        border: '#c8bfaa',
        muted: '#5a5244',
        ink: '#1e1e1e',
        danger: '#8b1a1a',
      },
      fontFamily: {
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.06)',
        paper: '0 10px 40px rgba(26,39,68,0.08)',
        lift: '0 22px 60px rgba(26,39,68,0.22)',
        login: '0 30px 90px rgba(0,0,0,0.45)',
        glow: '0 0 0 1px rgba(184,150,80,0.45), 0 10px 34px rgba(184,150,80,0.28)',
        'glow-lg': '0 0 0 1px rgba(184,150,80,0.5), 0 14px 50px rgba(184,150,80,0.4)',
        'navy-glow': '0 12px 36px rgba(26,39,68,0.4)',
      },
      backgroundImage: {
        'navy-radial':
          'radial-gradient(ellipse at 30% 20%, rgba(184,150,80,0.16) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(184,150,80,0.10) 0%, transparent 50%)',
        'navy-gradient': 'linear-gradient(135deg, #16284f 0%, #1f3d72 58%, #2e508f 120%)',
        'gold-gradient': 'linear-gradient(135deg, #e8d4a8 0%, #d4b47a 45%, #b89650 100%)',
        'page-glow':
          'radial-gradient(900px circle at 50% -120px, rgba(184,150,80,0.10) 0%, transparent 70%)',
        sheen:
          'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.35) 50%, transparent 75%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(184,150,80,0.5)' },
          '70%': { boxShadow: '0 0 0 14px rgba(184,150,80,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(184,150,80,0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-16px)' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease both',
        shimmer: 'shimmer 2.5s linear infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        float: 'float 7s ease-in-out infinite',
        'gradient-pan': 'gradient-pan 6s ease infinite',
      },
    },
  },
  plugins: [],
}
