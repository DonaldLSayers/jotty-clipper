// Background service worker for Jotty Clipper
// Handles API communication and context menu

console.log('Jotty Clipper background script loading...');

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Jotty Clipper installed');

  try {
    // Create context menu items
    chrome.contextMenus.create({
      id: 'clip-selection',
      title: 'Clip selection to Jotty',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'clip-page',
      title: 'Clip page to Jotty',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'clip-image',
      title: 'Clip image to Jotty',
      contexts: ['image']
    });

    chrome.contextMenus.create({
      id: 'clip-link',
      title: 'Clip link to Jotty',
      contexts: ['link']
    });

    console.log('Context menus created');
  } catch (error) {
    console.error('Error creating context menus:', error);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextMenuClick(info, tab);
});

// Inject content script if not already injected
async function ensureContentScript(tabId) {
  try {
    // Try to ping the content script
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return true; // Already injected
  } catch (error) {
    // Not injected, inject it now
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      return true;
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError);
      return false;
    }
  }
}

// Handle context menu actions
async function handleContextMenuClick(info, tab) {
  try {
    const settings = await chrome.storage.sync.get(['jottyUrl', 'jottyApiKey', 'defaultCategory']);

    if (!settings.jottyUrl || !settings.jottyApiKey) {
      console.error('Jotty Clipper: API settings not configured');
      return;
    }

    let content = '';
    let title = '';

    switch (info.menuItemId) {
      case 'clip-selection':
        content = info.selectionText;
        title = content.substring(0, 100) + (content.length > 100 ? '...' : '');
        break;

      case 'clip-image':
        content = `![Image](${info.srcUrl})\n\nFrom: ${tab.url}`;
        title = `Image from ${new URL(tab.url).hostname}`;
        break;

      case 'clip-link':
        content = `[${info.linkUrl}](${info.linkUrl})`;
        title = `Link from ${tab.title}`;
        break;

      case 'clip-page':
        // Ensure content script is injected before extracting
        try {
          await ensureContentScript(tab.id);
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'extractContent',
            clipType: 'auto'
          });

          if (response && response.content) {
            content = response.content;
            title = tab.title;
          }
        } catch (error) {
          console.error('Error extracting page:', error);
          content = `Error extracting page content: ${error.message}`;
          title = tab.title;
        }
        break;
    }

    // Save to Jotty
    await saveToJotty({
      title,
      content,
      categoryId: settings.defaultCategory,
      url: tab.url,
      settings
    });
  } catch (error) {
    console.error('Error in handleContextMenuClick:', error);
  }
}

// Save content to Jotty API
async function saveToJotty(data) {
  // Add source URL to content
  const contentWithSource = `**Source:** ${data.url}\n**Clipped:** ${new Date().toLocaleString()}\n\n---\n\n${data.content}`;

  const response = await fetch(`${data.settings.jottyUrl}/api/notes`, {
    method: 'POST',
    headers: {
      'x-api-key': data.settings.jottyApiKey,
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

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'saveToJotty') {
    saveToJotty(request.data)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  }
});

console.log('Jotty Clipper background script loaded successfully');
