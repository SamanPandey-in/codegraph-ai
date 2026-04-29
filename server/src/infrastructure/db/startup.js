import { pgPool } from "../connections.js";
import { getNeo4jDriver } from "./neo4jDriver.js";

export async function bootstrapGraphInfrastructure() {
  try {
    await pgPool.query("SELECT 1");
    console.log("[GraphInfrastructure] Postgres OK");
  } catch (error) {
    console.warn("[GraphInfrastructure] Postgres check failed:", error.message);
  }

  if (!process.env.NEO4J_URI) {
    return;
  }

  try {
    await getNeo4jDriver().verifyConnectivity();
    console.log("[GraphInfrastructure] Neo4j connected");
  } catch (error) {
    console.warn(
      "[GraphInfrastructure] Neo4j unavailable - falling back to Postgres:",
      error.message,
    );
  }
}
