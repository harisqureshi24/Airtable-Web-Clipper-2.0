/**
 * Airtable Web Clipper 2.0 - Background Service Worker
 * Handles background tasks, context menus, and keyboard shortcuts
 */

// Airtable API configuration
const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clip-page',
    title: 'Clip page to Airtable',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'clip-selection',
    title: 'Clip selection to Airtable',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'clip-link',
    title: 'Clip link to Airtable',
    contexts: ['link']
  });

  chrome.contextMenus.create({
    id: 'clip-image',
    title: 'Clip image to Airtable',
    contexts: ['image']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'clip-page':
      await handleQuickClip(tab, { type: 'page' });
      break;

    case 'clip-selection':
      await handleQuickClip(tab, {
        type: 'selection',
        text: info.selectionText
      });
      break;

    case 'clip-link':
      await handleQuickClip(tab, {
        type: 'link',
        url: info.linkUrl,
        text: info.selectionText
      });
      break;

    case 'clip-image':
      await handleQuickClip(tab, {
        type: 'image',
        url: info.srcUrl
      });
      break;
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle_clipper') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await openClipperOnTab(tab);
    }
  } else if (command === 'quick_clip') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await handleQuickClip(tab, { type: 'page' });
    }
  }
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      return true;

    case 'QUICK_CLIP':
      handleQuickClip(sender.tab, message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_PAGE_DATA':
      getPageData(message.tabId)
        .then(data => sendResponse(data))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'CREATE_RECORD':
      createRecord(message.baseId, message.tableId, message.fields)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
  }
});

/**
 * Open clipper on a specific tab
 */
async function openClipperOnTab(tab) {
  if (!tab || !tab.url) return;

  // Can't inject into browser internal pages
  const blockedPrefixes = ['chrome://', 'chrome-extension://', 'about:', 'arc://', 'edge://', 'brave://', 'file://'];
  if (blockedPrefixes.some(prefix => tab.url.startsWith(prefix))) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Airtable Web Clipper',
      message: 'Cannot clip this page. Try on a regular webpage.'
    });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIPPER' });
  } catch (error) {
    // Content script not loaded, inject it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      // Wait for script to initialize
      await new Promise(resolve => setTimeout(resolve, 150));
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIPPER' });
    } catch (e) {
      console.error('Failed to inject content script:', e);
    }
  }
}

/**
 * Handle quick clip from context menu or keyboard shortcut
 */
async function handleQuickClip(tab, clipData) {
  try {
    const settings = await chrome.storage.sync.get(['airtableApiKey', 'quickClipBaseId', 'quickClipTableId']);

    if (!settings.airtableApiKey) {
      chrome.runtime.openOptionsPage();
      showNotification(tab.id, {
        success: false,
        message: 'Please configure your Airtable API key first'
      });
      return { success: false, error: 'Not configured' };
    }

    if (!settings.quickClipBaseId || !settings.quickClipTableId) {
      chrome.action.openPopup();
      return { success: false, error: 'Please select a base and table' };
    }

    const pageData = await getPageData(tab.id);
    const fields = prepareFields(clipData, pageData, tab);

    const result = await createRecord(
      settings.quickClipBaseId,
      settings.quickClipTableId,
      fields,
      settings.airtableApiKey
    );

    showNotification(tab.id, {
      success: true,
      message: 'Clipped to Airtable!'
    });

    return { success: true, recordId: result.id };

  } catch (error) {
    console.error('Quick clip error:', error);
    showNotification(tab.id, {
      success: false,
      message: 'Failed to clip: ' + error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Get page data from content script
 */
async function getPageData(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return {
          url: window.location.href,
          title: document.title,
          selection: window.getSelection().toString().trim(),
          description: document.querySelector('meta[name="description"]')?.content || '',
          image: document.querySelector('meta[property="og:image"]')?.content || ''
        };
      }
    });

    return results[0]?.result || {};
  } catch (error) {
    console.error('Error getting page data:', error);
    return {};
  }
}

/**
 * Prepare fields based on clip type and schema
 */
function prepareFields(clipData, pageData, tab) {
  const fields = {};

  const urlFields = ['URL', 'url', 'Link', 'link', 'Source', 'source'];
  const titleFields = ['Title', 'title', 'Name', 'name'];
  const contentFields = ['Content', 'content', 'Notes', 'notes', 'Description', 'description', 'Text', 'text'];
  const dateFields = ['Date', 'date', 'Clipped Date', 'Created', 'created'];

  urlFields.forEach(f => {
    fields[f] = clipData.url || pageData.url || tab.url;
  });

  titleFields.forEach(f => {
    fields[f] = pageData.title || tab.title;
  });

  if (clipData.type === 'selection' && clipData.text) {
    contentFields.forEach(f => {
      fields[f] = clipData.text;
    });
  } else if (clipData.type === 'image') {
    fields['Image URL'] = clipData.url;
    fields['image_url'] = clipData.url;
  }

  const today = new Date().toISOString().split('T')[0];
  dateFields.forEach(f => {
    fields[f] = today;
  });

  return fields;
}

/**
 * Create a record in Airtable
 */
async function createRecord(baseId, tableId, fields, apiKey = null) {
  if (!apiKey) {
    const settings = await chrome.storage.sync.get(['airtableApiKey']);
    apiKey = settings.airtableApiKey;
  }

  if (!apiKey) {
    throw new Error('API key not configured');
  }

  const response = await fetch(`${AIRTABLE_API_BASE}/${baseId}/${tableId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields,
      typecast: true
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Show notification on the page
 */
async function showNotification(tabId, data) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_CLIP_NOTIFICATION',
      data
    });
  } catch (error) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Airtable Web Clipper',
      message: data.message
    });
  }
}
