/**
 * Thresholds for choosing Neo4j over Postgres as the primary graph store.
 */
const THRESHOLDS = {
  NODE_COUNT: parseInt(process.env.NEO4J_THRESHOLD_NODES ?? '500', 10),
  EDGE_COUNT: parseInt(process.env.NEO4J_THRESHOLD_EDGES ?? '2000', 10),
  DENSITY: parseFloat(process.env.NEO4J_THRESHOLD_DENSITY ?? '0.05'),
  CYCLES: parseInt(process.env.NEO4J_THRESHOLD_CYCLES ?? '20', 10),
};

/**
 * Dynamically selects the database backend based on graph topology metrics.
 *
 * @param {Object} topology - Metrics from GraphBuilderAgent (nodeCount, edgeCount, cyclesDetected).
 * @param {Object} options - Manual overrides (forceNeo4j, forcePostgres).
 * @returns {Object} { db: 'neo4j' | 'postgres', reasons: string[] }
 */
export function selectDatabase(topology, options = {}) {
  const reasons = [];

  // Manual Overrides
  if (options.forceNeo4j) return { db: 'neo4j', reasons: ['manual override'] };
  if (options.forcePostgres) return { db: 'postgres', reasons: ['manual override'] };

  // Hard environment check
  if (!process.env.NEO4J_URI || !process.env.NEO4J_PASSWORD) {
    return { db: 'postgres', reasons: ['NEO4J_URI/PASSWORD not configured'] };
  }

  const { nodeCount = 0, edgeCount = 0, cyclesDetected = 0 } = topology;

  // Density formula: edges / (nodes * (nodes - 1))
  const density = edgeCount / (nodeCount * (nodeCount - 1) || 1);

  // Threshold checks
  if (nodeCount >= THRESHOLDS.NODE_COUNT) {
    reasons.push(`nodeCount ${nodeCount} >= ${THRESHOLDS.NODE_COUNT}`);
  }
  if (edgeCount >= THRESHOLDS.EDGE_COUNT) {
    reasons.push(`edgeCount ${edgeCount} >= ${THRESHOLDS.EDGE_COUNT}`);
  }
  if (density >= THRESHOLDS.DENSITY) {
    reasons.push(`density ${density.toFixed(4)} >= ${THRESHOLDS.DENSITY}`);
  }
  if (cyclesDetected >= THRESHOLDS.CYCLES) {
    reasons.push(`cycles ${cyclesDetected} >= ${THRESHOLDS.CYCLES}`);
  }

  // Hard override triggers from user request
  if (options.impactAnalysisDepth > 5) {
    reasons.push('impact analysis > 5 hops');
  }
  if (topology.largeCycles > 50) {
    reasons.push('circular cycles > 50 nodes');
  }
  if (topology.distinctRelationshipTypes > 3) {
    reasons.push('distinct relationship types > 3');
  }

  return {
    db: reasons.length > 0 ? 'neo4j' : 'postgres',
    reasons,
  };
}
