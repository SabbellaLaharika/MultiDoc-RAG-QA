/**
 * Embedding Service
 *
 * Generates consistent floating-point vector representations for text.
 * The SAME model / algorithm MUST be used for both document ingestion
 * and user query embedding — mixing models breaks the vector space.
 *
 * Strategy:
 *   Provider 'local'  → Zero-cost deterministic TF-IDF-style sparse-dense
 *                       hybrid vectors (no API key required). Works offline.
 *   Provider 'openai' → OpenAI text-embedding-3-small (requires OPENAI_API_KEY).
 */

import { config } from '../config.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOCAL_DIM = 384; // Vector dimensionality for local embeddings

// ─── Utility helpers ─────────────────────────────────────────────────────────

/**
 * Tokenise a string into normalised lowercase word tokens
 */
function tokenise(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Simple hash function (djb2) — maps a string to a deterministic integer
 */
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * L2-normalise a vector so all vectors live on the unit hypersphere.
 * This makes dot-product == cosine similarity.
 */
function l2Normalise(vec) {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map(v => v / magnitude);
}

// ─── Local Embedding Engine ───────────────────────────────────────────────────

/**
 * Generate a deterministic LOCAL embedding vector for a text string.
 *
 * Technique: hashing-trick projection
 *   1. Tokenise text into unigrams and bigrams.
 *   2. Each n-gram is hashed into a position in a LOCAL_DIM-dimensional vector.
 *   3. The value at each position is accumulated with term frequency weighting.
 *   4. The resulting vector is L2-normalised.
 *
 * Properties:
 *   • Deterministic — same text always produces the same vector.
 *   • Semantic proximity — texts sharing rare words will cluster together.
 *   • Zero-cost — pure JavaScript, no network call needed.
 */
function localEmbed(text) {
  const tokens = tokenise(text);
  if (tokens.length === 0) return new Array(LOCAL_DIM).fill(0);

  const vec = new Array(LOCAL_DIM).fill(0);

  // Unigrams
  for (const token of tokens) {
    const pos = djb2Hash(token) % LOCAL_DIM;
    vec[pos] += 1;
  }

  // Bigrams — capture local word order / phrase context
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    const pos = djb2Hash(bigram) % LOCAL_DIM;
    vec[pos] += 0.5;
  }

  return l2Normalise(vec);
}

// ─── OpenAI Embedding Engine ─────────────────────────────────────────────────

/**
 * Call OpenAI embeddings API in batches of up to 50 texts.
 * Identical model must be used for both ingestion and querying.
 */
async function openAiEmbedBatch(texts) {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set in your .env file.');
  }

  const BATCH_SIZE = 50;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: batch
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI Embeddings API error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    const sorted = json.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map(d => d.embedding));
  }

  return allEmbeddings;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Embed a SINGLE text string into a float vector.
 * Uses the same provider for both document ingestion and query embedding.
 *
 * @param {string} text - Input text to embed
 * @returns {Promise<number[]>} - Normalised float embedding vector
 */
export async function embedText(text) {
  if (!text || text.trim().length === 0) {
    return new Array(LOCAL_DIM).fill(0);
  }

  if (config.embeddingProvider === 'openai') {
    const [embedding] = await openAiEmbedBatch([text]);
    return embedding;
  }

  // Default: local deterministic embedding
  return localEmbed(text);
}

/**
 * Embed MULTIPLE text strings in batch (optimised for ingestion pipeline).
 * Batching is critical — sending one-by-one is slow and hits rate limits.
 *
 * @param {string[]} texts - Array of text strings
 * @returns {Promise<number[][]>} - Array of float embedding vectors
 */
export async function embedBatch(texts) {
  if (!texts || texts.length === 0) return [];

  if (config.embeddingProvider === 'openai') {
    return openAiEmbedBatch(texts);
  }

  // Local: synchronous and instant, no batching overhead
  return texts.map(t => localEmbed(t));
}

/**
 * Returns the dimensionality of the current embedding vectors.
 * Must be consistent across ingestion and retrieval.
 */
export function getEmbeddingDimension() {
  if (config.embeddingProvider === 'openai') return 1536; // text-embedding-3-small
  return LOCAL_DIM;
}
