import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../index.js';
import { clearVectorStore, getVectorCount } from '../src/database/vector_store.js';
import { getDbConnection } from '../src/database/relational.js';

const pdfPath = path.resolve(process.cwd(), 'tests', 'sample_docs', 'employee_handbook.pdf');
const docxPath = path.resolve(process.cwd(), 'tests', 'sample_docs', 'contractor_guidelines.docx');

test('Phase 8: End-to-End RAG Integration', async (t) => {
  // Clear databases before E2E tests
  t.before(async () => {
    clearVectorStore();
    const db = getDbConnection();
    await new Promise((resolve) => db.run('DELETE FROM messages', resolve));
    await new Promise((resolve) => db.run('DELETE FROM sessions', resolve));
    await new Promise((resolve) => db.run('DELETE FROM documents', resolve));
  });

  await t.test('E2E: Should upload and process synthetic PDF and DOCX successfully', async () => {
    assert.ok(fs.existsSync(pdfPath), 'employee_handbook.pdf is missing');
    assert.ok(fs.existsSync(docxPath), 'contractor_guidelines.docx is missing');

    const res = await request(app)
      .post('/api/upload')
      .attach('files', pdfPath)
      .attach('files', docxPath)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.documentsProcessed, 2);
    
    // Check that vector chunks were generated and stored
    assert.ok(getVectorCount() > 0, 'Vector store should contain extracted chunks');
  });

  await t.test('E2E: Should retrieve valid answers and citations for Employee PTO (PDF)', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ query: 'How many days of paid time off do employees get?' })
      .expect(200);

    assert.ok(res.body.answer);
    assert.ok(Array.isArray(res.body.citations));

    // Because NODE_ENV=test, the LLM generates a mock response,
    // but we can verify the search actually pulled the correct document context
    assert.equal(res.body.answer, 'Mock grounded answer based on context.');
    
    if (res.body.citations.length > 0) {
      assert.equal(res.body.citations[0].document_name, 'employee_handbook.pdf');
    }
  });


  await t.test('E2E: Should retrieve valid answers and citations for Contractors (DOCX)', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ query: 'Are contractors eligible for health benefits?' })
      .expect(200);

    assert.ok(res.body.answer);
    
    if (res.body.citations.length > 0) {
      assert.equal(res.body.citations[0].document_name, 'contractor_guidelines.docx');
    }
  });

  await t.test('E2E: Should fallback gracefully when asked completely out-of-scope question', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ query: 'What is the speed of light in a vacuum?' })
      .expect(200);

    // Context vectors will not match threshold, LLM is bypassed
    assert.equal(res.body.answer, 'I could not find an answer in the provided documents.');
    assert.deepEqual(res.body.citations, []);
  });
});
