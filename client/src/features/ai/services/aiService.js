import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

const aiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

function normalizeText(value) {
  return String(value || '').trim();
}

function resolveApiUrl(pathname) {
  const trimmedBase = apiBaseUrl.trim();

  if (!trimmedBase) return pathname;

  if (/^https?:\/\//i.test(trimmedBase)) {
    return new URL(pathname, trimmedBase).toString();
  }

  return `${trimmedBase.replace(/\/$/, '')}${pathname}`;
}

function buildExplainQuestion({ filePath, nodeLabel, question }) {
  const customQuestion = normalizeText(question);
  if (customQuestion) return customQuestion;

  const target = normalizeText(nodeLabel) || normalizeText(filePath) || 'this node';

  return [
    'Explain this node in the repository graph.',
    `Target: ${target}`,
    'Include responsibilities, key dependencies, likely dependents, and risk/impact notes.',
  ].join(' ');
}

async function postQuery({ question, jobId }) {
  const { data } = await aiClient.post('/api/ai/query', { question, jobId });
  return data;
}

export const aiService = {
  async queryGraph({ question, jobId }) {
    const normalizedQuestion = normalizeText(question);
    const normalizedJobId = normalizeText(jobId);

    if (!normalizedQuestion || !normalizedJobId) {
      throw new Error('queryGraph requires question and jobId.');
    }

    return await postQuery({
      question: normalizedQuestion,
      jobId: normalizedJobId,
    });
  },

  async getQueryHistory({ jobId, page = 1, limit = 20 } = {}) {
    const params = {
      page: Math.max(1, Number.parseInt(page, 10) || 1),
      limit: Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 20)),
    };

    const normalizedJobId = normalizeText(jobId);
    if (normalizedJobId) params.jobId = normalizedJobId;

    const { data } = await aiClient.get('/api/ai/queries', { params });
    return {
      queries: Array.isArray(data?.queries) ? data.queries : [],
      page: Number.isFinite(data?.page) ? data.page : params.page,
      limit: Number.isFinite(data?.limit) ? data.limit : params.limit,
    };
  },

  async explainNode({ jobId, filePath, nodeLabel, question }) {
    const normalizedJobId = normalizeText(jobId);
    if (!normalizedJobId) {
      throw new Error('explainNode requires jobId.');
    }

    const effectiveQuestion = buildExplainQuestion({ filePath, nodeLabel, question });
    const result = await postQuery({ question: effectiveQuestion, jobId: normalizedJobId });

    return {
      ...result,
      question: effectiveQuestion,
      filePath: normalizeText(filePath) || null,
      nodeLabel: normalizeText(nodeLabel) || null,
    };
  },

  async analyzeImpact({ jobId, filePath }) {
    const normalizedJobId = normalizeText(jobId);
    const normalizedFilePath = normalizeText(filePath);

    if (!normalizedJobId || !normalizedFilePath) {
      throw new Error('analyzeImpact requires jobId and filePath.');
    }

    const { data } = await aiClient.post('/api/ai/impact', {
      jobId: normalizedJobId,
      filePath: normalizedFilePath,
    });

    return data;
  },

  async suggestRefactor({ jobId, filePath }) {
    const normalizedJobId = normalizeText(jobId);
    const normalizedFilePath = normalizeText(filePath);

    if (!normalizedJobId || !normalizedFilePath) {
      throw new Error('suggestRefactor requires jobId and filePath.');
    }

    const { data } = await aiClient.post('/api/ai/suggest-refactor', {
      jobId: normalizedJobId,
      filePath: normalizedFilePath,
    });

    return {
      filePath: normalizeText(data?.filePath) || normalizedFilePath,
      concerns: Array.isArray(data?.concerns) ? data.concerns : [],
      suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
      priority: normalizeText(data?.priority) || 'medium',
      estimatedEffort: normalizeText(data?.estimatedEffort) || 'unknown',
    };
  },

  async streamExplain({ question, jobId, onChunk, onDone, onError, signal } = {}) {
    const normalizedQuestion = normalizeText(question);
    const normalizedJobId = normalizeText(jobId);

    if (!normalizedQuestion || !normalizedJobId) {
      throw new Error('streamExplain requires question and jobId.');
    }

    const url = resolveApiUrl('/api/ai/explain/stream');
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: normalizedQuestion, jobId: normalizedJobId }),
      signal,
    });

    if (!response.ok) {
      let message = `Streaming request failed with status ${response.status}.`;

      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {
        // Ignore JSON parsing failures and keep the fallback message.
      }

      const error = new Error(message);
      onError?.(error);
      throw error;
    }

    if (!response.body) {
      const error = new Error('Streaming response body is not available.');
      onError?.(error);
      throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6).trim();
          if (!payload) continue;

          if (payload === '[DONE]') {
            onDone?.();
            return;
          }

          try {
            const parsed = JSON.parse(payload);
            if (parsed?.error) {
              const error = new Error(parsed.error);
              onError?.(error);
              throw error;
            }

            if (parsed?.text) {
              onChunk?.(parsed.text);
            }
          } catch (error) {
            if (error instanceof SyntaxError) {
              // Ignore malformed stream chunks and continue receiving valid chunks.
              continue;
            }

            throw error;
          }
        }
      }

      onDone?.();
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      onError?.(error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  },
};
