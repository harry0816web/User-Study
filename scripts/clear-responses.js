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
  const defaultPartitionKey = process.env.AZURE_TABLE_PARTITION_KEY || "study-v1";

  if (!connectionString) {
    throw new Error(
      "Missing AZURE_TABLES_CONNECTION_STRING. Put it in .env.local or export it in your shell."
    );
  }

  return { connectionString, tableName, defaultPartitionKey };
}

function parseArgs(argv) {
  const options = {
    confirm: false,
    all: false,
    partitionKey: undefined,
    version: undefined,
    studyTitle: undefined,
    submittedBefore: undefined,
    submittedAfter: undefined
  };

  for (const arg of argv) {
    if (arg === "--confirm") {
      options.confirm = true;
      continue;
    }
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg.startsWith("--partition-key=")) {
      options.partitionKey = arg.slice("--partition-key=".length);
      continue;
    }
    if (arg.startsWith("--version=")) {
      options.version = arg.slice("--version=".length);
      continue;
    }
    if (arg.startsWith("--study-title=")) {
      options.studyTitle = arg.slice("--study-title=".length);
      continue;
    }
    if (arg.startsWith("--submitted-before=")) {
      options.submittedBefore = arg.slice("--submitted-before=".length);
      continue;
    }
    if (arg.startsWith("--submitted-after=")) {
      options.submittedAfter = arg.slice("--submitted-after=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/clear-responses.js [filters] [--confirm]

Filters:
  --partition-key=<value>      Only delete rows in this partition key
  --version=<value>            Only delete rows with this version
  --study-title=<value>        Only delete rows with this study title
  --submitted-before=<iso>     Only delete rows submitted before this timestamp
  --submitted-after=<iso>      Only delete rows submitted after this timestamp
  --all                        Ignore the default partition-key safety filter

Behavior:
  Without --confirm, the script only prints which rows would be deleted.
  If no filter is provided, it defaults to partitionKey from AZURE_TABLE_PARTITION_KEY
  (or "study-v1" if that env var is missing).`);
}

function isValidDateString(value) {
  return !Number.isNaN(Date.parse(value));
}

function buildQueryOptions(options, defaultPartitionKey) {
  if (options.all) return undefined;

  const partitionKey = options.partitionKey || defaultPartitionKey;
  if (!partitionKey) return undefined;

  return {
    filter: `PartitionKey eq '${partitionKey.replace(/'/g, "''")}'`
  };
}

function matchesFilters(entity, options, defaultPartitionKey) {
  const partitionKey = entity.partitionKey || entity.PartitionKey || "";
  const submittedAt = String(entity.submittedAt || "");

  if (!options.all) {
    const expectedPartitionKey = options.partitionKey || defaultPartitionKey;
    if (expectedPartitionKey && partitionKey !== expectedPartitionKey) {
      return false;
    }
  }

  if (options.version && String(entity.version || "") !== options.version) {
    return false;
  }

  if (options.studyTitle && String(entity.studyTitle || "") !== options.studyTitle) {
    return false;
  }

  if (options.submittedBefore) {
    if (!isValidDateString(options.submittedBefore)) {
      throw new Error(`Invalid --submitted-before value: ${options.submittedBefore}`);
    }
    if (!submittedAt || Date.parse(submittedAt) >= Date.parse(options.submittedBefore)) {
      return false;
    }
  }

  if (options.submittedAfter) {
    if (!isValidDateString(options.submittedAfter)) {
      throw new Error(`Invalid --submitted-after value: ${options.submittedAfter}`);
    }
    if (!submittedAt || Date.parse(submittedAt) <= Date.parse(options.submittedAfter)) {
      return false;
    }
  }

  return true;
}

async function main() {
  const { connectionString, tableName, defaultPartitionKey } = ensureEnv();
  const options = parseArgs(process.argv.slice(2));
  const tableClient = TableClient.fromConnectionString(connectionString, tableName);
  const queryOptions = buildQueryOptions(options, defaultPartitionKey);
  const matches = [];

  for await (const entity of tableClient.listEntities({ queryOptions })) {
    if (matchesFilters(entity, options, defaultPartitionKey)) {
      matches.push(entity);
    }
  }

  matches.sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));

  console.log(`Table: ${tableName}`);
  console.log(
    `Scope: ${options.all ? "all partitions" : `partition ${options.partitionKey || defaultPartitionKey}`}`
  );
  if (options.version) console.log(`Version filter: ${options.version}`);
  if (options.studyTitle) console.log(`Study title filter: ${options.studyTitle}`);
  if (options.submittedBefore) console.log(`Submitted before: ${options.submittedBefore}`);
  if (options.submittedAfter) console.log(`Submitted after: ${options.submittedAfter}`);
  console.log(`Matched rows: ${matches.length}`);

  if (matches.length === 0) {
    console.log("No rows matched the current filters.");
    return;
  }

  for (const entity of matches.slice(0, 10)) {
    console.log(
      `- ${entity.partitionKey} / ${entity.rowKey} / ${entity.submittedAt || ""} / ${entity.version || ""} / ${entity.studyTitle || ""}`
    );
  }
  if (matches.length > 10) {
    console.log(`...and ${matches.length - 10} more row(s)`);
  }

  if (!options.confirm) {
    console.log("Dry run only. Re-run with --confirm to delete these rows.");
    return;
  }

  for (const entity of matches) {
    await tableClient.deleteEntity(entity.partitionKey, entity.rowKey);
  }

  console.log(`Deleted ${matches.length} row(s).`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
