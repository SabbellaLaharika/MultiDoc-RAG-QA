// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const fileList = document.getElementById('file-list');
const uploadBtn = document.getElementById('upload-btn');
const uploadSpinner = document.getElementById('upload-spinner');
const uploadStatus = document.getElementById('upload-status');

const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');

const citationModal = document.getElementById('citation-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const citationContent = document.getElementById('citation-content');
const systemStatus = document.getElementById('system-status');

// State
let selectedFiles = [];
let sessionId = crypto.randomUUID();

// --- Health Check ---
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      systemStatus.innerHTML = '<span class="status-dot online"></span> System Online';
    } else {
      throw new Error('Offline');
    }
  } catch (err) {
    systemStatus.innerHTML = '<span class="status-dot" style="background-color: var(--error); box-shadow: 0 0 8px var(--error);"></span> System Offline';
  }
}
checkHealth();
setInterval(checkHealth, 30000);

// --- File Upload Logic ---

// Drag and Drop Events
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', handleDrop, false);
browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

function handleFiles(files) {
  const allowedExtensions = ['.pdf', '.docx'];
  for (const file of files) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      // Prevent duplicates
      if (!selectedFiles.some(f => f.name === file.name)) {
        selectedFiles.push(file);
      }
    } else {
      showUploadStatus(`File type not supported: ${file.name}`, 'error');
    }
  }
  updateFileList();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  updateFileList();
}

function updateFileList() {
  fileList.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `
      <span class="file-name" title="${file.name}">${file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name}</span>
      <button class="remove-btn" onclick="removeFile(${index})" title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    `;
    fileList.appendChild(el);
  });

  uploadBtn.disabled = selectedFiles.length === 0;
  if (selectedFiles.length > 0) {
    uploadStatus.textContent = '';
  }
}

function showUploadStatus(msg, type) {
  uploadStatus.textContent = msg;
  uploadStatus.className = `upload-status ${type}`;
}

uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  const formData = new FormData();
  selectedFiles.forEach(file => {
    formData.append('files', file);
  });

  // UI Loading State
  uploadBtn.disabled = true;
  uploadBtn.querySelector('.btn-text').textContent = 'Ingesting...';
  uploadSpinner.classList.remove('hidden');
  showUploadStatus('Processing documents...', '');

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      showUploadStatus(`Success! Ingested ${data.documentsProcessed} documents.`, 'success');
      selectedFiles = [];
      updateFileList();
      
      // Auto clear success message after 5 seconds
      setTimeout(() => {
        if(uploadStatus.classList.contains('success')) {
          uploadStatus.textContent = '';
          uploadStatus.className = 'upload-status';
        }
      }, 5000);
    } else {
      showUploadStatus(data.error || 'Failed to upload documents.', 'error');
    }
  } catch (err) {
    showUploadStatus('Network error during upload.', 'error');
  } finally {
    uploadBtn.disabled = selectedFiles.length === 0;
    uploadBtn.querySelector('.btn-text').textContent = 'Ingest Documents';
    uploadSpinner.classList.add('hidden');
  }
});


// --- Chat Logic ---

// Auto-resize textarea
chatInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
  sendBtn.disabled = this.value.trim() === '';
});

// Handle Enter to send (Shift+Enter for newline)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendBtn.click();
  }
});

function appendMessage(role, text, citations = []) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;
  
  const icon = role === 'assistant' 
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

  let citationsHtml = '';
  if (citations.length > 0) {
    citationsHtml = `<div class="citations-container">`;
    // Group citations by document to avoid clutter
    const grouped = {};
    citations.forEach(c => {
      if(!grouped[c.document_name]) grouped[c.document_name] = new Set();
      grouped[c.document_name].add(c.page_number);
    });
    
    Object.keys(grouped).forEach(doc => {
      const pages = Array.from(grouped[doc]).sort((a,b)=>a-b).join(', ');
      const docStr = encodeURIComponent(JSON.stringify({ doc, pages }));
      citationsHtml += `
        <div class="citation-chip" onclick="showCitation('${docStr}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          ${doc}
        </div>
      `;
    });
    citationsHtml += `</div>`;
  }

  // Format line breaks in text
  const formattedText = text.replace(/\\n/g, '<br>');

  msgEl.innerHTML = `
    <div class="message-avatar">${icon}</div>
    <div class="message-content">
      <div class="text">${formattedText}</div>
      ${citationsHtml}
    </div>
  `;
  
  chatHistory.appendChild(msgEl);
  scrollToBottom();
}

function showLoadingIndicator() {
  const msgEl = document.createElement('div');
  msgEl.className = 'message assistant loading-indicator';
  msgEl.id = 'loading-indicator';
  msgEl.innerHTML = `
    <div class="message-avatar">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
    </div>
    <div class="message-content">
      <div class="typing-indicator" style="display:flex;gap:4px;padding:4px 0;">
        <div style="width:6px;height:6px;background:var(--text-secondary);border-radius:50%;animation:bounce 1.4s infinite ease-in-out both;"></div>
        <div style="width:6px;height:6px;background:var(--text-secondary);border-radius:50%;animation:bounce 1.4s infinite ease-in-out both;animation-delay:0.16s;"></div>
        <div style="width:6px;height:6px;background:var(--text-secondary);border-radius:50%;animation:bounce 1.4s infinite ease-in-out both;animation-delay:0.32s;"></div>
      </div>
    </div>
  `;
  // Add quick keyframes via JS
  if(!document.getElementById('bounce-style')) {
    const style = document.createElement('style');
    style.id = 'bounce-style';
    style.textContent = '@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }';
    document.head.appendChild(style);
  }
  
  chatHistory.appendChild(msgEl);
  scrollToBottom();
}

function removeLoadingIndicator() {
  const el = document.getElementById('loading-indicator');
  if (el) el.remove();
}

function scrollToBottom() {
  chatHistory.scrollTo({
    top: chatHistory.scrollHeight,
    behavior: 'smooth'
  });
}

sendBtn.addEventListener('click', async () => {
  const query = chatInput.value.trim();
  if (!query) return;

  // Clear input UI
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;

  // Append User message
  appendMessage('user', query);
  
  // Show Loading
  showLoadingIndicator();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, session_id: sessionId })
    });

    const data = await res.json();
    removeLoadingIndicator();

    if (res.ok) {
      appendMessage('assistant', data.answer, data.citations);
      if(data.session_id) sessionId = data.session_id; // update session id from server
    } else {
      appendMessage('assistant', `Error: ${data.error || 'Failed to get a response.'}`);
    }
  } catch (err) {
    removeLoadingIndicator();
    appendMessage('assistant', 'Network error. Please check if the server is running.');
  }
});

clearChatBtn.addEventListener('click', () => {
  // Keep the welcome message, remove the rest
  const messages = chatHistory.querySelectorAll('.message:not(.welcome)');
  messages.forEach(m => m.remove());
  
  // Generate a new session ID so server treats it as new conversation
  sessionId = crypto.randomUUID();
});


// --- Citation Modal ---
window.showCitation = function(docStr) {
  try {
    const data = JSON.parse(decodeURIComponent(docStr));
    citationContent.innerHTML = `
      <ul>
        <li><strong>Document:</strong> ${data.doc}</li>
        <li><strong>Relevant Pages:</strong> ${data.pages}</li>
      </ul>
      <p style="margin-top:1rem;color:var(--text-secondary);font-size:0.875rem;">
        This information was extracted from the document pages listed above by the Vector Search engine.
      </p>
    `;
    citationModal.classList.remove('hidden');
  } catch (e) {
    console.error("Failed to parse citation data");
  }
};

closeModalBtn.addEventListener('click', () => citationModal.classList.add('hidden'));
citationModal.addEventListener('click', (e) => {
  if (e.target === citationModal) citationModal.classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !citationModal.classList.contains('hidden')) {
    citationModal.classList.add('hidden');
  }
});
