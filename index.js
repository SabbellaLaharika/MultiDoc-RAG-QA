import express from 'express';
import cors from 'cors';
import { config } from './src/config.js';
import { initDatabase } from './src/database/relational.js';

const app = express();

// Initialize Database
await initDatabase();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static UI files from public directory if present
app.use(express.static('public'));

import uploadRouter from './src/api/upload.js';
import chatRouter from './src/api/chat.js';

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Multi-Document RAG QA System',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);

const PORT = config.port || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 RAG Server listening on http://localhost:${PORT}`);
  });
}

export default app;
