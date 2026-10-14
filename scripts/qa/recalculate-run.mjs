import {
  loadEnv,
  finishRun
} from "./_utils.mjs";

loadEnv();

if (!process.env.QA_RUNNER_SECRET) {
  console.error("Falta QA_RUNNER_SECRET en .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
function argValue(name) {
  const p = args.find((x) => x.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const runId = argValue("run");
if (!runId) {
  console.error("Uso: node scripts/qa/recalculate-run.mjs --run=<RUN_ID>");
  process.exit(1);
}

console.log(`Recalculando resumen de la corrida ${runId}...`);
const final = await finishRun(runId);
console.log("\nFINAL RECALCULADO:", final);
