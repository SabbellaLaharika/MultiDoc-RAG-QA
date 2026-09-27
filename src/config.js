import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // LLM Provider settings
  llmProvider: process.env.LLM_PROVIDER || 'groq',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  
  // Vector DB settings
  vectorDbType: process.env.VECTOR_DB_TYPE || 'memory',
  vectorDbUrl: process.env.VECTOR_DB_URL || '',
  vectorDbApiKey: process.env.VECTOR_DB_API_KEY || '',
  
  // Similarity & Search settings
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.70'),
  topK: parseInt(process.env.TOP_K || '3', 10),
  
  // Database URL
  databaseUrl: process.env.DATABASE_URL || 'sqlite:///./rag_history.db',
  dbPath: path.resolve(process.cwd(), 'rag_history.db')
};
