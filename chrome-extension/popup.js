/**
 * Airtable Web Clipper 2.0 - Popup Script
 * Launches the clipper panel on the active tab
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loadingStatus = document.getElementById('loadingStatus');
  const errorStatus = document.getElementById('errorStatus');
  const successStatus = document.getElementById('successStatus');
  const errorText = document.getElementById('errorText');
  const retryBtn = document.getElementById('retryBtn');
  const settingsLink = document.getElementById('settingsLink');

  // Settings link
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Retry button
  retryBtn.addEventListener('click', () => {
    errorStatus.classList.add('hidden');
    loadingStatus.classList.remove('hidden');
    openClipper();
  });

  // Open clipper on load
  openClipper();

  async function openClipper() {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showError('No active tab found');
        return;
      }

      // Check for restricted pages
      const blockedPrefixes = ['chrome://', 'chrome-extension://', 'about:', 'arc://', 'edge://', 'brave://', 'file://'];
      const isBlocked = blockedPrefixes.some(prefix => tab.url?.startsWith(prefix));
      
      if (isBlocked || !tab.url) {
        showError('Cannot clip this page. Try on a regular webpage.');
        return;
      }

      // Try to send message to content script
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIPPER' });
        showSuccess();
      } catch (e) {
        // Content script not loaded, inject it first
        console.log('Injecting content script...');
        
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
          });
          
          // Wait a moment for script to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Try again
          await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CLIPPER' });
          showSuccess();
        } catch (injectError) {
          console.error('Failed to inject:', injectError);
          showError('Failed to open clipper. Try refreshing the page.');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      showError('An error occurred. Please try again.');
    }
  }

  function showError(message) {
    loadingStatus.classList.add('hidden');
    successStatus.classList.add('hidden');
    errorStatus.classList.remove('hidden');
    errorText.textContent = message;
  }

  function showSuccess() {
    loadingStatus.classList.add('hidden');
    errorStatus.classList.add('hidden');
    successStatus.classList.remove('hidden');
    
    // Close popup after a short delay
    setTimeout(() => {
      window.close();
    }, 800);
  }
});
