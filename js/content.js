// Content script for Jotty Clipper - runs on all pages
// Uses Mozilla Readability.js for clean content extraction with fallbacks for specific sites

// Site-specific extractors are loaded from the extractors/ directory
// They are registered in window.JottyExtractors by the individual extractor files
// The extractors object is built after all extractor files are loaded
let loadedExtractors = {};

// Convert HTML table to Markdown table format
function convertTableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  let markdown = '\n';
  let headerAdded = false;

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const cellTexts = cells.map(cell => {
      let text = cell.textContent.trim();
      text = text.replace(/\|/g, '\\|'); // Escape pipe characters
      text = text.replace(/\s+/g, ' '); // Handle multi-line content
      return text;
    });

    // Create the markdown row
    markdown += '| ' + cellTexts.join(' | ') + ' |\n';

    // Add separator row after headers (first row with th elements)
    if (!headerAdded && (row.querySelector('th') || rowIndex === 0)) {
      const separators = cellTexts.map(text => '-'.repeat(Math.max(text.length, 3)));
      markdown += '| ' + separators.join(' | ') + ' |\n';
      headerAdded = true;
    }
  });

  return markdown + '\n';
}

// Main content extraction using Readability.js
function extractWithReadability() {
  const result = {
    title: '',
    content: '',
    metadata: {
      type: 'readability-article'
    }
  };

  try {
    // Create a document clone for Readability to work with
    const documentClone = document.cloneNode(true);

    // Initialize Readability
    const reader = new Readability(documentClone, {
      // Options for better extraction
      charThreshold: 100, // Minimum characters to consider content
      maxElemsToParse: 0, // Parse all elements (no limit)
      nbTopCandidates: 5, // Consider top 5 candidates for main content
      classesToPreserve: [] // Don't preserve any specific classes
    });

    // Extract the article
    const article = reader.parse();

    if (article) {
      result.title = article.title || document.title;
      result.content = article.content;
      result.metadata = {
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName || new URL(window.location.href).hostname,
        length: article.length,
        type: 'readability-article'
      };

      // Convert HTML content to clean Markdown
      result.content = convertHTMLToMarkdown(result.content);
    } else {
      // Fallback to basic extraction if Readability fails
      result.title = document.title;
      result.content = getFallbackContent();
      result.metadata.type = 'fallback-extraction';
    }
  } catch (error) {
    console.error('Readability extraction failed:', error);
    // Fallback extraction
    result.title = document.title;
    result.content = getFallbackContent();
    result.metadata.type = 'fallback-extraction';
  }

  return result;
}

// Fallback extraction method when Readability fails
function getFallbackContent() {
  // Try to find main content areas
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.post',
    '.content',
    '.entry-content',
    '.article-content'
  ];

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Try innerText first to preserve visual line breaks
      const textContent = element.innerText || element.textContent;
      if (textContent && textContent.trim()) {
        return textContent;
      }
      return convertHTMLToMarkdown(element.innerHTML);
    }
  }

  // Last resort: get paragraphs with substantial content
  const paragraphs = Array.from(document.querySelectorAll('p'))
    .filter(p => p.textContent.trim().length > 50)
    .slice(0, 20);

  if (paragraphs.length > 0) {
    return paragraphs.map(p => p.textContent.trim()).join('\n\n');
  }

  return 'Could not extract readable content from this page.';
}

// Convert HTML content to Markdown
function convertHTMLToMarkdown(htmlContent) {
  // Create a temporary element to work with
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  // Convert tables to Markdown
  tempDiv.querySelectorAll('table').forEach(table => {
    const tableMarkdown = convertTableToMarkdown(table);
    table.outerHTML = tableMarkdown;
  });

  // Convert headings
  tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    const level = parseInt(heading.tagName[1]);
    const prefix = '#'.repeat(level);
    heading.innerHTML = `\n${prefix} ${heading.textContent.trim()}\n\n`;
  });

  // Convert paragraphs
  tempDiv.querySelectorAll('p').forEach(p => {
    p.innerHTML = `${p.innerHTML.trim()}\n\n`;
  });

  // Convert line breaks
  tempDiv.querySelectorAll('br').forEach(br => {
    br.outerHTML = '\n';
  });

  // Preserve newlines in elements with white-space preservation
  tempDiv.querySelectorAll('pre:not(:has(code)), [style*="white-space: pre"]').forEach(el => {
    // For pre-formatted text, preserve the exact text content with newlines
    const textContent = el.textContent;
    el.outerHTML = `\n${textContent}\n`;
  });

  // Convert lists
  tempDiv.querySelectorAll('ul').forEach(ul => {
    const items = Array.from(ul.querySelectorAll('li'));
    const listContent = items.map(li => `- ${li.textContent.trim()}`).join('\n');
    ul.outerHTML = `\n${listContent}\n\n`;
  });

  tempDiv.querySelectorAll('ol').forEach(ol => {
    const items = Array.from(ol.querySelectorAll('li'));
    const listContent = items.map((li, idx) => `${idx + 1}. ${li.textContent.trim()}`).join('\n');
    ol.outerHTML = `\n${listContent}\n\n`;
  });

  // Convert links
  tempDiv.querySelectorAll('a').forEach(a => {
    const text = a.textContent.trim();
    const href = a.href;
    if (text && href) {
      a.textContent = `[${text}](${href})`;
    }
  });

  // Convert images
  tempDiv.querySelectorAll('img').forEach(img => {
    const alt = img.alt || 'Image';
    const src = img.src;
    if (src) {
      img.outerHTML = `![${alt}](${src})`;
    }
  });

  // Convert bold/strong
  tempDiv.querySelectorAll('strong, b').forEach(el => {
    el.innerHTML = `**${el.textContent}**`;
  });

  // Convert italic/em
  tempDiv.querySelectorAll('em, i').forEach(el => {
    el.innerHTML = `*${el.textContent}*`;
  });

  // Convert code blocks
  tempDiv.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (code) {
      pre.innerHTML = `\n\`\`\`\n${code.textContent}\n\`\`\`\n\n`;
    }
  });

  // Convert inline code
  tempDiv.querySelectorAll('code:not(pre code)').forEach(code => {
    code.innerHTML = `\`${code.textContent}\``;
  });

  // Get the text content and clean it up
  // Use innerText to preserve line breaks from the rendered page
  let markdown = tempDiv.innerText || tempDiv.textContent || '';

  // Clean up excessive whitespace while preserving structure
  markdown = markdown
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple consecutive newlines to max 2
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs to single space
    .replace(/^\n+|\n+$/g, '') // Trim leading/trailing newlines
    + '\n'; // Ensure trailing newline

  return markdown;
}

// Handle text selection
function getSelectionContent() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    // Try to preserve the actual visual line breaks from the selection
    // Use the selection's string representation which includes newlines
    const selectionText = selection.toString();

    // If the selection has newlines, use them directly
    if (selectionText.includes('\n')) {
      return {
        title: selectionText.substring(0, 100).split('\n')[0] + (selectionText.length > 100 ? '...' : ''),
        content: selectionText,
        metadata: {
          type: 'selection'
        }
      };
    }

    // Otherwise fall back to HTML conversion
    return {
      title: selectionText.substring(0, 100) + (selectionText.length > 100 ? '...' : ''),
      content: convertHTMLToMarkdown(container.innerHTML),
      metadata: {
        type: 'selection'
      }
    };
  }
  return {
    title: 'No text selected',
    content: 'No text selected',
    metadata: { type: 'selection-empty' }
  };
}

// Find extractor for current site (for specialized sites)
function findExtractor(hostname) {
  // Check for exact domain matches first, then partial matches
  for (const domain in loadedExtractors) {
    if (hostname === domain || hostname.includes(domain)) {
      return loadedExtractors[domain];
    }
  }
  return null;
}

// Initialize extractors when available
// The extractors are loaded via script tags, so we need to wait for them
function initializeExtractors() {
  if (typeof window.JottyExtractors !== 'undefined' &&
      typeof window.JottyExtractors.loadExtractors === 'function') {
    loadedExtractors = window.JottyExtractors.loadExtractors();
    console.log('Jotty extractors loaded:', Object.keys(loadedExtractors));
  } else {
    // If extractors aren't loaded yet, try again in a moment
    setTimeout(initializeExtractors, 100);
  }
}

// Start initializing extractors
initializeExtractors();

// Listen for messages from popup
browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
    return true;
  }

  if (request.action === 'getPageInfo') {
    const hostname = new URL(window.location.href).hostname;
    const extractor = findExtractor(hostname);

    (async () => {
      try {
        if (extractor) {
          const info = await extractor.extract();
          sendResponse({ title: info.title });
        } else {
          // Use Readability for page title
          const result = extractWithReadability();
          sendResponse({ title: result.title });
        }
      } catch (error) {
        console.error('Error getting page info:', error);
        sendResponse({ title: document.title });
      }
    })();
    return true;
  }

  if (request.action === 'extractContent') {
    const hostname = new URL(window.location.href).hostname;
    const extractor = findExtractor(hostname);

    (async () => {
      try {
        let result;

        if (request.clipType === 'selection') {
          result = getSelectionContent();
        } else if (extractor && (request.clipType === 'auto' || request.clipType === 'full')) {
          // Use specialized extractor for auto and full mode on Amazon/YouTube/Reddit
          result = await extractor.extract();
        } else {
          // Use Readability for all other cases
          result = extractWithReadability();
          if (request.clipType === 'full' && result.metadata.type === 'readability-article') {
            // For full page, try to get more comprehensive content
            const fullResult = extractWithReadability();
            result = fullResult;
          }
        }
        sendResponse({
          success: true,
          content: result.content,
          metadata: result.metadata
        });
      } catch (error) {
        console.error('Error extracting content:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true;
  }
});