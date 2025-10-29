// Background service worker for Jotty Clipper
// Handles API communication and context menu

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
        files: ['js/content.js']
      });
      return true;
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError);
      return false;
    }
  }
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
        try {
          await ensureContentScript(tab.id);
          const response = await browser.tabs.sendMessage(tab.id, {
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

console.log('Jotty Clipper background script loaded successfully');
