import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';

let dbInstance = null;

/**
 * Open and initialize SQLite database connection
 */
export function getDbConnection() {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(config.dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening SQLite database:', err.message);
      }
    });
    dbInstance.run('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

/**
 * Execute a query that doesn't return rows (CREATE, INSERT, UPDATE, DELETE)
 */
function runQuery(sql, params = []) {
  const db = getDbConnection();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Execute a query that returns multiple rows (SELECT)
 */
function allQuery(sql, params = []) {
  const db = getDbConnection();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * Execute a query that returns a single row (SELECT LIMIT 1)
 */
function getQuery(sql, params = []) {
  const db = getDbConnection();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

/**
 * Initialize all database tables if they do not exist
 */
export async function initDatabase() {
  // 1. Documents Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      chunk_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Sessions Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Messages Table
  await runQuery(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    )
  `);
}

/**
 * Insert a document log into the database
 */
export async function createDocument({ id = uuidv4(), filename, file_type, chunk_count = 0 }) {
  await runQuery(
    `INSERT INTO documents (id, filename, file_type, chunk_count) VALUES (?, ?, ?, ?)`,
    [id, filename, file_type, chunk_count]
  );
  return getDocumentById(id);
}

/**
 * Retrieve a document by ID
 */
export async function getDocumentById(id) {
  return getQuery(`SELECT * FROM documents WHERE id = ?`, [id]);
}

/**
 * Retrieve all logged documents
 */
export async function getAllDocuments() {
  return allQuery(`SELECT * FROM documents ORDER BY created_at DESC`);
}

/**
 * Ensure session exists or create a new session
 */
export async function ensureSession(sessionId = null) {
  const targetId = sessionId || uuidv4();
  const existing = await getQuery(`SELECT * FROM sessions WHERE id = ?`, [targetId]);
  
  if (!existing) {
    await runQuery(`INSERT INTO sessions (id) VALUES (?)`, [targetId]);
  }
  return targetId;
}

/**
 * Add a user or assistant message to a session
 */
export async function addMessage({ id = uuidv4(), session_id, role, content }) {
  await ensureSession(session_id);
  await runQuery(
    `INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)`,
    [id, session_id, role, content]
  );
  return getQuery(`SELECT * FROM messages WHERE id = ?`, [id]);
}

/**
 * Retrieve recent chronological messages for prompt history injection
 */
export async function getSessionMessages(session_id, limit = 10) {
  const rows = await allQuery(
    `SELECT * FROM (
       SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
     ) ORDER BY created_at ASC`,
    [session_id, limit]
  );
  return rows;
}
