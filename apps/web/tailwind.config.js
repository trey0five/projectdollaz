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
        // THE INVISIBLE-CLASS TRAP, FIXED AT THE SOURCE.
        //
        // This was `sky: 'rgb(var(--c-sky) / <alpha-value>)'` — a flat string,
        // which REPLACES Tailwind's entire sky scale rather than extending it.
        // Every `sky-<number>` utility in the app therefore compiled to nothing:
        // no error, no warning, just elements with no styling. That is how the
        // peer hero's explanatory chip came to render as dark text on a navy
        // band, and ten more usages across enrollment, HR, facilities and
        // knowledge were silently dead for the same reason.
        //
        // DEFAULT keeps `bg-sky` / `text-sky` working through the theme token, so
        // nothing that relied on the flat form changes. The numbered shades are
        // Tailwind's own — and note that --c-sky (56 189 248) IS sky-400, so the
        // brand colour and the scale agree by construction rather than by luck.
        sky: {
          DEFAULT: 'rgb(var(--c-sky) / <alpha-value>)',
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        cream: 'rgb(var(--c-cream) / <alpha-value>)',
        section: 'rgb(var(--c-section) / <alpha-value>)',
        rule: 'rgb(var(--c-rule) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        // ── Premium UI P1 (docs/Premium_UI_Plan.md §2.3/§2.6) ──────────────────
        ground: 'rgb(var(--c-ground) / <alpha-value>)',
        // The hairline. `border-hair` with NO modifier is the 10% rule itself (the
        // one colour every divider in the system uses); `border-hair/30` etc. scale
        // the same ink channel. A function is the only way Tailwind 3 lets a colour
        // default to an alpha other than 1 (a plain `<alpha-value>` string would
        // turn the nine pre-existing `border-hair` classes into solid ink borders).
        hair: ({ opacityValue }) =>
          opacityValue === undefined || String(opacityValue).startsWith('var(')
            ? 'rgb(var(--hair) / 0.10)'
            : `rgb(var(--hair) / ${opacityValue})`,
        ink2: 'rgb(var(--c-ink-2) / <alpha-value>)',
        good: 'rgb(var(--c-good) / <alpha-value>)',
        watch: 'rgb(var(--c-watch) / <alpha-value>)',
        risk: 'rgb(var(--c-risk) / <alpha-value>)',
      },
      fontFamily: {
        serif: 'var(--font-display)',
        sans: 'var(--font-body)',
      },
      // The type scale (§2.2). Arbitrary text-[Npx] classes keep working; these
      // are the names new work uses so a page stops needing fourteen sizes.
      fontSize: {
        'display-xl': ['40px', { lineHeight: '44px' }],
        display: ['30px', { lineHeight: '36px' }],
        title: ['22px', { lineHeight: '28px' }],
        heading: ['17px', { lineHeight: '24px' }],
        body: ['15px', { lineHeight: '22px' }],
        small: ['13px', { lineHeight: '18px' }],
        micro: ['11px', { lineHeight: '16px', letterSpacing: '.08em' }],
      },
      // ONE radius family. Every step is a token (tokens.css): under ui.v2
      // lg/xl/2xl/3xl all resolve to --r-panel (8px) — the clamp that collapses
      // 842 competing corner radii — while v1, `.ui-v1` subtrees and @media print
      // resolve the legacy literals, so printed documents never move.
      borderRadius: {
        none: '0',
        sm: 'var(--r-ctl)',
        DEFAULT: 'var(--r-base)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
        '3xl': 'var(--r-3xl)',
        full: 'var(--r-pill)',
      },
      // One elevation. Under v2 card/paper/glow collapse to the 1px contact shadow
      // (--sh-panel) and lift/login/glow-lg to the popover float; navy-glow is
      // gone. Legacy values live in tokens.css for v1/print. penny-glow is KEPT.
      boxShadow: {
        card: 'var(--sh-card)',
        paper: 'var(--sh-paper)',
        lift: 'var(--sh-lift)',
        login: 'var(--sh-login)',
        glow: 'var(--sh-glow)',
        'glow-lg': 'var(--sh-glow-lg)',
        'navy-glow': 'var(--sh-navy-glow)',
        panel: 'var(--sh-panel)',
        float: 'var(--sh-float)',
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
        // Kept as a keyframe: LedgerSpine plays it once (`animate-[pulse-ring_…_1]`).
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--c-glow) / 0.5)' },
          '70%': { boxShadow: '0 0 0 14px rgb(var(--c-glow) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--c-glow) / 0)' },
        },
        // `float`, `gradient-pan` and `studio-mote` were deleted in Premium UI P1
        // (§2.5: no infinite loops in app chrome). Spinners + shimmer stay.
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease both',
        shimmer: 'shimmer 2.5s linear infinite',
        // ONE-SHOT: a status dot pulses once on mount, never loops (§2.5).
        'pulse-ring': 'pulse-ring 1.8s ease-out 1 both',
      },
    },
  },
  plugins: [],
}
