/**
 * POST /api/chat
 * 
 * Handles user questions. Embeds the query, retrieves relevant chunks from
 * the Vector Store, fetches session history, calls the LLM, and logs the
 * conversation to the relational database.
 */

import { Router } from 'express';
import { embedText } from '../services/embedding.js';
import { similaritySearch } from '../database/vector_store.js';
import { generateAnswer } from '../services/llm.js';
import { ensureSession, getSessionMessages, addMessage } from '../database/relational.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { query, session_id } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'A valid "query" string is required.' });
    }

    // 1. Manage session
    const sessionId = await ensureSession(session_id);

    // 2. Fetch recent chat history
    const history = await getSessionMessages(sessionId, 6); // fetch last 6 turns

    // 3. Embed the user's query
    const queryVector = await embedText(query);

    // 4. Perform vector similarity search
    const contextChunks = similaritySearch(queryVector);

    // 5. Generate answer using LLM
    const { answer, citations } = await generateAnswer(query, contextChunks, history);

    // 6. Save User and Assistant messages to relational DB
    await addMessage({ session_id: sessionId, role: 'user', content: query });
    await addMessage({ session_id: sessionId, role: 'assistant', content: answer });

    // 7. Return the structured response
    return res.status(200).json({
      answer,
      citations,
      session_id: sessionId
    });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error processing the chat request.' });
  }
});

export default router;
