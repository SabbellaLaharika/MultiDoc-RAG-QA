import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../index.js';
import { clearVectorStore, getVectorCount } from '../src/database/vector_store.js';
import { getAllDocuments } from '../src/database/relational.js';

test('Phase 5: Document Upload API Endpoint', async (t) => {
  t.beforeEach(() => {
    clearVectorStore();
  });

  await t.test('POST /api/upload should reject request with no files', async () => {
    const res = await request(app)
      .post('/api/upload')
      .expect(400);
      
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes('No files uploaded'));
  });

  await t.test('POST /api/upload should process a valid DOCX text buffer', async () => {
    // Create a mock buffer that mammoth fallback can handle
    const mockFileContent = Buffer.from('This is a test document with some content to embed.');
    
    const res = await request(app)
      .post('/api/upload')
      .attach('files', mockFileContent, {
        filename: 'test_doc.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.documentsProcessed, 1);
    assert.equal(res.body.details[0].filename, 'test_doc.docx');
    assert.ok(res.body.details[0].chunks > 0);

    // Verify vector store has chunks
    assert.ok(getVectorCount() > 0);

    // Verify relational DB has the document
    const docs = await getAllDocuments();
    const uploadedDoc = docs.find(d => d.filename === 'test_doc.docx');
    assert.ok(uploadedDoc);
    assert.equal(uploadedDoc.chunk_count, res.body.details[0].chunks);
  });

  await t.test('POST /api/upload should reject unsupported file types', async () => {
    const mockFileContent = Buffer.from('print("hello world")');
    
    const res = await request(app)
      .post('/api/upload')
      .attach('files', mockFileContent, {
        filename: 'script.py',
        contentType: 'text/x-python'
      })
      .expect(422); // Assuming all files failed

    assert.equal(res.body.success, false);
    assert.ok(res.body.errors);
    assert.ok(res.body.errors[0].error.includes('Unsupported file type'));
  });
});
