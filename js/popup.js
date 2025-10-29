let selectedClipType = 'auto';
let currentTab = null;

/**
 * Load the popup settings and populate the category select
 * @returns {void}
 */
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  await loadPopupSettings();
  await populateCategorySelect();
  await detectPageInfo();

  setupEventListeners();
  lucide.createIcons();
});


/**
 * Populate the category select
 * @returns {void}
 */
const populateCategorySelect = async () => {
  const settings = await browser.storage.sync.get(['jottyUrl', 'jottyApiKey', 'defaultCategory']);
  const categorySelect = document.getElementById('category-select');
  const categories = await loadCategories(settings.jottyUrl, settings.jottyApiKey);

  if (!settings.jottyUrl || !settings.jottyApiKey) {
    categorySelect.innerHTML = '<option value="">Configure settings first</option>';
    return;
  }

  try {
    categorySelect.innerHTML = '<option value="">Select category...</option>';

    categories?.forEach(category => {
      const option = document.createElement('option');
      option.value = category.path;
      option.textContent = category.name;
      if (settings.defaultCategory && category.path === settings.defaultCategory) {
        option.selected = true;
      }
      categorySelect.appendChild(option);
    });

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

/**
 * Inject the content script if not already injected
 * @returns {boolean} - True if the content script was injected, false otherwise
 */
const ensureContentScript = async () => {
  if (!currentTab) return false;

  if (currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('chrome-extension://')) {
    console.warn('Jotty Clipper: Cannot inject script on this page.');
    return false; // Do not attempt injection
  }

  try {
    // Try to ping the content script
    await browser.tabs.sendMessage(currentTab.id, { action: 'ping' });
    return true; // Already injected
  } catch (error) {
    // Not injected, inject it now
    try {
      await browser.scripting.executeScript({
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

/**
 * Detect the page information
 * @returns {void}
 */
const detectPageInfo = async () => {
  if (!currentTab) return;

  await ensureContentScript();

  try {
    const response = await browser.tabs.sendMessage(currentTab.id, {
      action: 'getPageInfo',
      clipType: selectedClipType
    });

    if (response && response.title) {
      document.getElementById('title-input').value = response.title;
      document.getElementById('title-input').placeholder = response.title;
    }
  } catch (error) {
    document.getElementById('title-input').value = currentTab.title || '';
  }
}

/**
 * Setup the event listeners
 * @returns {void}
 */
const setupEventListeners = () => {
  document.querySelectorAll('.clip-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.clip-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedClipType = btn.dataset.type;
      detectPageInfo();
    });
  });

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

  document.getElementById('clip-btn').addEventListener('click', handleClip);

  document.getElementById('settings-btn').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  document.getElementById('view-settings').addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
}

/**
 * Handle the clipping
 * @returns {void}
 */
const handleClip = async () => {
  const clipBtn = document.getElementById('clip-btn');
  const titleInput = document.getElementById('title-input');
  const categorySelect = document.getElementById('category-select');
  const customCategoryInput = document.getElementById('custom-category-input');

  const title = titleInput.value || currentTab.title;

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

  clipBtn.disabled = true;
  const originalContent = clipBtn.innerHTML;
  clipBtn.innerHTML = '<span class="loading"></span> Clipping...';

  try {
    await ensureContentScript();

    const response = await browser.tabs.sendMessage(currentTab.id, {
      action: 'extractContent',
      clipType: selectedClipType
    });

    if (!response || !response.content) {
      throw new Error('Failed to extract content from page');
    }

    await saveToJotty({
      title,
      content: response.content,
      categoryId,
      url: currentTab.url,
      clipType: selectedClipType,
      metadata: response.metadata
    });

    showStatus('Successfully clipped to Jotty!', 'success');

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


