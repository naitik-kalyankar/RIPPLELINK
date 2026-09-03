import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Both are public/anon-scoped values (safe in a web or Tauri bundle, same trust level as
// VITE_API_URL) — just not optional. Missing them used to throw here, which crashed the whole
// React tree before it ever rendered (a blank white page with nothing but a console error) —
// App.tsx checks this flag instead and renders a real "not configured yet" screen.
export const isSupabaseConfigured = Boolean(url && anonKey);

// Session persistence (localStorage, via the SDK's default storage) works the same way in a
// real browser tab and inside the Tauri webview — both support localStorage natively — so
// "stay signed in" needs no extra Tauri-specific code.
export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder");
