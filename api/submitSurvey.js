const crypto = require("crypto");
const { TableClient, TableServiceClient } = require("@azure/data-tables");

const TABLE_NAME = process.env.AZURE_TABLE_NAME || "surveyresponses";
const PARTITION_KEY = process.env.AZURE_TABLE_PARTITION_KEY || "study-v1";

async function ensureTable(connectionString, tableName) {
  const serviceClient = TableServiceClient.fromConnectionString(connectionString);
  try {
    await serviceClient.createTable(tableName);
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const connectionString = process.env.AZURE_TABLES_CONNECTION_STRING;
    if (!connectionString) {
      return res.status(500).json({
        error: "Missing AZURE_TABLES_CONNECTION_STRING."
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (!body.responses || !body.posttest || !Array.isArray(body.videoOrder)) {
      return res.status(400).json({
        error: "Invalid payload. Expecting videoOrder, responses, and posttest."
      });
    }

    await ensureTable(connectionString, TABLE_NAME);
    const tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME);

    const submittedAt = new Date().toISOString();
    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey: `${Date.now()}-${crypto.randomUUID()}`,
      submittedAt,
      version: body.version || "proposal-v1",
      studyTitle: body.studyTitle || "Untitled Study",
      createdAt: body.createdAt || "",
      startedAt: body.startedAt || "",
      completedAt: body.completedAt || submittedAt,
      consent: Boolean(body.consent),
      videoOrderJson: JSON.stringify(body.videoOrder || []),
      responsesJson: JSON.stringify(body.responses || {}),
      posttestJson: JSON.stringify(body.posttest || {})
    };

    await tableClient.createEntity(entity);

    return res.status(200).json({
      ok: true,
      tableName: TABLE_NAME,
      partitionKey: PARTITION_KEY,
      rowKey: entity.rowKey,
      submittedAt
    });
  } catch (error) {
    console.error("submitSurvey failed", error);
    return res.status(500).json({
      error: error.message || "Unknown server error"
    });
  }
};
