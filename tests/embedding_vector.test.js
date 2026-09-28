import test from 'node:test';
import assert from 'node:assert/strict';
import { embedText, embedBatch, getEmbeddingDimension } from '../src/services/embedding.js';
import {
  upsertVector,
  upsertVectors,
  similaritySearch,
  deleteDocumentVectors,
  getVectorCount,
  clearVectorStore
} from '../src/database/vector_store.js';

test('Phase 4: Embedding Engine', async (t) => {
  await t.test('embedText should return a float vector of correct dimension', async () => {
    const vec = await embedText('Employees get 20 days of PTO per year.');
    assert.ok(Array.isArray(vec));
    assert.equal(vec.length, getEmbeddingDimension());
    assert.ok(vec.every(v => typeof v === 'number' && isFinite(v)));
  });

  await t.test('embedText should return same vector for identical input (deterministic)', async () => {
    const text = 'Contractors are not eligible for health benefits.';
    const vec1 = await embedText(text);
    const vec2 = await embedText(text);
    assert.deepEqual(vec1, vec2);
  });

  await t.test('embedBatch should return one vector per input text', async () => {
    const texts = [
      'Chapter 1: Attendance Policy',
      'Chapter 2: PTO and Leave',
      'Chapter 3: Code of Conduct'
    ];
    const vecs = await embedBatch(texts);
    assert.equal(vecs.length, 3);
    for (const v of vecs) {
      assert.ok(Array.isArray(v));
      assert.equal(v.length, getEmbeddingDimension());
    }
  });

  await t.test('similar texts should produce higher cosine similarity than dissimilar texts', async () => {
    const query = await embedText('How many vacation days do employees get?');
    const relevant = await embedText('Employees are entitled to 20 days of paid time off per year.');
    const irrelevant = await embedText('The server room must maintain a temperature of 18 degrees Celsius.');

    // Compute dot products (L2-normalised vectors → dot == cosine sim)
    const simRelevant = query.reduce((s, v, i) => s + v * relevant[i], 0);
    const simIrrelevant = query.reduce((s, v, i) => s + v * irrelevant[i], 0);

    assert.ok(simRelevant > simIrrelevant, `Expected relevant (${simRelevant.toFixed(3)}) > irrelevant (${simIrrelevant.toFixed(3)})`);
  });
});

test('Phase 4: Vector Store', async (t) => {
  // Clear store before each test group to isolate state
  t.beforeEach(() => clearVectorStore());

  await t.test('upsertVector should store and count a single record', async () => {
    const vec = await embedText('Sample PTO policy text.');
    upsertVector('chunk_1', vec, {
      text: 'Sample PTO policy text.',
      filename: 'employee_handbook.pdf',
      page_number: 14,
      document_id: 'doc_001',
      chunk_index: 0
    });
    assert.equal(getVectorCount(), 1);
  });

  await t.test('upsertVectors should store multiple records in batch', async () => {
    const texts = [
      'Employees receive 20 days PTO.',
      'Contractors are billed hourly.',
      'Password must be 12 characters.'
    ];
    const vecs = await embedBatch(texts);
    const records = vecs.map((vector, i) => ({
      id: `chunk_${i}`,
      vector,
      metadata: { text: texts[i], filename: `doc${i}.pdf`, page_number: i + 1, document_id: 'doc_002', chunk_index: i }
    }));
    upsertVectors(records);
    assert.equal(getVectorCount(), 3);
  });

  await t.test('similaritySearch should return top-K results above threshold', async () => {
    const docs = [
      { id: 'c1', text: 'Employees get 20 days of paid time off each year.', page: 14 },
      { id: 'c2', text: 'Contractors are not entitled to vacation or health benefits.', page: 2 },
      { id: 'c3', text: 'All staff must submit timesheets by Friday 5 PM.', page: 5 }
    ];

    const vecs = await embedBatch(docs.map(d => d.text));
    upsertVectors(docs.map((d, i) => ({
      id: d.id,
      vector: vecs[i],
      metadata: { text: d.text, filename: 'handbook.pdf', page_number: d.page, document_id: 'doc_003', chunk_index: i }
    })));

    const queryVec = await embedText('How many vacation days do employees receive?');
    const results = similaritySearch(queryVec, 3, 0.0); // threshold=0 to capture all

    assert.ok(results.length > 0);
    // Scores must be in descending order
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score);
    }
    // Top result should be the PTO-related chunk
    assert.ok(results[0].metadata.text.includes('paid time off'));
  });

  await t.test('similaritySearch should return empty array when scores are below threshold', async () => {
    const vec = await embedText('Database schema design patterns.');
    upsertVector('chunk_x', vec, {
      text: 'Database schema design patterns.',
      filename: 'tech.pdf', page_number: 1, document_id: 'doc_004', chunk_index: 0
    });

    // Query about a completely unrelated topic with a very high threshold
    const queryVec = await embedText('What is the capital of France?');
    const results = similaritySearch(queryVec, 3, 0.999); // impossibly high threshold

    assert.equal(results.length, 0);
  });

  await t.test('deleteDocumentVectors should remove all chunks for a document', async () => {
    const vec = await embedText('Test content for deletion.');
    upsertVector('del_chunk_1', vec, { text: 'Test', filename: 'del.pdf', page_number: 1, document_id: 'doc_del', chunk_index: 0 });
    upsertVector('del_chunk_2', vec, { text: 'Test', filename: 'del.pdf', page_number: 2, document_id: 'doc_del', chunk_index: 1 });
    upsertVector('keep_chunk_1', vec, { text: 'Keep', filename: 'keep.pdf', page_number: 1, document_id: 'doc_keep', chunk_index: 0 });

    assert.equal(getVectorCount(), 3);
    deleteDocumentVectors('doc_del');
    assert.equal(getVectorCount(), 1);
  });
});
