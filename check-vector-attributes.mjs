import nextEnv from "@next/env";
import OpenAI from "openai";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY,
});

const VECTOR_STORE_ID =
  process.env.OPENAI_VECTOR_STORE_ID ||
  "vs_6aac0d4a273881919e002d606e691d01";

const FILE_ID =
  process.argv[2];

if (!FILE_ID) {
  throw new Error(
    "Uso: node check-vector-attributes.mjs <file_id>"
  );
}

const file =
  await openai.vectorStores.files.retrieve(
    FILE_ID,
    {
      vector_store_id:
        VECTOR_STORE_ID,
    }
  );

console.log(
  JSON.stringify(
    {
      id:
        file.id,

      status:
        file.status,

      attributes:
        file.attributes,

      last_error:
        file.last_error,
    },
    null,
    2
  )
);