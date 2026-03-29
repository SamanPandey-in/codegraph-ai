export class JobStatusEmitter {
	constructor(redis, options = {}) {
		this.redis = redis;
		this.channelPrefix = options.channelPrefix || 'job:';
	}

	channel(jobId) {
		return `${this.channelPrefix}${jobId}`;
	}

	async emit(jobId, payload = {}) {
		if (!jobId) {
			console.warn('[JobStatusEmitter] Missing jobId; skipping publish');
			return 0;
		}

		if (!this.redis || typeof this.redis.publish !== 'function') {
			console.warn('[JobStatusEmitter] No Redis client configured; skipping publish');
			return 0;
		}

		const message = {
			jobId,
			timestamp: new Date().toISOString(),
			...payload,
		};

		try {
			return await this.redis.publish(this.channel(jobId), JSON.stringify(message));
		} catch (error) {
			console.error('[JobStatusEmitter] Failed to publish job status:', error.message);
			return 0;
		}
	}
}
