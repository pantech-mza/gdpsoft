import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import AdmZip from "adm-zip";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const normativeId = 61;
const bucket = "normativas-originales";

const { data: normative, error: dbError } =
  await supabase
    .from("normatives")
    .select(`
      id,
      title,
      original_filename,
      storage_path_original
    `)
    .eq("id", normativeId)
    .single();

if (dbError) {
  throw dbError;
}

const { data: file, error: storageError } =
  await supabase.storage
    .from(bucket)
    .download(normative.storage_path_original);

if (storageError) {
  throw storageError;
}

const buffer = Buffer.from(
  await file.arrayBuffer()
);

const zip = new AdmZip(buffer);

const entries = zip
  .getEntries()
  .filter((entry) => !entry.isDirectory)
  .map((entry) => ({
    name: entry.entryName,
    size: entry.header?.size ?? 0,
  }));

console.log("");
console.log("Normativa:", normative.title);
console.log("Archivo:", normative.original_filename);
console.log("");
console.table(entries);