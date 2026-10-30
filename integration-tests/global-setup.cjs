module.exports = async () => {
  let connection = process.env.MEDUSA_TEST_POSTGRES_URL;
  if (!connection) {
    const { PostgreSqlContainer } = require("@testcontainers/postgresql");
    try {
      globalThis.medusaBirdTestPostgres = await new PostgreSqlContainer(
        "postgres:15-alpine",
      ).start();
      connection = globalThis.medusaBirdTestPostgres.getConnectionUri();
    } catch {
      throw new Error(
        "Medusa integration tests require Docker, or MEDUSA_TEST_POSTGRES_URL pointing to an isolated PostgreSQL server with CREATEDB permission. See integration-tests/README.md.",
      );
    }
  }
  try {
    const url = new URL(connection);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username
    ) {
      throw new Error();
    }
    if (url.search || url.hash) throw new Error();
    process.env.DB_HOST = url.hostname;
    process.env.DB_PORT = url.port || "5432";
    process.env.DB_USERNAME = decodeURIComponent(url.username);
    process.env.DB_PASSWORD = decodeURIComponent(url.password);
    process.env.MEDUSA_DISABLE_TELEMETRY = "true";
    const { Client } = require("@medusajs/framework/pg");
    const client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: "postgres",
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      const { rows } = await client.query(
        "SELECT rolcreatedb OR rolsuper AS allowed FROM pg_roles WHERE rolname = current_user",
      );
      if (!rows[0]?.allowed) throw new Error();
    } finally {
      await client.end();
    }
  } catch {
    await globalThis.medusaBirdTestPostgres?.stop();
    throw new Error(
      "Cannot use the integration-test PostgreSQL server. Supply a valid postgres:// URL without query parameters, access to the postgres database, and a user with CREATEDB permission. See integration-tests/README.md.",
    );
  }
};
