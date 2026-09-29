import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextBlock,
  buildHistoryBlock,
  buildSystemPrompt,
  generateAnswer
} from '../src/services/llm.js';

test('Phase 6: LLM Prompt Builder & Guardrails', async (t) => {
  
  await t.test('buildContextBlock should correctly format valid context chunks', () => {
    const chunks = [
      {
        score: 0.95,
        metadata: {
          filename: 'handbook.pdf',
          page_number: 14,
          text: 'Employees are entitled to 20 days of paid time off per year.'
        }
      }
    ];

    const context = buildContextBlock(chunks);
    assert.ok(context.includes('--- CONTEXT START ---'));
    assert.ok(context.includes('Source: handbook.pdf (Page 14)'));
    assert.ok(context.includes('Text: Employees are entitled to 20 days'));
    assert.ok(context.includes('--- CONTEXT END ---'));
  });

  await t.test('buildContextBlock should handle empty chunks gracefully', () => {
    const context = buildContextBlock([]);
    assert.ok(context.includes('No context provided.'));
  });

  await t.test('buildHistoryBlock should correctly format chat history', () => {
    const history = [
      { role: 'user', content: 'What is the PTO policy?' },
      { role: 'assistant', content: 'You get 20 days.' }
    ];

    const historyBlock = buildHistoryBlock(history);
    assert.ok(historyBlock.includes('--- CHAT HISTORY START ---'));
    assert.ok(historyBlock.includes('USER: What is the PTO policy?'));
    assert.ok(historyBlock.includes('ASSISTANT: You get 20 days.'));
    assert.ok(historyBlock.includes('--- CHAT HISTORY END ---'));
  });

  await t.test('buildHistoryBlock should return empty string if no history', () => {
    const historyBlock = buildHistoryBlock([]);
    assert.equal(historyBlock, '');
  });

  await t.test('buildSystemPrompt should contain rigorous grounding instructions', () => {
    const context = buildContextBlock([{
      metadata: { filename: 'test.pdf', page_number: 1, text: 'Test text' }
    }]);
    
    const prompt = buildSystemPrompt(context);
    // Should enforce exact fallback string
    assert.ok(prompt.includes('I could not find an answer in the provided documents.'));
    // Should enforce JSON output
    assert.ok(prompt.includes('JSON object with the following schema'));
    // Should contain the injected context
    assert.ok(prompt.includes('Source: test.pdf (Page 1)'));
  });

  await t.test('generateAnswer should return exact fallback without calling LLM if context is empty', async () => {
    const query = 'What is the capital of France?';
    
    // Passing empty contextChunks array
    const result = await generateAnswer(query, []);
    
    // It should immediately return the fallback string, preventing hallucination
    assert.equal(result.answer, 'I could not find an answer in the provided documents.');
    assert.deepEqual(result.citations, []);
  });

  await t.test('generateAnswer should parse mock LLM JSON output successfully', async () => {
    const chunks = [
      {
        score: 0.85,
        metadata: { filename: 'test.pdf', page_number: 5, text: 'Some context here.' }
      }
    ];

    // NODE_ENV=test will trigger the mock branch in generateAnswer
    const result = await generateAnswer('test query', chunks);
    
    assert.equal(result.answer, 'Mock grounded answer based on context.');
    assert.ok(Array.isArray(result.citations));
    assert.equal(result.citations[0].document_name, 'test.pdf');
    assert.equal(result.citations[0].page_number, 5);
  });
});
