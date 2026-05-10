/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        ring: 'hsl(var(--ring))',
      },
      borderRadius: { lg: '0.75rem', md: '0.5rem', sm: '0.375rem', xl: '1rem', '2xl': '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 14px rgba(15, 23, 42, 0.05)',
        soft: '0 1px 3px rgba(15, 23, 42, 0.06)',
      },
      ringOffsetColor: {
        background: 'hsl(var(--background))',
      },
      fontFamily: {
        sans: ['"Noto Sans Arabic"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
