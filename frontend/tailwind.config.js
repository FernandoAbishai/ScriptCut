/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#13151e',
          surface: '#202331',
          panel: '#1c1f2c',
          border: '#34394b',
          accent: '#6366f1',
          'accent-hover': '#818cf8',
          text: '#e2e8f0',
          'text-muted': '#acb2c8',
          danger: '#ef4444',
          success: '#22c55e',
          warning: '#f59e0b',
          'word-hover': 'rgba(99, 102, 241, 0.15)',
          'word-selected': 'rgba(99, 102, 241, 0.3)',
          'word-deleted': 'rgba(239, 68, 68, 0.2)',
          'word-filler': 'rgba(245, 158, 11, 0.25)',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
