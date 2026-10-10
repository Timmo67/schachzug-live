/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'], environment: 'node' },
});
