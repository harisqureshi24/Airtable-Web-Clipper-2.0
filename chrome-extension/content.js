/**
 * Airtable Web Clipper 2.0 - Content Script
 * Extracts content from web pages for clipping
 */

(function() {
  'use strict';

  // Track selection changes
  let lastSelection = '';

  // Listen for selection changes
  document.addEventListener('selectionchange', debounce(() => {
    const selection = window.getSelection().toString().trim();

    if (selection !== lastSelection) {
      lastSelection = selection;

      // Notify the popup about selection change
      chrome.runtime.sendMessage({
        type: 'SELECTION_CHANGED',
        data: {
          text: selection,
          url: window.location.href
        }
      }).catch(() => {
        // Popup might not be open
      });
    }
  }, 300));

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'GET_PAGE_DATA':
        sendResponse(getPageData());
        break;

      case 'GET_SELECTION':
        sendResponse({ text: window.getSelection().toString().trim() });
        break;

      case 'GET_ARTICLE_CONTENT':
        sendResponse(extractArticleContent());
        break;

      case 'GET_IMAGES':
        sendResponse(getPageImages());
        break;

      case 'GET_METADATA':
        sendResponse(getPageMetadata());
        break;

      case 'SHOW_CLIP_NOTIFICATION':
        showClipNotification(message.data);
        break;
    }

    return true;
  });

  /**
   * Get comprehensive page data
   */
  function getPageData() {
    return {
      url: window.location.href,
      title: document.title,
      selection: window.getSelection().toString().trim(),
      metadata: getPageMetadata(),
      article: extractArticleContent(),
      images: getPageImages()
    };
  }

  /**
   * Extract page metadata (Open Graph, Twitter Cards, etc.)
   */
  function getPageMetadata() {
    const metadata = {
      title: document.title,
      description: '',
      image: '',
      author: '',
      publishedDate: '',
      siteName: '',
      type: '',
      keywords: []
    };

    // Get meta tags
    const metaTags = document.querySelectorAll('meta');

    metaTags.forEach(tag => {
      const property = tag.getAttribute('property') || tag.getAttribute('name');
      const content = tag.getAttribute('content');

      if (!property || !content) return;

      switch (property.toLowerCase()) {
        case 'og:title':
          metadata.title = content;
          break;
        case 'og:description':
        case 'description':
          if (!metadata.description) metadata.description = content;
          break;
        case 'og:image':
        case 'twitter:image':
          if (!metadata.image) metadata.image = content;
          break;
        case 'author':
        case 'article:author':
          metadata.author = content;
          break;
        case 'article:published_time':
        case 'date':
        case 'pubdate':
          metadata.publishedDate = content;
          break;
        case 'og:site_name':
          metadata.siteName = content;
          break;
        case 'og:type':
          metadata.type = content;
          break;
        case 'keywords':
          metadata.keywords = content.split(',').map(k => k.trim());
          break;
      }
    });

    // Try to get author from schema.org
    const ldJson = document.querySelector('script[type="application/ld+json"]');
    if (ldJson) {
      try {
        const data = JSON.parse(ldJson.textContent);
        if (data.author) {
          metadata.author = data.author.name || data.author;
        }
        if (data.datePublished) {
          metadata.publishedDate = data.datePublished;
        }
      } catch (e) {
        // Invalid JSON
      }
    }

    // Get canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      metadata.canonicalUrl = canonical.href;
    }

    return metadata;
  }

  /**
   * Extract main article content using various heuristics
   */
  function extractArticleContent() {
    // Try various selectors for article content
    const selectors = [
      'article',
      '[role="main"]',
      '.article-content',
      '.post-content',
      '.entry-content',
      '.content-body',
      '#article-body',
      '.story-body',
      'main',
      '.main-content'
    ];

    let articleElement = null;

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 200) {
        articleElement = element;
        break;
      }
    }

    if (!articleElement) {
      // Fallback: find the element with the most text content
      const paragraphs = document.querySelectorAll('p');
      let bestParent = null;
      let maxLength = 0;

      paragraphs.forEach(p => {
        const parent = p.parentElement;
        if (parent) {
          const length = parent.textContent.length;
          if (length > maxLength) {
            maxLength = length;
            bestParent = parent;
          }
        }
      });

      articleElement = bestParent;
    }

    if (!articleElement) {
      return {
        text: document.body.textContent.substring(0, 5000).trim(),
        html: '',
        wordCount: 0
      };
    }

    // Clean up the content
    const clone = articleElement.cloneNode(true);

    // Remove unwanted elements
    const removeSelectors = [
      'script', 'style', 'nav', 'header', 'footer', 'aside',
      '.advertisement', '.ad', '.social-share', '.comments',
      '.related-posts', '.sidebar', '[role="navigation"]'
    ];

    removeSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    const text = clone.textContent.trim();
    const wordCount = text.split(/\s+/).length;

    return {
      text: text.substring(0, 10000), // Limit text length
      html: clone.innerHTML.substring(0, 50000), // Limit HTML length
      wordCount
    };
  }

  /**
   * Get images from the page
   */
  function getPageImages() {
    const images = [];
    const seen = new Set();

    // Get all images
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.dataset.src;
      if (!src || seen.has(src)) return;

      // Filter out tiny images (likely icons/tracking pixels)
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;

      if (width < 100 || height < 100) return;

      seen.add(src);
      images.push({
        src,
        alt: img.alt || '',
        width,
        height
      });
    });

    // Also check for background images in main content
    const mainContent = document.querySelector('article, main, .content');
    if (mainContent) {
      mainContent.querySelectorAll('[style*="background-image"]').forEach(el => {
        const style = el.getAttribute('style');
        const match = style.match(/url\(['"]?([^'"()]+)['"]?\)/);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);
          images.push({
            src: match[1],
            alt: '',
            width: 0,
            height: 0
          });
        }
      });
    }

    return images.slice(0, 20); // Limit to 20 images
  }

  /**
   * Show a notification overlay on the page
   */
  function showClipNotification(data) {
    const notification = document.createElement('div');
    notification.id = 'airtable-clip-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        background: ${data.success ? '#10B981' : '#EF4444'};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideIn 0.3s ease-out;
      ">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${data.success
            ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
        </svg>
        <span>${data.message}</span>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Debounce function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Notify that content script is loaded
  console.log('Airtable Web Clipper 2.0 content script loaded');
})();
