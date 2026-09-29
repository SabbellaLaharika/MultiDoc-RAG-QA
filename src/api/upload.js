/**
 * POST /api/upload
 *
 * Accepts multipart/form-data containing one or more .pdf or .docx files
 * and runs each through the full ingestion pipeline.
 *
 * Request  : multipart/form-data  { files: File[] }
 * Response : application/json
 *   {
 *     "success": true,
 *     "message": "Successfully ingested 2 document(s).",
 *     "documentsProcessed": 2,
 *     "details": [
 *       { "id": "...", "filename": "handbook.pdf", "chunks": 24 }
 *     ]
 *   }
 */

import { Router } from 'express';
import multer from 'multer';
import { ingestDocument } from '../core/rag.js';

const router = Router();

// ─── Multer config ────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/docx'
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx']);

const storage = multer.memoryStorage(); // Keep file in memory as Buffer

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per file
    files: 20                    // Max 20 files per request
  },
  fileFilter(req, file, cb) {
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
    const extOk = ALLOWED_EXTENSIONS.has(ext);

    if (mimeOk || extOk) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type "${file.originalname}". Only .pdf and .docx files are accepted.`));
    }
  }
});

// ─── Route Handler ────────────────────────────────────────────────────────────

router.post('/', upload.array('files'), async (req, res) => {
  try {
    // Validate at least one file was uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded. Please attach at least one .pdf or .docx file using the "files" form field.'
      });
    }

    const results = [];
    const errors = [];

    // Process each uploaded file through the ingestion pipeline
    for (const file of req.files) {
      try {
        const summary = await ingestDocument(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        results.push(summary);
      } catch (fileErr) {
        // Collect per-file errors but continue processing remaining files
        errors.push({
          filename: file.originalname,
          error: fileErr.message
        });
      }
    }

    // Return structured response per the API contract
    const processed = results.length;

    return res.status(processed > 0 ? 200 : 422).json({
      success: processed > 0,
      message: processed > 0
        ? `Successfully ingested ${processed} document(s).`
        : 'No documents could be ingested.',
      documentsProcessed: processed,
      details: results,
      ...(errors.length > 0 && { errors })
    });

  } catch (err) {
    console.error('Upload endpoint error:', err);

    // Handle multer-specific errors (file size, type, count)
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: 'File too large. Maximum allowed size is 50 MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ success: false, error: 'Too many files. Maximum 20 files per request.' });
    }

    return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
  }
});

// Error handling middleware for Multer errors
router.use((err, req, res, next) => {
  if (err) {
    return res.status(422).json({
      success: false,
      errors: [{ error: err.message }]
    });
  }
  next();
});

export default router;
