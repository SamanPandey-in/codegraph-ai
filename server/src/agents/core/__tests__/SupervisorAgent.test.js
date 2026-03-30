import { describe, expect, it, vi } from 'vitest';
import { SupervisorAgent } from '../SupervisorAgent.js';

function buildAgent(confidence, status = 'success') {
  return {
    agentId: 'test-agent',
    maxRetries: 2,
    timeoutMs: 50,
    process: vi.fn().mockResolvedValue({
      agentId: 'test-agent',
      status,
      confidence,
      data: {},
      errors: [],
      warnings: [],
      metrics: {},
      processingTimeMs: 5,
    }),
    buildResult: vi.fn((payload) => payload),
  };
}

describe('SupervisorAgent _runWithSupervision', () => {
  it('returns result for high confidence', async () => {
    const supervisor = new SupervisorAgent({});
    supervisor._sleep = vi.fn().mockResolvedValue(undefined);

    const agent = buildAgent(0.9);
    const result = await supervisor._runWithSupervision(agent, {}, { jobId: 'job-1' });

    expect(result.status).toBe('success');
    expect(result.retryCount).toBe(0);
    expect(agent.process).toHaveBeenCalledTimes(1);
  });

  it('returns PROCEED_WARN path with warning for medium confidence', async () => {
    const supervisor = new SupervisorAgent({});
    supervisor._sleep = vi.fn().mockResolvedValue(undefined);

    const agent = buildAgent(0.7);
    const result = await supervisor._runWithSupervision(agent, {}, { jobId: 'job-1' });

    expect(result.status).toBe('success');
    expect(result.warnings).toContain('Proceeding with medium confidence');
    expect(agent.process).toHaveBeenCalledTimes(1);
  });

  it('retries for low confidence and fails after max retries', async () => {
    const supervisor = new SupervisorAgent({});
    supervisor._sleep = vi.fn().mockResolvedValue(undefined);

    const agent = buildAgent(0.5);
    const result = await supervisor._runWithSupervision(agent, {}, { jobId: 'job-1' });

    expect(result.status).toBe('failed');
    expect(result.errors.at(-1)?.message).toContain('too low to continue');
    expect(agent.process).toHaveBeenCalledTimes(3);
    expect(supervisor._sleep).toHaveBeenCalledTimes(2);
  });

  it('aborts immediately for critical confidence', async () => {
    const supervisor = new SupervisorAgent({});
    supervisor._sleep = vi.fn().mockResolvedValue(undefined);

    const agent = buildAgent(0.2);
    const result = await supervisor._runWithSupervision(agent, {}, { jobId: 'job-1' });

    expect(result.status).toBe('failed');
    expect(agent.process).toHaveBeenCalledTimes(1);
    expect(supervisor._sleep).not.toHaveBeenCalled();
  });
});
