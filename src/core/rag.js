/**
 * RAG Ingestion Orchestrator
 *
 * This module is the central coordinator for the Ingestion Pipeline.
 * It cleanly decouples the API layer from the service/database layers by
 * orchestrating the full pipeline in a single function:
 *
 *   parseDocument → chunkDocument → embedBatch → upsertVectors → createDocument
 *
 * Separation of concerns:
 *   - src/api/upload.js  → HTTP boundary (file validation, request/response)
 *   - src/core/rag.js    → Orchestration (pipeline coordination)
 *   - src/services/*     → Domain services (parsing, chunking, embedding)
 *   - src/database/*     → Persistence (vector store, relational DB)
 */

import { v4 as uuidv4 } from 'uuid';
import { parseDocument } from '../services/document.js';
import { chunkDocument } from '../services/chunking.js';
import { embedBatch } from '../services/embedding.js';
import { upsertVectors } from '../database/vector_store.js';
import { createDocument } from '../database/relational.js';
import { config } from '../config.js';

/**
 * Run the full ingestion pipeline for a single uploaded file.
 *
 * @param {Buffer} fileBuffer   - Raw file buffer from multer
 * @param {string} filename     - Original filename (e.g. "employee_handbook.pdf")
 * @param {string} mimeType     - MIME type reported by the client
 * @returns {Promise<Object>}   - { id, filename, chunks } ingestion summary
 */
export async function ingestDocument(fileBuffer, filename, mimeType) {
  const documentId = uuidv4();

  // ── Step 1: Parse document into pages with page numbers ──────────────────
  const parsedDoc = await parseDocument(fileBuffer, filename, mimeType);

  // ── Step 2: Sliding-window chunk each page ────────────────────────────────
  const chunks = chunkDocument(parsedDoc, {
    documentId,
    chunkSize: 1000,
    overlap: 200
  });

  if (chunks.length === 0) {
    throw new Error(`No text content could be extracted from "${filename}".`);
  }

  // ── Step 3: Batch-embed all chunks (groups of 50 to respect rate limits) ──
  const chunkTexts = chunks.map(c => c.text);
  const vectors = await embedBatch(chunkTexts);

  // ── Step 4: Upsert vectors + metadata payload into Vector DB ──────────────
  const vectorRecords = chunks.map((chunk, i) => ({
    id: chunk.id,
    vector: vectors[i],
    metadata: {
      text: chunk.text,
      filename: chunk.filename,
      page_number: chunk.page_number,
      document_id: documentId,
      chunk_index: chunk.chunk_index
    }
  }));
  await upsertVectors(vectorRecords);

  // ── Step 5: Log document metadata into Relational DB ─────────────────────
  await createDocument({
    id: documentId,
    filename,
    file_type: parsedDoc.fileType,
    chunk_count: chunks.length
  });

  return {
    id: documentId,
    filename,
    chunks: chunks.length
  };
}
