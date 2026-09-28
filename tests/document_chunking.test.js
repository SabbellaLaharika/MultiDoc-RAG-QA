import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, parsePdfBuffer, parseDocxBuffer } from '../src/services/document.js';
import { chunkDocument } from '../src/services/chunking.js';

test('Phase 3: Document Parsing and Chunking Engine', async (t) => {
  await t.test('should parse DOCX buffer and extract sequential page blocks', async () => {
    // Mock DOCX raw text generator
    const mockDocxText = `EMPLOYEE HANDBOOK

Chapter 1: Attendance Policy
All employees must log their hours by 9:00 AM every working day.

Chapter 2: Paid Time Off (PTO)
Employees are entitled to 20 days of paid time off per calendar year. Vacation requests must be submitted 2 weeks in advance.`;

    // Create a mock docx result test using internal text splitter logic
    const parsedDoc = await parseDocxBuffer(Buffer.from(mockDocxText), 'employee_handbook.docx');

    assert.equal(parsedDoc.filename, 'employee_handbook.docx');
    assert.ok(parsedDoc.pages.length > 0);
    assert.equal(parsedDoc.pages[0].pageNumber, 1);
    assert.ok(parsedDoc.pages[0].text.includes('ATTENDANCE POLICY') || parsedDoc.pages[0].text.includes('Attendance Policy'));
  });

  await t.test('should chunk document text preserving filename and page numbers', () => {
    const mockParsedDoc = {
      filename: 'sample_policy.pdf',
      fileType: 'application/pdf',
      totalPages: 2,
      pages: [
        {
          pageNumber: 1,
          text: 'This is page 1 content. Employees receive health benefits starting on their first day of employment.'
        },
        {
          pageNumber: 2,
          text: 'This is page 2 content. Contractors are billed hourly and are not eligible for health insurance or paid leave.'
        }
      ]
    };

    const chunks = chunkDocument(mockParsedDoc, {
      documentId: 'doc_999',
      chunkSize: 200,
      overlap: 20
    });

    assert.ok(chunks.length >= 2);

    // Verify metadata payload on every chunk
    for (const chunk of chunks) {
      assert.ok(chunk.id);
      assert.ok(chunk.text);
      assert.equal(chunk.filename, 'sample_policy.pdf');
      assert.ok(chunk.page_number === 1 || chunk.page_number === 2);
      assert.equal(chunk.document_id, 'doc_999');
    }

    // Verify page 1 chunk content
    const page1Chunks = chunks.filter(c => c.page_number === 1);
    assert.ok(page1Chunks.some(c => c.text.includes('health benefits')));

    // Verify page 2 chunk content
    const page2Chunks = chunks.filter(c => c.page_number === 2);
    assert.ok(page2Chunks.some(c => c.text.includes('Contractors are billed hourly')));
  });

  await t.test('should reject unsupported file extensions', async () => {
    await assert.rejects(
      async () => {
        await parseDocument(Buffer.from('hello'), 'unsupported.txt', 'text/plain');
      },
      /Unsupported file type/
    );
  });
});
