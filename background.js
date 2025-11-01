// Background service worker for Jotty Clipper
// Handles API communication and context menu

// Import browser polyfill for Chrome compatibility
importScripts('js/browser-polyfill.min.js');

console.log('Jotty Clipper background script loading...');

/**
 * Initialise on install
 */
browser.runtime.onInstalled.addListener(() => {
  console.log('Jotty Clipper installed');

  try {
    browser.contextMenus.create({
      id: 'clip-selection',
      title: 'Clip selection to Jotty',
      contexts: ['selection']
    });

    browser.contextMenus.create({
      id: 'clip-page',
      title: 'Clip page to Jotty',
      contexts: ['page']
    });

    browser.contextMenus.create({
      id: 'clip-image',
      title: 'Clip image to Jotty',
      contexts: ['image']
    });

    browser.contextMenus.create({
      id: 'clip-link',
      title: 'Clip link to Jotty',
      contexts: ['link']
    });

    console.log('Context menus created');
  } catch (error) {
    console.error('Error creating context menus:', error);
  }
});

/**
 * Handle context menu clicks
 */
browser.contextMenus.onClicked.addListener((info, tab) => {
  handleContextMenuClick(info, tab);
});

/**
 * Inject the content script if not already injected
 * @param {number} tabId - The ID of the tab to inject the content script into
 * @returns {Promise<boolean>} - True if the content script was injected, false otherwise
 */
async function ensureContentScript(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { action: 'ping' });
    return true;
  } catch (error) {
    try {
      await browser.scripting.executeScript({
        target: { tabId: tabId },
        files: [
          'js/browser-polyfill.min.js',
          'js/extractors/youtube.js',
          'js/extractors/amazon.js',
          'js/extractors/reddit.js',
          'js/extractors/index.js',
          'js/content.js'
        ]
      });
      return true;
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError);
      return false;
    }
  }
}

/**
 * Refresh any open Jotty tabs to show the new clip
 * @param {string} jottyUrl - The base URL of the Jotty instance
 */
async function refreshJottyTabs(jottyUrl) {
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
async function saveToJotty(data) {
  const settings = await browser.storage.sync.get(['jottyUrl', 'jottyApiKey']);

  // Preserve line breaks in markdown by adding two spaces before single newlines
  // In markdown, a single newline is ignored unless preceded by two spaces
  let content = data.content;

  // Replace single newlines (not double) with two spaces + newline for proper markdown rendering
  content = content.replace(/([^\n])\n(?!\n)/g, '$1  \n');

  const contentWithSource = `**Source:** ${data.url}\n**Clipped:** ${new Date().toLocaleString()}\n\n---\n\n${content}`;

  const bodyData = {
    title: data.title,
    content: contentWithSource,
    category: data.categoryId
  };

  const response = await fetch(`${settings.jottyUrl}/api/notes`, {
    method: 'POST',
    headers: {
      'x-api-key': settings.jottyApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(bodyData)
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
 * Handle context menu actions
 * @param {Object} info - The information about the context menu item
 * @param {Object} tab - The tab that the context menu was clicked in
 * @returns {Promise<void>}
 */
async function handleContextMenuClick(info, tab) {
  try {
    const settings = await browser.storage.sync.get(['jottyUrl', 'jottyApiKey', 'defaultCategory']);

    if (!settings.jottyUrl || !settings.jottyApiKey) {
      console.error('Jotty Clipper: API settings not configured');
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Jotty Clipper',
        message: 'Please configure your API settings first'
      });
      return;
    }

    let content = '';
    let title = '';
    let metadata = {};

    switch (info.menuItemId) {
      case 'clip-selection':
        try {
          await ensureContentScript(tab.id);

          // Get the clean page title from the extractor
          let titleResponse;
          try {
            titleResponse = await browser.tabs.sendMessage(tab.id, {
              action: 'getPageInfo'
            });
          } catch (e) {
            console.log('Could not get page info, will use tab title');
          }

          const response = await browser.tabs.sendMessage(tab.id, {
            action: 'extractContent',
            clipType: 'selection'
          });

          if (response && response.content) {
            content = response.content;
            // Use the clean title from extractor if available, otherwise fall back to tab.title
            title = (titleResponse && titleResponse.title) ? titleResponse.title : tab.title;
            metadata = response.metadata || {};
          } else {
            // Fallback to plain text if content script fails
            content = info.selectionText;
            title = tab.title;
          }
        } catch (error) {
          console.error('Error extracting selection:', error);
          // Fallback to plain text
          content = info.selectionText;
          title = tab.title;
        }
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
        try {
          await ensureContentScript(tab.id);

          // First get the clean title from the extractor
          let titleResponse;
          try {
            titleResponse = await browser.tabs.sendMessage(tab.id, {
              action: 'getPageInfo'
            });
          } catch (e) {
            console.log('Could not get page info, will use tab title');
          }

          // Then get the content
          const response = await browser.tabs.sendMessage(tab.id, {
            action: 'extractContent',
            clipType: 'auto'
          });

          if (response && response.content) {
            content = response.content;
            // Use the clean title from extractor if available, otherwise fall back to tab.title
            title = (titleResponse && titleResponse.title) ? titleResponse.title : tab.title;
            metadata = response.metadata || {};
          }
        } catch (error) {
          console.error('Error extracting page:', error);
          content = `Error extracting page content: ${error.message}`;
          title = tab.title;
        }
        break;
    }

    await saveToJotty({
      title,
      content,
      categoryId: settings.defaultCategory,
      url: tab.url,
      metadata
    });

    // Show success notification
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Jotty Clipper',
      message: `Successfully clipped: ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`
    });

  } catch (error) {
    console.error('Error in handleContextMenuClick:', error);
    // Show error notification
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Jotty Clipper - Error',
      message: error.message || 'Failed to clip content'
    });
  }
}

console.log('Jotty Clipper background script loaded successfully');
