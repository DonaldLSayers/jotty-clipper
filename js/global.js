document.addEventListener('DOMContentLoaded', async () => {
  const data = await getUser();

  if (data) {
    document.body.classList.add(`${data?.user?.preferredTheme}`);
  }
});

const fetcher = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error('Failed to fetch');
  }
  return response;
}

/**
 * Load the categories
 * @param {string} url - The URL of the Jotty instance
 * @param {string} apiKey - The API key for the Jotty instance
 * @returns {Promise<Object[]>} - The categories
 */
const loadCategories = async (url, apiKey) => { 
    try {
      const categoriesRes = await fetcher(`${url}/api/categories`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey
        }
      });
  
      if (!categoriesRes.ok) {
        throw new Error('Failed to fetch categories');
      }
  
      const data = await categoriesRes.json();
      const notesCategories = data.categories?.notes;

      return notesCategories;
    } catch (error) {
      console.error('Error loading categories:', error);
      showStatus('Failed to load categories', 'error');
      return [];
    }
}

/**
 * Load the options settings
 * @returns {Promise<void>}
 */
const loadOptionsSettings = async () => {
    const settings = await browser.storage.sync.get([
      'jottyUrl',
      'jottyApiKey',
      'defaultCategory',
      'includeMetadata',
      'includeImages',
      'autoTag'
    ]);
  
    document.getElementById('jotty-url').value = settings.jottyUrl || '';
    document.getElementById('api-key').value = settings.jottyApiKey || '';
    document.getElementById('include-metadata').checked = settings.includeMetadata !== false;
    document.getElementById('include-images').checked = settings.includeImages !== false;
    document.getElementById('auto-tag').checked = settings.autoTag !== false;
  
    if (settings.jottyUrl && settings.jottyApiKey) {
      const categories = await loadCategories(settings.jottyUrl, settings.jottyApiKey, settings.defaultCategory);
      setDefaultCategory(categories, settings.defaultCategory);
    }
}

/**
 * Load the popup settings
 * @returns {Promise<Object>} - The settings
 */
const loadPopupSettings = async () => {
    const settings = await browser.storage.sync.get(['jottyUrl', 'jottyApiKey', 'defaultCategory']);

    if (!settings.jottyUrl || !settings.jottyApiKey) {
        showStatus('Please configure your API settings first', 'error');
        document.getElementById('clip-btn').disabled = true;
    }

    return settings;
}

/**
 * Refresh any open Jotty tabs to show the new clip
 * @param {string} jottyUrl - The base URL of the Jotty instance
 */
const refreshJottyTabs = async (jottyUrl) => {
  try {
    // Get the base domain from the Jotty URL
    const jottyDomain = new URL(jottyUrl).origin;

    // Find all tabs that match the Jotty domain
    const tabs = await browser.tabs.query({});
    const jottyTabs = tabs.filter(tab => tab.url && tab.url.startsWith(jottyDomain));

    // Refresh each Jotty tab
    for (const tab of jottyTabs) {
      await browser.tabs.reload(tab.id);
    }

    console.log(`Refreshed ${jottyTabs.length} Jotty tab(s)`);
  } catch (error) {
    console.error('Error refreshing Jotty tabs:', error);
    // Don't throw - this is a non-critical enhancement
  }
}

/**
 * Save the data to Jotty
 * @param {Object} data - The data to save
 * @returns {Promise<Object>} - The response from the Jotty API
 */
const saveToJotty = async (data) => {
    const settings = await browser.storage.sync.get(['jottyUrl', 'jottyApiKey']);
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

    // Refresh any open Jotty tabs after successful save
    await refreshJottyTabs(settings.jottyUrl);

    return response.json();
}

/**
 * Show the status message
 * @param {string} message - The message to show
 * @param {string} type - The type of message (success, error, info)
 * @returns {void}
 */
const showStatus = (message, type = 'success') => {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  
    setTimeout(() => {
      statusEl.classList.add('hidden');
    }, 5000);
}

/**
 * Get the user style
 * @param {string} url - The URL of the Jotty instance
 * @param {string} apiKey - The API key for the Jotty instance
 * @returns {Promise<Object>} - The user style
 */
const getUser = async () => {
  const settings = await browser.storage.sync.get(['jottyUrl', 'jottyApiKey']);
  if (!settings.jottyUrl || !settings.jottyApiKey) {
    return null;
  }

  const response = await fetcher(`${settings.jottyUrl}/api/user`, {
    method: 'GET',
    headers: {
      'x-api-key': settings.jottyApiKey
    }
  });
  return response.json();
}