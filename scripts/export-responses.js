const fs = require("fs");
const path = require("path");
const { TableClient } = require("@azure/data-tables");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function ensureEnv() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));

  const connectionString = process.env.AZURE_TABLES_CONNECTION_STRING;
  const tableName = process.env.AZURE_TABLE_NAME || "surveyresponses";
  const partitionKey = process.env.AZURE_TABLE_PARTITION_KEY || "";

  if (!connectionString) {
    throw new Error(
      "Missing AZURE_TABLES_CONNECTION_STRING. Put it in .env.local or export it in your shell."
    );
  }

  return { connectionString, tableName, partitionKey };
}

function flattenEntity(entity) {
  const videoOrder = safeParse(entity.videoOrderJson, []);
  const responses = safeParse(entity.responsesJson, {});
  const posttest = safeParse(entity.posttestJson, {});

  return {
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
    submittedAt: entity.submittedAt || "",
    version: entity.version || "",
    studyTitle: entity.studyTitle || "",
    createdAt: entity.createdAt || "",
    startedAt: entity.startedAt || "",
    completedAt: entity.completedAt || "",
    consent: entity.consent,
    videoOrder: videoOrder.join("|"),
    responsesJson: JSON.stringify(responses),
    posttestJson: JSON.stringify(posttest),
    finalComment: posttest.finalComment || ""
  };
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function csvEscape(value) {
  const stringValue = value == null ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function main() {
  const { connectionString, tableName, partitionKey } = ensureEnv();
  const tableClient = TableClient.fromConnectionString(connectionString, tableName);
  const entities = [];
  const queryOptions = partitionKey
    ? { filter: `PartitionKey eq '${partitionKey}'` }
    : undefined;

  for await (const entity of tableClient.listEntities({ queryOptions })) {
    entities.push(entity);
  }

  entities.sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));

  const exportDir = path.join(process.cwd(), "exports");
  fs.mkdirSync(exportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawJsonPath = path.join(exportDir, `surveyresponses-raw-${timestamp}.json`);
  const flatJsonPath = path.join(exportDir, `surveyresponses-flat-${timestamp}.json`);
  const csvPath = path.join(exportDir, `surveyresponses-flat-${timestamp}.csv`);

  fs.writeFileSync(rawJsonPath, JSON.stringify(entities, null, 2));

  const flatEntities = entities.map(flattenEntity);
  fs.writeFileSync(flatJsonPath, JSON.stringify(flatEntities, null, 2));

  const headers = [
    "partitionKey",
    "rowKey",
    "submittedAt",
    "version",
    "studyTitle",
    "createdAt",
    "startedAt",
    "completedAt",
    "consent",
    "videoOrder",
    "finalComment",
    "responsesJson",
    "posttestJson"
  ];
  const csvLines = [
    headers.join(","),
    ...flatEntities.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ];
  fs.writeFileSync(csvPath, csvLines.join("\n"));

  console.log(`Exported ${entities.length} responses`);
  if (entities.length > 0) {
    const partitions = [...new Set(entities.map((entity) => entity.partitionKey || entity.PartitionKey || ""))];
    console.log(`Detected partition keys: ${partitions.join(", ")}`);
  } else {
    console.log("No rows found in the selected table/query.");
    console.log(`Table: ${tableName}`);
    console.log(`Partition filter: ${partitionKey || "(none)"}`);
  }
  console.log(`Raw JSON: ${rawJsonPath}`);
  console.log(`Flat JSON: ${flatJsonPath}`);
  console.log(`CSV: ${csvPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
