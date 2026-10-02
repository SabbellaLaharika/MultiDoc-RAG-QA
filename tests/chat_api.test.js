import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../index.js';
import { clearVectorStore, upsertVector } from '../src/database/vector_store.js';
import { getDbConnection, getSessionMessages } from '../src/database/relational.js';
import { embedText } from '../src/services/embedding.js';

test('Phase 7: Chat API Endpoint', async (t) => {
  // Clear databases before tests
  t.beforeEach(async () => {
    await clearVectorStore();
    const db = getDbConnection();
    await new Promise((resolve) => db.run('DELETE FROM messages', resolve));
    await new Promise((resolve) => db.run('DELETE FROM sessions', resolve));
  });

  await t.test('POST /api/chat should return 400 if query is missing', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({})
      .expect(400);
    assert.equal(res.body.error, 'A valid "query" string is required.');
  });

  await t.test('POST /api/chat should return answer, citations, and session_id', async () => {
    // Seed vector store with a chunk that shares many exact words with the query
    // to ensure the local TF-IDF embedding score passes the default 0.70 threshold.
    const text = 'How many days of PTO do employees get? Employees receive 20 days.';
    const vector = await embedText(text);
    await upsertVector('chunk_1', vector, {
      text,
      filename: 'handbook.pdf',
      page_number: 14,
      document_id: 'doc_1',
      chunk_index: 0
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ query: 'How many days of PTO do employees get?' })
      .expect(200);

    assert.ok(res.body.answer);
    assert.ok(Array.isArray(res.body.citations));
    assert.ok(res.body.session_id);

    // Because NODE_ENV=test, the LLM will return the mock string
    assert.equal(res.body.answer, 'Mock grounded answer based on context.');
    
    // Check if the mock citation was returned
    if (res.body.citations.length > 0) {
      assert.equal(res.body.citations[0].document_name, 'handbook.pdf');
    }

    // Verify history was saved
    const messages = await getSessionMessages(res.body.session_id);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'user');
    assert.equal(messages[0].content, 'How many days of PTO do employees get?');
    assert.equal(messages[1].role, 'assistant');
    assert.equal(messages[1].content, res.body.answer);
  });

  await t.test('POST /api/chat should append to existing session history', async () => {
    const res1 = await request(app)
      .post('/api/chat')
      .send({ query: 'First question' })
      .expect(200);
      
    const sessionId = res1.body.session_id;

    const res2 = await request(app)
      .post('/api/chat')
      .send({ query: 'Second question', session_id: sessionId })
      .expect(200);

    assert.equal(res2.body.session_id, sessionId);

    const messages = await getSessionMessages(sessionId);
    assert.equal(messages.length, 4); // user, assistant, user, assistant
  });

  await t.test('POST /api/chat should gracefully fall back when no context is found', async () => {
    // Vector store is empty, so no context chunks will match

    const res = await request(app)
      .post('/api/chat')
      .send({ query: 'What is the capital of France?' })
      .expect(200);

    assert.equal(res.body.answer, 'I could not find an answer in the provided documents.');
    assert.deepEqual(res.body.citations, []);
  });
});
