const toNumber = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const clamp01 = (value) => Math.min(1, Math.max(0, toNumber(value, 0)));

const safeDiv = (num, den, fallback = 0) => {
	const numerator = toNumber(num, 0);
	const denominator = toNumber(den, 0);
	if (denominator <= 0) return fallback;
	return numerator / denominator;
};

const round3 = (value) => Number(clamp01(value).toFixed(3));

export const CONFIDENCE_THRESHOLDS = {
	PROCEED: toNumber(process.env.AGENT_CONFIDENCE_PROCEED, 0.85),
	PROCEED_WARN: toNumber(process.env.AGENT_CONFIDENCE_RETRY, 0.65),
	RETRY: toNumber(process.env.AGENT_CONFIDENCE_ABORT, 0.4),
};

export const DEFAULT_AGENT_WEIGHTS = {
	'ingestion-agent': 0.1,
	'scanner-agent': 0.1,
	'parser-agent': 0.25,
	'graph-builder-agent': 0.25,
	'enrichment-agent': 0.1,
	'embedding-agent': 0.1,
	'persistence-agent': 0.1,
};

export function decideConfidence(confidence) {
	const score = clamp01(confidence);
	if (score >= CONFIDENCE_THRESHOLDS.PROCEED) return 'PROCEED';
	if (score >= CONFIDENCE_THRESHOLDS.PROCEED_WARN) return 'PROCEED_WARN';
	if (score >= CONFIDENCE_THRESHOLDS.RETRY) return 'RETRY';
	return 'ABORT';
}

export function labelConfidence(confidence) {
	const score = clamp01(confidence);
	if (score >= CONFIDENCE_THRESHOLDS.PROCEED) return 'HIGH';
	if (score >= CONFIDENCE_THRESHOLDS.PROCEED_WARN) return 'MEDIUM';
	if (score >= CONFIDENCE_THRESHOLDS.RETRY) return 'LOW';
	return 'CRITICAL';
}

export function scoreIngestion({ repoMeta = {}, extractedPath, errors = [] } = {}) {
	const base = errors.length > 0 ? 0.9 : 1;
	const archiveExtractedCleanly = extractedPath ? 1 : 0.3;

	const repoHasMarkers =
		repoMeta.repoHasMarkers ??
		repoMeta.hasMarkers ??
		(Array.isArray(repoMeta.markers) ? repoMeta.markers.length > 0 : false);
	const markerFactor = repoHasMarkers ? 1 : 0.7;

	const estimatedFileCount = toNumber(repoMeta.estimatedFileCount, 500);
	const sizeFactor = Math.min(1, 500 / Math.max(estimatedFileCount, 500));

	return round3(base * archiveExtractedCleanly * markerFactor * sizeFactor);
}

export function scoreScanner({ totalFiles = 0, eligibleFiles = 0, permissionErrors = 0 } = {}) {
	const eligibleRatio = safeDiv(eligibleFiles, Math.max(totalFiles, 1), 0);
	const ratioFactor = eligibleRatio > 0.05 ? 1 : safeDiv(eligibleRatio, 0.05, 0);
	const hasEligibleFactor = eligibleFiles > 0 ? 1 : 0;
	const permissionFactor = permissionErrors > 0 ? 0.7 : 1;

	return round3(ratioFactor * hasEligibleFactor * permissionFactor);
}

export function scoreParser({ totalAttempted = 0, successCount = 0, failedCount = 0 } = {}) {
	const parseRate = safeDiv(successCount, Math.max(totalAttempted, 1), 0);
	const errorPenalty = Math.min(0.3, safeDiv(failedCount, Math.max(totalAttempted, 1), 0));
	return round3(parseRate * (1 - errorPenalty));
}

export function scoreGraphBuilder({
	resolvedEdges = 0,
	resolvedLocalEdges = resolvedEdges,
	totalImportSpecifiers = 0,
	localImportSpecifiers,
	cyclesDetected = 0,
} = {}) {
	const attemptedLocalImports = Number.isFinite(Number(localImportSpecifiers))
		? Math.max(toNumber(localImportSpecifiers, 0), 0)
		: Math.max(toNumber(totalImportSpecifiers, 0), 0);
	const resolutionRate =
		attemptedLocalImports > 0
			? safeDiv(resolvedLocalEdges, attemptedLocalImports, 0)
			: totalImportSpecifiers > 0
				? 0.9
				: 1;
	const cyclePenalty = Math.min(0.15, toNumber(cyclesDetected, 0) * 0.03);
	return round3(resolutionRate * (1 - cyclePenalty));
}

export function scoreEnrichment({ totalFiles = 0, enrichedCount = 0, apiErrors = 0, batchesAttempted = 0 } = {}) {
	const enrichRate = safeDiv(enrichedCount, Math.max(totalFiles, 1), 0);
	const apiSuccess = 1 - safeDiv(apiErrors, Math.max(batchesAttempted, 1), 0);
	return round3(enrichRate * clamp01(apiSuccess));
}

export function scoreEmbedding({ attempted = 0, succeeded = 0 } = {}) {
	return round3(safeDiv(succeeded, Math.max(attempted, 1), 0));
}

export function scorePersistence({ recordsAttempted = 0, recordsWritten = 0 } = {}) {
	return round3(safeDiv(recordsWritten, Math.max(recordsAttempted, 1), 0));
}

export function scoreAnalysis() {
	return 0.95;
}

export function computeOverallConfidence(agentTrace = [], weights = DEFAULT_AGENT_WEIGHTS) {
	if (!Array.isArray(agentTrace) || agentTrace.length === 0) return 0;

	let logSum = 0;
	let weightSum = 0;

	for (const result of agentTrace) {
		const weight = toNumber(weights[result?.agentId], 0.1);
		const confidence = clamp01(result?.confidence);
		logSum += weight * Math.log(Math.max(confidence, 0.001));
		weightSum += weight;
	}

	if (weightSum <= 0) return 0;
	return Number(Math.exp(logSum / weightSum).toFixed(3));
}

