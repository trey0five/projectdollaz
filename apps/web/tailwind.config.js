/** @type {import('tailwindcss').Config} */
// THEME VALUES LIVE IN src/styles/tokens.css — every color here resolves through
// an RGB-channel CSS var (`rgb(var(--c-x) / <alpha-value>)`) so the ui.v2 flag
// (html[data-ui="v2"]) can remap the palette without touching any component.
// v1 (flag off) resolves to the exact pre-token hexes; opacity modifiers
// (`border-gold/30` etc.) keep working via the <alpha-value> placeholder.
// `penny-*` is PROTECTED mascot gold (never remapped); `coral`/`sky` are the
// new v2-era accents (theme-stable).
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: 'rgb(var(--c-navy) / <alpha-value>)',
          deep: 'rgb(var(--c-navy-deep) / <alpha-value>)',
          soft: 'rgb(var(--c-navy-soft) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--c-gold) / <alpha-value>)',
          light: 'rgb(var(--c-gold-light) / <alpha-value>)',
          pale: 'rgb(var(--c-gold-pale) / <alpha-value>)',
        },
        // Penny mascot gold — aliases of v1 gold, NEVER remapped under v2.
        penny: {
          DEFAULT: 'rgb(var(--c-penny) / <alpha-value>)',
          light: 'rgb(var(--c-penny-light) / <alpha-value>)',
          pale: 'rgb(var(--c-penny-pale) / <alpha-value>)',
        },
        coral: 'rgb(var(--c-coral) / <alpha-value>)',
        sky: 'rgb(var(--c-sky) / <alpha-value>)',
        cream: 'rgb(var(--c-cream) / <alpha-value>)',
        section: 'rgb(var(--c-section) / <alpha-value>)',
        rule: 'rgb(var(--c-rule) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        serif: 'var(--font-display)',
        sans: 'var(--font-body)',
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.06)',
        paper: '0 10px 40px rgb(var(--c-shade) / 0.08)',
        lift: '0 22px 60px rgb(var(--c-shade) / 0.22)',
        login: '0 30px 90px rgba(0,0,0,0.45)',
        glow: '0 0 0 1px rgb(var(--c-glow) / 0.45), 0 10px 34px rgb(var(--c-glow) / 0.28)',
        'glow-lg': '0 0 0 1px rgb(var(--c-glow) / 0.5), 0 14px 50px rgb(var(--c-glow) / 0.4)',
        'navy-glow': '0 12px 36px rgb(var(--c-shade) / 0.4)',
        // Penny's gold halo — the mascot-chrome twin of shadow-glow (never remaps).
        'penny-glow':
          '0 0 0 1px rgb(var(--c-penny) / 0.45), 0 10px 34px rgb(var(--c-penny) / 0.28)',
      },
      backgroundImage: {
        'navy-radial':
          'radial-gradient(ellipse at 30% 20%, rgb(var(--c-glow) / 0.16) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgb(var(--c-glow) / 0.10) 0%, transparent 50%)',
        'navy-gradient':
          'linear-gradient(135deg, var(--grad-navy-0) 0%, var(--grad-navy-1) 58%, var(--grad-navy-2) 120%)',
        'gold-gradient':
          'linear-gradient(135deg, var(--grad-cta-0) 0%, var(--grad-cta-1) 45%, var(--grad-cta-2) 100%)',
        // Penny's gold gradient — identical to v1 gold-gradient, never remapped.
        'penny-gradient':
          'linear-gradient(135deg, var(--grad-penny-0) 0%, var(--grad-penny-1) 45%, var(--grad-penny-2) 100%)',
        'page-glow':
          'radial-gradient(900px circle at 50% -120px, rgb(var(--c-glow) / 0.10) 0%, transparent 70%)',
        sheen:
          'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.35) 50%, transparent 75%)',
        // Penny Studio dark "command deck" surfaces (named so the JIT always emits
        // them — comma'd arbitrary gradient classes drop out of incremental builds).
        // EXEMPT from the token swap: Penny-owned chrome keeps its literals.
        'studio-page': 'linear-gradient(180deg, #0e2142 0%, #0a1830 100%)',
        'studio-hero': 'linear-gradient(150deg, #1f3d72 0%, #12294f 46%, #0b1b36 100%)',
        'studio-glow':
          'radial-gradient(1200px 600px at 82% -8%, rgba(201,162,39,0.10) 0%, transparent 60%)',
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
          '0%': { boxShadow: '0 0 0 0 rgb(var(--c-glow) / 0.5)' },
          '70%': { boxShadow: '0 0 0 14px rgb(var(--c-glow) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--c-glow) / 0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-16px)' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        // Gold mote drifting up through the Penny Studio hero backdrop.
        'studio-mote': {
          '0%': { transform: 'translateY(0)', opacity: '0' },
          '10%, 90%': { opacity: '.7' },
          '100%': { transform: 'translateY(-380px)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease both',
        shimmer: 'shimmer 2.5s linear infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        float: 'float 7s ease-in-out infinite',
        'gradient-pan': 'gradient-pan 6s ease infinite',
        'studio-mote': 'studio-mote 12s linear infinite',
      },
    },
  },
  plugins: [],
}
