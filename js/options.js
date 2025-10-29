// Options page script for Jotty Clipper

document.addEventListener('DOMContentLoaded', () => {
  loadOptionsSettings();
  setupEventListeners();

  lucide.createIcons();
});

/**
 * Set the default category in the select element
 * @param {Object[]} categories - The categories to set in the select element
 * @param {string} defaultCategory - The default category to set in the select element
 * @returns {void}
 */
const setDefaultCategory = (categories, defaultCategory) => {
  const categorySelect = document.getElementById('default-category');
  categorySelect.innerHTML = '<option value="">No default (prompt each time)</option>';
  
  categories?.forEach(category => {
    const option = document.createElement('option');
    option.value = category.path;
    option.textContent = category.name;
    if (defaultCategory && category.path === defaultCategory) {
      option.selected = true;
    }
    categorySelect.appendChild(option);
  });
}

/**
 * Setup event listeners
 * @returns {void}
 */
const setupEventListeners = () => {
  document.getElementById('settings-form').addEventListener('submit', handleSave);
  document.getElementById('test-connection').addEventListener('click', testConnection);
  document.getElementById('reset-btn').addEventListener('click', resetSettings);
  document.getElementById('toggle-password').addEventListener('click', () => {
    const input = document.getElementById('api-key');
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
  });

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

/**
 * Handle save
 * @param {Event} e - The event object
 * @returns {void}
 */
const handleSave = async (e) => {
  e.preventDefault();

  const settings = {
    jottyUrl: document.getElementById('jotty-url').value.trim().replace(/\/$/, ''),
    jottyApiKey: document.getElementById('api-key').value.trim(),
    defaultCategory: document.getElementById('default-category').value,
    includeMetadata: document.getElementById('include-metadata').checked,
    includeImages: document.getElementById('include-images').checked,
    autoTag: document.getElementById('auto-tag').checked
  };

  if (!settings.jottyUrl) {
    showStatus('Please enter your Jotty URL', 'error');
    return;
  }

  if (!settings.jottyApiKey) {
    showStatus('Please enter your API key', 'error');
    return;
  }

  try {
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

    await browser.storage.sync.set(settings);

    showStatus('Settings saved successfully!', 'success');

    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus(`Failed to save: ${error.message}`, 'error');
  }
}

/**
 * Test connection
 * @returns {void}
 */
const testConnection = async () => {
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

    await loadCategories(url, apiKey);

  } catch (error) {
    console.error('Connection test failed:', error);
    showStatus(`Connection failed: ${error.message}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.innerHTML = originalContent;
  }
}

/**
 * Reset settings
 * @returns {void}
 */
const resetSettings = async () => {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }

  await browser.storage.sync.clear();

  document.getElementById('settings-form').reset();
  document.getElementById('default-category').innerHTML = '<option value="">No default (prompt each time)</option>';

  showStatus('Settings reset to defaults', 'info');
}