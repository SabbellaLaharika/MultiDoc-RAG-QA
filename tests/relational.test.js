import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  initDatabase, 
  createDocument, 
  getAllDocuments, 
  ensureSession, 
  addMessage, 
  getSessionMessages 
} from '../src/database/relational.js';

test('Relational DB Initialization and Operations', async (t) => {
  await t.test('should initialize tables without throwing', async () => {
    await assert.doesNotReject(async () => {
      await initDatabase();
    });
  });

  await t.test('should insert and retrieve documents', async () => {
    const doc = await createDocument({
      filename: 'test_handbook.pdf',
      file_type: 'application/pdf',
      chunk_count: 15
    });

    assert.ok(doc.id);
    assert.equal(doc.filename, 'test_handbook.pdf');
    assert.equal(doc.chunk_count, 15);

    const allDocs = await getAllDocuments();
    assert.ok(allDocs.length > 0);
  });

  await t.test('should create session and track chat history', async () => {
    const sessionId = await ensureSession();
    assert.ok(sessionId);

    // Add User Message
    const userMsg = await addMessage({
      session_id: sessionId,
      role: 'user',
      content: 'How many PTO days do employees get?'
    });
    assert.equal(userMsg.role, 'user');

    // Add Assistant Message
    const assistantMsg = await addMessage({
      session_id: sessionId,
      role: 'assistant',
      content: 'Employees get 20 days of PTO per year.'
    });
    assert.equal(assistantMsg.role, 'assistant');

    // Fetch History
    const history = await getSessionMessages(sessionId);
    assert.equal(history.length, 2);
    assert.equal(history[0].role, 'user');
    assert.equal(history[1].role, 'assistant');
  });
});
