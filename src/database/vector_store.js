/**
 * Vector Store
 *
 * In-memory vector database for storing and searching document chunk embeddings.
 * Supports cosine similarity search with a configurable confidence threshold.
 *
 * Architecture:
 *   All vectors and their metadata payloads are stored in a module-level Map.
 *   Similarity search uses brute-force cosine similarity — fast enough for
 *   typical RAG workloads (tens of thousands of chunks).
 *
 * Metadata payload stored per vector:
 *   { id, text, filename, page_number, document_id, chunk_index }
 */

import { config } from '../config.js';

// ─── In-Memory Store ──────────────────────────────────────────────────────────

/** @type {Map<string, { vector: number[], metadata: Object }>} */
const store = new Map();

// ─── Math Utilities ───────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two L2-normalised vectors.
 * Since both vectors are unit-length, dot-product == cosine similarity.
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score in range [0, 1]
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // Clamp to [0, 1] to avoid floating-point edge cases
  return Math.max(0, Math.min(1, dot));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upsert a single vector record into the store.
 *
 * @param {string}   id       - Unique chunk identifier
 * @param {number[]} vector   - Embedding vector
 * @param {Object}   metadata - { text, filename, page_number, document_id, chunk_index }
 */
export function upsertVector(id, vector, metadata) {
  store.set(id, { vector, metadata });
}

/**
 * Batch-upsert multiple vector records (optimised for ingestion pipeline).
 *
 * @param {Array<{ id: string, vector: number[], metadata: Object }>} records
 */
export function upsertVectors(records) {
  for (const { id, vector, metadata } of records) {
    store.set(id, { vector, metadata });
  }
}

/**
 * Perform a similarity search against all stored vectors.
 *
 * Steps:
 *   1. Compute cosine similarity between queryVector and every stored vector.
 *   2. Sort results by descending similarity score.
 *   3. Discard any result whose score is below the SIMILARITY_THRESHOLD.
 *   4. Return the top-K remaining results.
 *
 * @param {number[]} queryVector       - Embedded query vector
 * @param {number}   [topK]            - Max number of results (default from config)
 * @param {number}   [threshold]       - Min confidence score (default from config)
 * @returns {Array<{ score: number, metadata: Object }>}
 */
export function similaritySearch(queryVector, topK = config.topK, threshold = config.similarityThreshold) {
  if (store.size === 0) return [];

  const results = [];

  for (const [, { vector, metadata }] of store) {
    const score = cosineSimilarity(queryVector, vector);
    results.push({ score, metadata });
  }

  return results
    .sort((a, b) => b.score - a.score)   // descending similarity
    .filter(r => r.score >= threshold)    // apply confidence threshold guard
    .slice(0, topK);                      // return top-K only
}

/**
 * Delete all vectors associated with a specific document_id.
 * Useful when re-ingesting an updated document.
 *
 * @param {string} documentId
 */
export function deleteDocumentVectors(documentId) {
  for (const [key, { metadata }] of store) {
    if (metadata.document_id === documentId) {
      store.delete(key);
    }
  }
}

/**
 * Return total number of vectors currently stored.
 */
export function getVectorCount() {
  return store.size;
}

/**
 * Clear all vectors from the store.
 * Used primarily in testing.
 */
export function clearVectorStore() {
  store.clear();
}
