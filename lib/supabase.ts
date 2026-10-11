import { createClient } from "@supabase/supabase-js";

// Публичные значения проекта: адрес и publishable-ключ можно хранить в коде.
// Данные защищены не ключом, а входом владельца (см. supabase/migrations/0007_app_api.sql).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://yfdaldpzbfyzoancmywn.supabase.co";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "sb_publishable_CvlSbjsAfx7pM2r6Ko-FMg_WGfUjRMI";

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
