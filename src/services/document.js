import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'path';

/**
 * Parse a PDF buffer and extract text page by page with explicit page numbers
 */
export async function parsePdfBuffer(fileBuffer, filename) {
  const pages = [];
  
  // Custom pagerender to capture page index and raw text per page
  function renderPage(pageData) {
    return pageData.getTextContent()
      .then((textContent) => {
        let text = '';
        for (const item of textContent.items) {
          text += item.str + ' ';
        }
        const cleanedText = text.replace(/\s+/g, ' ').trim();
        if (cleanedText.length > 0) {
          pages.push({
            pageNumber: pageData.pageIndex + 1, // 1-indexed page number
            text: cleanedText
          });
        }
        return cleanedText;
      });
  }

  try {
    await pdfParse(fileBuffer, { pagerender: renderPage });
  } catch (error) {
    console.warn(`Warning: Custom page render failed for ${filename}, attempting fallback parsing. Error: ${error.message}`);
    // First fallback: generic pdf-parse
    try {
      const data = await pdfParse(fileBuffer);
      if (data.text && data.text.trim().length > 0) {
        pages.push({
          pageNumber: 1,
          text: data.text.replace(/\s+/g, ' ').trim()
        });
      }
    } catch (fallbackError) {
      // Second fallback: use pdfjs-dist to extract text from each page
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        // pdfjs-dist requires Uint8Array, not Node Buffer
        const uint8Data = new Uint8Array(fileBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: uint8Data });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;
        for (let i = 1; i <= numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          let pageText = '';
          for (const item of textContent.items) {
            pageText += item.str + ' ';
          }
          const cleaned = pageText.replace(/\s+/g, ' ').trim();
          if (cleaned.length > 0) {
            pages.push({
              pageNumber: i,
              text: cleaned
            });
          }
        }
      } catch (pdfjsError) {
        // Re-throw original error for visibility
        throw new Error(`Failed to parse PDF file "${filename}": ${error.message}`);
      }
    }
  }


  // Fallback: If pagerender didn't populate pages but didn't throw, use standard pdfParse output
  if (pages.length === 0) {
    const data = await pdfParse(fileBuffer);
    if (data.text && data.text.trim().length > 0) {
      pages.push({
        pageNumber: 1,
        text: data.text.replace(/\s+/g, ' ').trim()
      });
    }
  }

  // Sort pages by page number
  pages.sort((a, b) => a.pageNumber - b.pageNumber);

  return {
    filename,
    fileType: 'application/pdf',
    totalPages: pages.length,
    pages
  };
}

/**
 * Parse a DOCX buffer and extract text into sequential blocks / virtual pages
 */
export async function parseDocxBuffer(fileBuffer, filename) {
  let rawText = '';
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    rawText = result.value || '';
  } catch (error) {
    if (Buffer.isBuffer(fileBuffer) && !fileBuffer.toString('utf8').startsWith('PK')) {
      rawText = fileBuffer.toString('utf8');
    } else {
      console.error(`Error parsing DOCX ${filename}:`, error.message);
      throw new Error(`Failed to parse DOCX file "${filename}": ${error.message}`);
    }
  }

  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const pages = [];
  let currentPageText = '';
  let currentPageNum = 1;
  const targetPageLength = 1000; // Virtual page size for DOCX sequential block indexing

  for (const para of paragraphs) {
    if (currentPageText.length + para.length > targetPageLength && currentPageText.length > 0) {
      pages.push({
        pageNumber: currentPageNum++,
        text: currentPageText.trim()
      });
      currentPageText = '';
    }
    currentPageText += (currentPageText ? '\n\n' : '') + para;
  }

  if (currentPageText.length > 0) {
    pages.push({
      pageNumber: currentPageNum,
      text: currentPageText.trim()
    });
  }

  return {
    filename,
    fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    totalPages: pages.length,
    pages
  };
}

/**
 * Universal document parser supporting PDF and DOCX
 */
export async function parseDocument(fileBuffer, filename, mimeType = '') {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.pdf' || mimeType === 'application/pdf') {
    return parsePdfBuffer(fileBuffer, filename);
  } else if (
    ext === '.docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/docx'
  ) {
    return parseDocxBuffer(fileBuffer, filename);
  } else {
    throw new Error(`Unsupported file type "${ext || mimeType}". Only .pdf and .docx files are supported.`);
  }
}
