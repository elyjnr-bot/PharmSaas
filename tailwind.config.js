/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      borderRadius: {
        'ios': '16px',
        'ios-sm': '12px',
        'ios-lg': '20px',
        'ios-xl': '24px',
      },
      boxShadow: {
        'ios': '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
        'ios-md': '0 2px 8px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.05)',
        'ios-lg': '0 4px 16px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.06)',
        'ios-up': '0 -1px 0 rgba(0,0,0,0.06)',
        'card': '0 1px 3px rgba(15,23,42,0.05), 0 4px 12px rgba(15,23,42,0.04)',
        'card-hover': '0 4px 12px rgba(15,23,42,0.07), 0 8px 24px rgba(15,23,42,0.06)',
        'float': '0 4px 20px rgba(5, 150, 105, 0.32), 0 2px 6px rgba(0,0,0,0.08)',
        'nav': '0 -1px 0 rgba(0,0,0,0.06)',
        'emerald': '0 4px 16px rgba(5,150,105,0.28)',
      },
      transitionTimingFunction: {
        'ios': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'ios-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        '250': '250ms',
      },
      backdropBlur: {
        'ios': '20px',
      },
      colors: {
        jungle: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        ios: {
          bg: '#f8fafc',
          card: '#ffffff',
          border: '#e2e8f0',
          text: '#0f172a',
          secondary: '#64748b',
          separator: '#e2e8f0',
        },
      },
    },
  },
  plugins: [],
};
