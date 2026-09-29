/**
 * LLM Prompt Builder & Guardrails Service
 * 
 * Responsible for assembling grounded system prompts, formatting context chunks,
 * applying hallucination threshold checks, and calling the LLM API.
 */

import { config } from '../config.js';

/**
 * Format retrieved Top-K results into a readable context block for the LLM.
 * 
 * @param {Array<{score: number, metadata: Object}>} contextChunks 
 * @returns {string} Formatted context block
 */
export function buildContextBlock(contextChunks) {
  if (!contextChunks || contextChunks.length === 0) {
    return '--- CONTEXT START ---\nNo context provided.\n--- CONTEXT END ---';
  }

  let contextStr = '--- CONTEXT START ---\n';
  for (const chunk of contextChunks) {
    contextStr += `Source: ${chunk.metadata.filename} (Page ${chunk.metadata.page_number})\n`;
    contextStr += `Text: ${chunk.metadata.text}\n\n`;
  }
  contextStr += '--- CONTEXT END ---';
  
  return contextStr;
}

/**
 * Format the previous chat history for prompt injection.
 * 
 * @param {Array<Object>} history - Chronological array of previous messages
 * @returns {string} Formatted history block
 */
export function buildHistoryBlock(history) {
  if (!history || history.length === 0) {
    return '';
  }

  let historyStr = '--- CHAT HISTORY START ---\n';
  for (const msg of history) {
    const roleName = msg.role.toUpperCase();
    historyStr += `${roleName}: ${msg.content}\n\n`;
  }
  historyStr += '--- CHAT HISTORY END ---\n';
  
  return historyStr;
}

/**
 * Build the complete system prompt enforcing strict grounding rules.
 * 
 * @param {string} contextBlock 
 * @returns {string} System prompt string
 */
export function buildSystemPrompt(contextBlock) {
  return `You are an intelligent document assistant. You will be provided with context chunks from uploaded documents. Answer the user's question using ONLY the provided context. If the answer cannot be found in the context, you must reply exactly with: 'I could not find an answer in the provided documents.' Do not attempt to guess or use outside knowledge. 

Your response MUST be a valid JSON object with the following schema:
{
  "answer": "Your answer to the question based on the context, or the fallback message if answer not found.",
  "citations": [
    {
      "document_name": "filename.pdf",
      "page_number": 1
    }
  ]
}

Only include citations for the specific documents and pages that you used to construct your answer. Do NOT wrap your JSON in markdown code blocks (\`\`\`json). Output raw JSON only.

Here is the context to use:
${contextBlock}
`;
}

/**
 * Call the Groq LLM API.
 */
async function callGroqLLM(systemPrompt, userQuery, chatHistory) {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY is not set in your .env file.');
  }

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Append history as user/assistant turns if available
  if (chatHistory && chatHistory.length > 0) {
    for (const msg of chatHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userQuery });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.groqModel || 'llama-3.1-8b-instant',
      messages,
      temperature: 0.0, // Enforce deterministic output
      response_format: { type: "json_object" } // Request JSON output format
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const json = await response.json();
  return json.choices[0].message.content;
}

/**
 * Call the OpenAI LLM API (Fallback option).
 */
async function callOpenAILLM(systemPrompt, userQuery, chatHistory) {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set in your .env file.');
  }

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  if (chatHistory && chatHistory.length > 0) {
    for (const msg of chatHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userQuery });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.openaiModel || 'gpt-4o-mini',
      messages,
      temperature: 0.0,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  const json = await response.json();
  return json.choices[0].message.content;
}

/**
 * Generate a grounded answer based on the provided context chunks.
 * Handles the fallback bypass logic natively.
 * 
 * @param {string} query - The user's question
 * @param {Array<{score: number, metadata: Object}>} contextChunks - Retrieved context
 * @param {Array<Object>} chatHistory - Previous chat messages
 * @returns {Promise<{answer: string, citations: Array<{document_name: string, page_number: number}>}>}
 */
export async function generateAnswer(query, contextChunks = [], chatHistory = []) {
  // Graceful Failure Guard: Bypass LLM entirely if no valid chunks are provided
  if (contextChunks.length === 0) {
    return {
      answer: 'I could not find an answer in the provided documents.',
      citations: []
    };
  }

  const contextBlock = buildContextBlock(contextChunks);
  const systemPrompt = buildSystemPrompt(contextBlock);
  
  let llmOutputStr = '';

  if (config.llmProvider === 'openai') {
    llmOutputStr = await callOpenAILLM(systemPrompt, query, chatHistory);
  } else if (config.llmProvider === 'mock' || process.env.NODE_ENV === 'test') {
    // For unit testing without calling actual APIs
    llmOutputStr = JSON.stringify({
      answer: 'Mock grounded answer based on context.',
      citations: [
        { document_name: contextChunks[0].metadata.filename, page_number: contextChunks[0].metadata.page_number }
      ]
    });
  } else {
    // Default to Groq
    llmOutputStr = await callGroqLLM(systemPrompt, query, chatHistory);
  }

  try {
    const parsedResponse = JSON.parse(llmOutputStr);
    
    // Ensure citations format
    if (!Array.isArray(parsedResponse.citations)) {
      parsedResponse.citations = [];
    }
    
    return {
      answer: parsedResponse.answer || 'I could not find an answer in the provided documents.',
      citations: parsedResponse.citations
    };
  } catch (err) {
    console.error('Failed to parse LLM JSON response:', err);
    console.error('Raw output:', llmOutputStr);
    
    // Fallback if LLM fails to output valid JSON
    return {
      answer: 'I encountered an error generating the answer.',
      citations: []
    };
  }
}
