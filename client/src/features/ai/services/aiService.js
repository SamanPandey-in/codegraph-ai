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
};
