import { pgPool } from '../../infrastructure/connections.js';
import { createEmbeddingClient } from '../../services/ai/llmProvider.js';
import { logger } from '../../utils/logger.js';

const BATCH_SIZE = 50;
const EMBED_CONTENT_LIMIT = 4000;

function toVectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) return null;

  const normalized = embedding.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (normalized.length === 0) return null;
  return `[${normalized.join(',')}]`;
}

function lineSpanForContent(rawContent, content) {
  if (!rawContent || !content) {
    return { startLine: null, endLine: null };
  }

  const offset = String(rawContent).indexOf(String(content));
  if (offset < 0) {
    return { startLine: null, endLine: null };
  }

  const before = String(rawContent).slice(0, offset);
  const startLine = before.split(/\r?\n/).length;
  const endLine = startLine + String(content).split(/\r?\n/).length - 1;

  return { startLine, endLine };
}

function buildEmbeddingText(row) {
  return [
    `Function: ${row.function_name}`,
    `File: ${row.file_path} (${row.file_type || 'module'})`,
    row.kind ? `Kind: ${row.kind}` : '',
    row.file_summary ? `File context: ${row.file_summary}` : '',
    `Source:\n${String(row.content || '').slice(0, EMBED_CONTENT_LIMIT)}`,
    Array.isArray(row.calls) && row.calls.length > 0
      ? `Calls: ${row.calls.map((call) => call?.name || call).filter(Boolean).join(', ')}`
      : '',
  ].filter(Boolean).join('\n');
}

export class FunctionChunker {
  constructor({ db, embeddingClient } = {}) {
    this.db = db || pgPool;
    this.embeddingClient = embeddingClient || createEmbeddingClient();
  }

  async run(jobId, { functionNodes = null, graph = null } = {}) {
    if (!jobId) throw new Error('jobId is required');

    if (!this.embeddingClient?.isConfigured?.()) {
      logger.warn('[FunctionChunker] Embedding client not configured; skipping.');
      return { attempted: 0, succeeded: 0, failed: 0 };
    }

    let fnRows = [];

    if (functionNodes && typeof functionNodes === 'object') {
      const perFileChunkIndex = new Map();

      for (const [filePath, declarations] of Object.entries(functionNodes)) {
        if (!Array.isArray(declarations)) continue;

        for (const declaration of declarations) {
          if (!declaration?.name) continue;
          const rawContent = graph?.[filePath]?.rawContent || graph?.[filePath]?.raw_content || null;
          const content = declaration.bodySource || declaration.body_source || null;
          if (!content) continue;

          const { startLine, endLine } = lineSpanForContent(rawContent, content);
          const chunkIndex = perFileChunkIndex.get(filePath) || 0;
          perFileChunkIndex.set(filePath, chunkIndex + 1);

          fnRows.push({
            job_id: jobId,
            file_path: filePath,
            function_name: declaration.name,
            kind: declaration.kind || 'function',
            calls: declaration.calls || [],
            body_source: content,
            content,
            chunk_index: chunkIndex,
            start_line: startLine,
            end_line: endLine,
            file_summary: graph?.[filePath]?.summary || null,
            file_type: graph?.[filePath]?.type || 'module',
          });
        }
      }
    } else {
      const { rows } = await this.db.query(
        `
          SELECT
            fn.job_id,
            fn.file_path,
            fn.name AS function_name,
            fn.kind,
            fn.calls,
            fn.body_source,
            gn.raw_content,
            gn.summary AS file_summary,
            gn.file_type
          FROM function_nodes fn
          LEFT JOIN graph_nodes gn
            ON gn.job_id = fn.job_id AND gn.file_path = fn.file_path
          WHERE fn.job_id = $1
        `,
        [jobId],
      );

      fnRows = rows;

      const perFileChunkIndex = new Map();
      fnRows = fnRows
        .map((row) => {
          const content = row.body_source || null;
          if (!content) return null;

          const { startLine, endLine } = lineSpanForContent(row.raw_content, content);
          const chunkIndex = perFileChunkIndex.get(row.file_path) || 0;
          perFileChunkIndex.set(row.file_path, chunkIndex + 1);

          return {
            ...row,
            content,
            chunk_index: chunkIndex,
            start_line: startLine,
            end_line: endLine,
          };
        })
        .filter(Boolean);
    }

    if (!fnRows.length) {
      return { attempted: 0, succeeded: 0, failed: 0 };
    }

    let attempted = fnRows.length;
    let succeeded = 0;
    let failed = 0;

    await this.db.query('DELETE FROM code_chunks WHERE job_id = $1', [jobId]).catch((error) => {
      logger.warn('[FunctionChunker] Could not clear previous code_chunks rows:', error.message);
    });

    for (let i = 0; i < fnRows.length; i += BATCH_SIZE) {
      const batch = fnRows.slice(i, i + BATCH_SIZE);
      const texts = batch.map(buildEmbeddingText);

      try {
        const response = await this.embeddingClient.createEmbedding({ model: this.embeddingClient.model, input: texts });
        const vectors = Array.isArray(response?.data) ? response.data : [];

        for (let index = 0; index < batch.length; index += 1) {
          const vector = vectors[index]?.embedding;
          const literal = toVectorLiteral(vector);
          if (!literal) {
            failed += 1;
            continue;
          }

          const row = batch[index];
          await this.db.query(
            `
              INSERT INTO function_embeddings (job_id, file_path, function_name, embedding, body_summary)
              VALUES ($1, $2, $3, $4::vector, $5)
              ON CONFLICT (job_id, file_path, function_name) DO UPDATE
              SET embedding = EXCLUDED.embedding,
                  body_summary = EXCLUDED.body_summary
            `,
            [jobId, row.file_path, row.function_name, literal, row.body_source || row.file_summary || null],
          );

          await this.db.query(
            `
              INSERT INTO code_chunks (job_id, file_path, chunk_index, start_line, end_line, content, embedding)
              VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
              ON CONFLICT (job_id, file_path, chunk_index) DO UPDATE
              SET start_line = EXCLUDED.start_line,
                  end_line = EXCLUDED.end_line,
                  content = EXCLUDED.content,
                  embedding = EXCLUDED.embedding
            `,
            [jobId, row.file_path, row.chunk_index, row.start_line, row.end_line, row.content, literal],
          );
          succeeded += 1;
        }
      } catch (error) {
        logger.error('[FunctionChunker] batch error:', error.message);
        failed += batch.length;
      }
    }

    return { attempted, succeeded, failed };
  }
}
