import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL) {
  throw new Error("Falta SUPABASE_URL");
}

if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error("Falta SUPABASE_SECRET_KEY");
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);