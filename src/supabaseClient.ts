import { createClient } from '@supabase/supabase-js';

type EnvRecord = Record<string, string | undefined>;

declare const process: { env?: EnvRecord } | undefined;

type ImportMetaEnv = { env?: EnvRecord };

const viteEnv = (import.meta as ImportMetaEnv).env ?? {};
const processEnv = typeof process !== 'undefined' ? process.env ?? {} : {};
const globalEnv = typeof globalThis !== 'undefined' ? (globalThis as EnvRecord) : {};

const supabaseUrl =
  viteEnv.VITE_SUPABASE_URL ??
  viteEnv.SUPABASE_URL ??
  processEnv.VITE_SUPABASE_URL ??
  processEnv.SUPABASE_URL ??
  globalEnv.VITE_SUPABASE_URL ??
  globalEnv.SUPABASE_URL;

const supabaseAnonKey =
  viteEnv.VITE_SUPABASE_ANON_KEY ??
  viteEnv.SUPABASE_ANON_KEY ??
  processEnv.VITE_SUPABASE_ANON_KEY ??
  processEnv.SUPABASE_ANON_KEY ??
  globalEnv.VITE_SUPABASE_ANON_KEY ??
  globalEnv.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase client is missing configuration. Define SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ prefixed equivalents).');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

