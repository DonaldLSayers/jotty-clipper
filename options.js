// Options page script for Jotty Clipper

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'jottyUrl',
    'jottyApiKey',
    'defaultCategory',
    'includeMetadata',
    'includeImages',
    'autoTag'
  ]);

  // Set form values
  document.getElementById('jotty-url').value = settings.jottyUrl || '';
  document.getElementById('api-key').value = settings.jottyApiKey || '';
  document.getElementById('include-metadata').checked = settings.includeMetadata !== false;
  document.getElementById('include-images').checked = settings.includeImages !== false;
  document.getElementById('auto-tag').checked = settings.autoTag !== false;

  // Load categories if API is configured
  if (settings.jottyUrl && settings.jottyApiKey) {
    await loadCategories(settings.jottyUrl, settings.jottyApiKey, settings.defaultCategory);
  }
}

// Load categories from Jotty API
async function loadCategories(url, apiKey, defaultCategory) {
  const categorySelect = document.getElementById('default-category');

  try {
    // Fetch only notes to extract categories (not checklists)
    const notesRes = await fetch(`${url}/api/notes`, {
      headers: {
        'x-api-key': apiKey,
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
    categorySelect.innerHTML = '<option value="">No default (prompt each time)</option>';

    Array.from(categories).sort().forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      if (defaultCategory && category === defaultCategory) {
        option.selected = true;
      }
      categorySelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading categories:', error);
    showStatus('Failed to load categories', 'error');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Form submission
  document.getElementById('settings-form').addEventListener('submit', handleSave);

  // Test connection button
  document.getElementById('test-connection').addEventListener('click', testConnection);

  // Reset button
  document.getElementById('reset-btn').addEventListener('click', resetSettings);

  // Toggle password visibility
  document.getElementById('toggle-password').addEventListener('click', () => {
    const input = document.getElementById('api-key');
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
  });

  // Reload categories when URL or API key changes
  const urlInput = document.getElementById('jotty-url');
  const apiKeyInput = document.getElementById('api-key');

  const reloadCategories = async () => {
    const url = urlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (url && apiKey) {
      await loadCategories(url, apiKey);
    }
  };

  urlInput.addEventListener('blur', reloadCategories);
  apiKeyInput.addEventListener('blur', reloadCategories);
}

// Handle save
async function handleSave(e) {
  e.preventDefault();

  const settings = {
    jottyUrl: document.getElementById('jotty-url').value.trim().replace(/\/$/, ''),
    jottyApiKey: document.getElementById('api-key').value.trim(),
    defaultCategory: document.getElementById('default-category').value,
    includeMetadata: document.getElementById('include-metadata').checked,
    includeImages: document.getElementById('include-images').checked,
    autoTag: document.getElementById('auto-tag').checked
  };

  // Validate
  if (!settings.jottyUrl) {
    showStatus('Please enter your Jotty URL', 'error');
    return;
  }

  if (!settings.jottyApiKey) {
    showStatus('Please enter your API key', 'error');
    return;
  }

  try {
    // Test connection before saving
    await fetch(`${settings.jottyUrl}/api/notes`, {
      headers: {
        'x-api-key': settings.jottyApiKey,
        'Content-Type': 'application/json'
      }
    }).then(response => {
      if (!response.ok) {
        throw new Error('Invalid API credentials or URL');
      }
    });

    // Save settings
    await chrome.storage.sync.set(settings);

    showStatus('Settings saved successfully!', 'success');

    // Update manifest's host permissions if needed
    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus(`Failed to save: ${error.message}`, 'error');
  }
}

// Test connection
async function testConnection() {
  const url = document.getElementById('jotty-url').value.trim().replace(/\/$/, '');
  const apiKey = document.getElementById('api-key').value.trim();

  if (!url || !apiKey) {
    showStatus('Please enter both URL and API key', 'error');
    return;
  }

  const testBtn = document.getElementById('test-connection');
  testBtn.disabled = true;
  const originalContent = testBtn.innerHTML;
  testBtn.innerHTML = '<span class="loading"></span> Testing...';

  try {
    const response = await fetch(`${url}/api/notes`, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    await response.json();
    showStatus(`Connection successful! API is accessible.`, 'success');

    // Reload categories
    await loadCategories(url, apiKey);

  } catch (error) {
    console.error('Connection test failed:', error);
    showStatus(`Connection failed: ${error.message}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.innerHTML = originalContent;
  }
}

// Reset settings
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }

  await chrome.storage.sync.clear();

  // Reset form
  document.getElementById('settings-form').reset();
  document.getElementById('default-category').innerHTML = '<option value="">No default (prompt each time)</option>';

  showStatus('Settings reset to defaults', 'info');
}

// Show status message
function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;

  // Scroll to top to show message
  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}
