import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'PingFang SC', 'Microsoft YaHei', 'sans-serif']
      },
      colors: {
        ink: '#111827',
        midnight: '#0f172a',
        aurum: '#d6b25e'
      },
      boxShadow: {
        glow: '0 18px 60px rgba(15, 23, 42, 0.28)',
        gold: '0 0 0 1px rgba(214,178,94,.26), 0 16px 48px rgba(214,178,94,.08)'
      }
    }
  },
  plugins: []
} satisfies Config;
