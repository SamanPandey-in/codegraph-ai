import path from 'path';
import { promises as fs } from 'fs';
import { getNeo4jDriver } from './neo4jDriver.js';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/infrastructure/db/migrations');

/**
 * Ensures the migration tracking constraint exists.
 */
async function ensureMigrationConstraint(session) {
  await session.run(`
    CREATE CONSTRAINT neo4j_migration_version IF NOT EXISTS
    FOR (m:__Neo4jMigration) REQUIRE m.version IS UNIQUE
  `);
}

/**
 * Gets the set of applied migration versions.
 */
async function getAppliedMigrations(session) {
  const result = await session.run(`
    MATCH (m:__Neo4jMigration)
    RETURN m.version AS version
  `);
  return new Set(result.records.map((r) => r.get('version')));
}

/**
 * Marks a migration as applied.
 */
async function markApplied(session, version, filename) {
  await session.run(
    `MERGE (m:__Neo4jMigration { version: $version })
     SET m.filename = $filename, m.appliedAt = datetime()`,
    { version, filename }
  );
}

/**
 * Runs pending Neo4j migrations.
 */
export async function runMigrations() {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    console.log('[Neo4jMigration] Running migrations...');
    await ensureMigrationConstraint(session);

    const applied = await getAppliedMigrations(session);
    
    // Ensure the directory exists
    try {
      await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
    } catch {
      // Ignored
    }

    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.cypher'))
      .sort();

    for (const filename of files) {
      const version = filename.split('__')[0]; // e.g. "V001"
      if (applied.has(version)) {
        console.log(`[Neo4jMigration] Skipping ${filename} (already applied)`);
        continue;
      }

      console.log(`[Neo4jMigration] Applying ${filename}...`);
      const cypher = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');

      // Split by double newline or triple newline if multiple statements are present
      const stmts = cypher
        .split(/\r?\n\r?\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of stmts) {
        try {
          await session.run(stmt);
        } catch (err) {
          console.error(`[Neo4jMigration] Failed statement in ${filename}:`, err.message);
          throw err;
        }
      }

      await markApplied(session, version, filename);
      console.log(`[Neo4jMigration] Successfully applied ${filename}.`);
    }
    console.log('[Neo4jMigration] All migrations completed.');
  } catch (err) {
    console.error('[Neo4jMigration] Migration run failed:', err.message);
    throw err;
  } finally {
    await session.close();
  }
}
