import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

export function argValue(name, fallback = null) {
  const p = process.argv.slice(2).find((x) => x.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : fallback;
}

export function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function fetchAll(builderFactory, pageSize = 1000) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await builderFactory().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isNoInfo(answer = "") {
  const s = normalizeText(answer);
  return [
    "no encuentro esa informacion",
    "no encuentro informacion",
    "no encontre informacion",
    "no se menciona",
    "no esta especificado",
    "no esta indicado",
    "no se especifica",
    "no se indica",
    "no consta",
    "no puedo confirmar",
    "no puedo determinar",
  ].some((x) => s.includes(x));
}

export async function saveExports(prefix, rows) {
  const dir = path.join(process.cwd(), "qa-audit-output");
  await fs.mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, `${prefix}.json`);
  const csvPath = path.join(dir, `${prefix}.csv`);
  await fs.writeFile(jsonPath, JSON.stringify(rows, null, 2), "utf8");
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replaceAll('"', '""')}"`;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  await fs.writeFile(csvPath, csv, "utf8");
  return { jsonPath, csvPath };
}

export async function upsertAudit(supabase, row) {
  const { error } = await supabase.from("assistant_qa_audits").upsert(row, {
    onConflict: "run_id,qa_result_id,audit_type",
  });
  if (error) throw error;
}
