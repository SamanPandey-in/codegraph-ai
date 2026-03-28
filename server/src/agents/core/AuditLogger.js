import crypto from 'crypto';

function normalizeConfidence(confidence) {
	const value = Number(confidence);
	if (!Number.isFinite(value)) return null;
	return Math.min(1, Math.max(0, Number(value.toFixed(3))));
}

function toJson(value, fallback) {
	if (value === undefined || value === null) return fallback;
	return value;
}

export class AuditLogger {
	constructor(db) {
		this.db = db;
	}

	static hashInput(input) {
		if (input === undefined) return null;
		const raw = typeof input === 'string' ? input : JSON.stringify(input);
		return crypto.createHash('sha256').update(raw).digest('hex');
	}

	async log({
		jobId,
		agentId,
		attempt = 1,
		status = 'failed',
		confidence,
		inputHash = null,
		metrics = {},
		errors = [],
		warnings = [],
		processingTimeMs = 0,
	} = {}) {
		if (!this.db || typeof this.db.query !== 'function') {
			console.warn('[AuditLogger] No database client configured; skipping audit log write');
			return null;
		}

		if (!jobId || !agentId) {
			console.warn('[AuditLogger] Missing required fields (jobId/agentId); skipping audit log write');
			return null;
		}

		const sql = `
			INSERT INTO agent_audit_log (
				job_id,
				agent_id,
				attempt,
				status,
				confidence,
				input_hash,
				metrics,
				errors,
				warnings,
				processing_ms
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)
			RETURNING id, created_at
		`;

		const values = [
			jobId,
			agentId,
			Number.isInteger(attempt) ? attempt : 1,
			status,
			normalizeConfidence(confidence),
			inputHash,
			JSON.stringify(toJson(metrics, {})),
			JSON.stringify(toJson(errors, [])),
			JSON.stringify(toJson(warnings, [])),
			Number.isFinite(Number(processingTimeMs)) ? Number(processingTimeMs) : 0,
		];

		try {
			const result = await this.db.query(sql, values);
			return result.rows?.[0] ?? null;
		} catch (error) {
			console.error('[AuditLogger] Failed to write audit log:', error.message);
			return null;
		}
	}
}
