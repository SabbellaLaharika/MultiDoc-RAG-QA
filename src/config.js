import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // LLM Provider settings
  llmProvider: process.env.LLM_PROVIDER || 'groq',
  groqApiKey: process.env.GROQ_API_KEY || '',
  // Available Groq models: 'gpt-oss-120b', 'gpt-oss-20b', 'qwen-qwq-32b'
  groqModel: process.env.GROQ_MODEL || 'gpt-oss-20b',
  
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  // Embedding Provider settings
  // 'local' = TF-IDF style local embeddings (zero API cost, no key needed)
  // 'openai' = OpenAI text-embedding-3-small
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local',
  
  // Vector DB settings
  vectorDbType: process.env.VECTOR_DB_TYPE || 'memory', // 'memory' or 'pinecone'
  vectorDbUrl: process.env.VECTOR_DB_URL || '',
  vectorDbApiKey: process.env.VECTOR_DB_API_KEY || process.env.PINECONE_API_KEY || '',
  pineconeIndex: process.env.PINECONE_INDEX || 'multidoc-rag',
  
  // Similarity & Search settings
  // NOTE: 0.20 is appropriate for local hashing-trick embeddings which are sparse.
  // For OpenAI dense embeddings (text-embedding-3-small), use 0.60-0.75.
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.20'),
  topK: parseInt(process.env.TOP_K || '3', 10),
  
  // Database URL
  databaseUrl: process.env.DATABASE_URL || 'sqlite:///./rag_history.db',
  dbPath: path.resolve(process.cwd(), 'rag_history.db')
};
