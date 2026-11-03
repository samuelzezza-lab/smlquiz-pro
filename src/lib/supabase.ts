import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabaseReady = Boolean(url && key && !key.includes('INSERISCI'))
export const supabase = supabaseReady ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null
export function requireSupabase() { if (!supabase) throw new Error('Collega la chiave pubblica Supabase nelle variabili del sito.'); return supabase }