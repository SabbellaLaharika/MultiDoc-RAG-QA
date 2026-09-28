/**
 * Split parsed document pages into overlapping text chunks while preserving metadata
 * 
 * @param {Object} parsedDoc - Result from parseDocument ({ filename, pages })
 * @param {Object} options - Chunking settings
 * @param {string} options.documentId - Relational DB document reference ID
 * @param {number} [options.chunkSize=1000] - Target character length per chunk
 * @param {number} [options.overlap=200] - Overlap character length between consecutive chunks
 * @returns {Array<Object>} Array of chunk objects with text & metadata
 */
export function chunkDocument(parsedDoc, { documentId = 'doc', chunkSize = 1000, overlap = 200 } = {}) {
  const chunks = [];
  let globalChunkIndex = 0;

  if (!parsedDoc || !parsedDoc.pages || !Array.isArray(parsedDoc.pages)) {
    return chunks;
  }

  for (const page of parsedDoc.pages) {
    const text = page.text;
    const pageNumber = page.pageNumber;

    if (!text || text.trim().length === 0) continue;

    // If page content is smaller than or equal to chunkSize, store as a single chunk
    if (text.length <= chunkSize) {
      chunks.push({
        id: `${documentId}_chunk_${globalChunkIndex}`,
        text: text.trim(),
        filename: parsedDoc.filename,
        page_number: pageNumber,
        document_id: documentId,
        chunk_index: globalChunkIndex
      });
      globalChunkIndex++;
      continue;
    }

    // Sliding window chunking over the page text
    let start = 0;
    while (start < text.length) {
      let end = start + chunkSize;

      // Avoid slicing words in half if not at the text boundary
      if (end < text.length) {
        const spaceIndex = text.lastIndexOf(' ', end);
        if (spaceIndex > start + chunkSize * 0.5) {
          end = spaceIndex;
        }
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText.length > 0) {
        chunks.push({
          id: `${documentId}_chunk_${globalChunkIndex}`,
          text: chunkText,
          filename: parsedDoc.filename,
          page_number: pageNumber,
          document_id: documentId,
          chunk_index: globalChunkIndex
        });
        globalChunkIndex++;
      }

      // Advance start position by (chunkSize - overlap)
      const step = Math.max(1, (end - start) - overlap);
      start += step;

      if (end >= text.length) break;
    }
  }

  return chunks;
}
