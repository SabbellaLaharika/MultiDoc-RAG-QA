/**
 * Vector Store
 *
 * Hybrid vector database module. Backed either by Pinecone Cloud (if VECTOR_DB_TYPE=pinecone)
 * or a local in-memory Map (if VECTOR_DB_TYPE=memory).
 *
 * Metadata payload stored per vector:
 *   { id, text, filename, page_number, document_id, chunk_index }
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { config } from '../config.js';

// ─── Store Implementations ────────────────────────────────────────────────────

/** @type {Map<string, { vector: number[], metadata: Object }>} */
const memoryStore = new Map();
let pineconeIndex = null;

if (config.vectorDbType === 'pinecone' && process.env.NODE_ENV !== 'test') {
  if (!config.vectorDbApiKey) {
    console.warn('⚠️ PINECONE_API_KEY missing. Falling back to memory vector store.');
    config.vectorDbType = 'memory';
  } else {
    try {
      const pc = new Pinecone({ apiKey: config.vectorDbApiKey });
      pineconeIndex = pc.index(config.pineconeIndex);
      console.log(`✅ Initialized Pinecone connection for index: ${config.pineconeIndex}`);
    } catch (err) {
      console.error('❌ Pinecone initialization failed, falling back to memory store:', err.message);
      config.vectorDbType = 'memory';
    }
  }
} else if (config.vectorDbType === 'pinecone' && process.env.NODE_ENV === 'test') {
  // Always use memory store during testing — never hit external APIs
  config.vectorDbType = 'memory';
}

// ─── Math Utilities (for Memory Store) ────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, dot));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upsert a single vector record.
 */
export async function upsertVector(id, vector, metadata) {
  if (config.vectorDbType === 'pinecone' && pineconeIndex) {
    await pineconeIndex.namespace('').upsert({ records: [{ id, values: Array.from(vector), metadata }] });
  } else {
    memoryStore.set(id, { vector, metadata });
  }
}

/**
 * Batch-upsert multiple vector records.
 */
export async function upsertVectors(records) {
  if (config.vectorDbType === 'pinecone' && pineconeIndex) {
    // Pinecone expects { id, values, metadata }
    const pcRecords = records.map(r => ({
      id: r.id,
      values: Array.from(r.vector),
      metadata: r.metadata
    }));

    // Upsert in batches of 100 to avoid Pinecone payload limits
    const BATCH_SIZE = 100;
    for (let i = 0; i < pcRecords.length; i += BATCH_SIZE) {
      const batch = pcRecords.slice(i, i + BATCH_SIZE);
      await pineconeIndex.namespace('').upsert({ records: batch });
    }
  } else {
    for (const { id, vector, metadata } of records) {
      memoryStore.set(id, { vector, metadata });
    }
  }
}

/**
 * Perform a similarity search.
 */
export async function similaritySearch(queryVector, topK = config.topK, threshold = config.similarityThreshold) {
  if (config.vectorDbType === 'pinecone' && pineconeIndex) {
    try {
      const queryResponse = await pineconeIndex.namespace('').query({
        vector: queryVector,
        topK,
        includeMetadata: true
      });

      // Filter by threshold and map to standard format
      return queryResponse.matches
        .filter(match => match.score >= threshold)
        .map(match => ({
          score: match.score,
          metadata: match.metadata
        }));
    } catch (err) {
      console.error('Pinecone search error:', err);
      return [];
    }
  } else {
    // Memory store brute-force search
    if (memoryStore.size === 0) return [];

    const results = [];
    for (const [, { vector, metadata }] of memoryStore) {
      const score = cosineSimilarity(queryVector, vector);
      results.push({ score, metadata });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .filter(r => r.score >= threshold)
      .slice(0, topK);
  }
}

/**
 * Delete all vectors associated with a specific document_id.
 */
export async function deleteDocumentVectors(documentId) {
  if (config.vectorDbType === 'pinecone' && pineconeIndex) {
    // Pinecone doesn't support deleting by metadata natively in the free tier easily 
    // without fetching IDs first, so we use list/query or just accept it's a limitation for now.
    // For production, you'd fetch IDs matching the metadata and delete them.
    console.warn(`Pinecone document deletion not fully implemented for id ${documentId}`);
  } else {
    for (const [key, { metadata }] of memoryStore) {
      if (metadata.document_id === documentId) {
        memoryStore.delete(key);
      }
    }
  }
}

/**
 * Return total number of vectors currently stored.
 */
export async function getVectorCount() {
  if (config.vectorDbType === 'pinecone' && pineconeIndex) {
    const stats = await pineconeIndex.describeIndexStats();
    return stats.totalRecordCount || 0;
  }
  return memoryStore.size;
}

/**
 * Clear all vectors from the store (used in testing).
 */
export async function clearVectorStore() {
  if (config.vectorDbType === 'pinecone' && pineconeIndex) {
    await pineconeIndex.deleteAll();
  } else {
    memoryStore.clear();
  }
}
