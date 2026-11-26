// Integration tests (round 12.5): the app's real account + sync code against the local Supabase
// stand-in (scripts/gateway) on a real PostgreSQL. Needs DATABASE_URL (or the local default).
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/__integration__/**/*.integration.ts'], testTimeout: 60_000, hookTimeout: 120_000, fileParallelism: false } });
