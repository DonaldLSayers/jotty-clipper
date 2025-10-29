// Popup script for Jotty Clipper
let selectedClipType = 'auto';
let currentTab = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Load settings and categories
  await loadSettings();
  await loadCategories();
  await detectPageInfo();

  // Set up event listeners
  setupEventListeners();
});

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get(['jottyUrl', 'jottyApiKey', 'defaultCategory']);

  if (!settings.jottyUrl || !settings.jottyApiKey) {
    showStatus('Please configure your API settings first', 'error');
    document.getElementById('clip-btn').disabled = true;
  }

  return settings;
}

// Load categories from Jotty API
async function loadCategories() {
  const settings = await chrome.storage.sync.get(['jottyUrl', 'jottyApiKey', 'defaultCategory']);
  const categorySelect = document.getElementById('category-select');

  if (!settings.jottyUrl || !settings.jottyApiKey) {
    categorySelect.innerHTML = '<option value="">Configure settings first</option>';
    return;
  }

  try {
    // Fetch only notes to extract categories (not checklists)
    const notesRes = await fetch(`${settings.jottyUrl}/api/notes`, {
      headers: {
        'x-api-key': settings.jottyApiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!notesRes.ok) {
      throw new Error('Failed to fetch notes');
    }

    // Extract unique categories from notes only
    const categories = new Set();

    const notesData = await notesRes.json();

    notesData.notes?.forEach(item => {
      if (item.category && item.category.trim() !== '') {
        categories.add(item.category);
      }
    });

    // Only show categories that actually exist in notes
    // No hardcoded defaults

    // Populate select
    categorySelect.innerHTML = '<option value="">Select category...</option>';

    Array.from(categories).sort().forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      if (settings.defaultCategory && category === settings.defaultCategory) {
        option.selected = true;
      }
      categorySelect.appendChild(option);
    });

    // Add option to create new category
    const newCategoryOption = document.createElement('option');
    newCategoryOption.value = '__new__';
    newCategoryOption.textContent = '+ Create new category';
    categorySelect.appendChild(newCategoryOption);
  } catch (error) {
    console.error('Error loading categories:', error);
    categorySelect.innerHTML = '<option value="">Error loading categories</option>';
    showStatus('Failed to load categories. Check your settings.', 'error');
  }
}

// Inject content script if not already injected
async function ensureContentScript() {
  if (!currentTab) return false;

  try {
    // Try to ping the content script
    await chrome.tabs.sendMessage(currentTab.id, { action: 'ping' });
    return true; // Already injected
  } catch (error) {
    // Not injected, inject it now
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content.js']
      });
      return true;
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError);
      return false;
    }
  }
}

// Detect page information
async function detectPageInfo() {
  if (!currentTab) return;

  // Ensure content script is loaded
  await ensureContentScript();

  // Send message to content script to get page info
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'getPageInfo',
      clipType: selectedClipType
    });

    if (response && response.title) {
      document.getElementById('title-input').value = response.title;
      document.getElementById('title-input').placeholder = response.title;
    }
  } catch (error) {
    // Could not detect page info, use tab title
    document.getElementById('title-input').value = currentTab.title || '';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Clip type buttons
  document.querySelectorAll('.clip-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.clip-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedClipType = btn.dataset.type;
      detectPageInfo();
    });
  });

  // Category select - show custom input when "+ Create new category" is selected
  document.getElementById('category-select').addEventListener('change', (e) => {
    const customInput = document.getElementById('custom-category-input');
    if (e.target.value === '__new__') {
      customInput.style.display = 'block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
      customInput.value = '';
    }
  });

  // Clip button
  document.getElementById('clip-btn').addEventListener('click', handleClip);

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // View settings link
  document.getElementById('view-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

// Handle clipping
async function handleClip() {
  const clipBtn = document.getElementById('clip-btn');
  const titleInput = document.getElementById('title-input');
  const categorySelect = document.getElementById('category-select');
  const customCategoryInput = document.getElementById('custom-category-input');

  const title = titleInput.value || currentTab.title;

  // Get category - use custom input if creating new category
  let categoryId = categorySelect.value;

  if (categoryId === '__new__') {
    categoryId = customCategoryInput.value.trim();
    if (!categoryId) {
      showStatus('Please enter a category name', 'error');
      customCategoryInput.focus();
      return;
    }
  }

  if (!categoryId) {
    showStatus('Please select or enter a category', 'error');
    return;
  }

  // Disable button and show loading state
  clipBtn.disabled = true;
  const originalContent = clipBtn.innerHTML;
  clipBtn.innerHTML = '<span class="loading"></span> Clipping...';

  try {
    // Ensure content script is loaded
    await ensureContentScript();

    // Get content from page
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'extractContent',
      clipType: selectedClipType
    });

    if (!response || !response.content) {
      throw new Error('Failed to extract content from page');
    }

    // Save to Jotty
    await saveToJotty({
      title,
      content: response.content,
      categoryId,
      url: currentTab.url,
      clipType: selectedClipType,
      metadata: response.metadata
    });

    showStatus('Successfully clipped to Jotty!', 'success');

    // Close popup after short delay
    setTimeout(() => {
      window.close();
    }, 1500);

  } catch (error) {
    console.error('Clipping error:', error);
    showStatus(error.message || 'Failed to clip content', 'error');
    clipBtn.disabled = false;
    clipBtn.innerHTML = originalContent;
  }
}

// Save content to Jotty
async function saveToJotty(data) {
  const settings = await chrome.storage.sync.get(['jottyUrl', 'jottyApiKey']);

  // Add source URL to content
  const contentWithSource = `**Source:** ${data.url}\n**Clipped:** ${new Date().toLocaleString()}\n\n---\n\n${data.content}`;

  const response = await fetch(`${settings.jottyUrl}/api/notes`, {
    method: 'POST',
    headers: {
      'x-api-key': settings.jottyApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: data.title,
      content: contentWithSource,
      category: data.categoryId
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || 'Failed to save to Jotty');
  }

  return response.json();
}

// Show status message
function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;

  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}
