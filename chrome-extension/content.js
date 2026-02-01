/**
 * Airtable Web Clipper 2.0 - Content Script
 * Extracts content from web pages for clipping
 * Enhanced with LinkedIn support and better metadata extraction
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
    const metadata = getPageMetadata();
    const isLinkedIn = window.location.hostname.includes('linkedin.com');

    let url = window.location.href;

    // Handle LinkedIn special URL format
    if (isLinkedIn) {
      url = getLinkedInShareUrl() || url;
    }

    return {
      url: url,
      title: metadata.title || document.title,
      selection: window.getSelection().toString().trim(),
      metadata: metadata,
      article: extractArticleContent(),
      images: getPageImages(),
      isLinkedIn: isLinkedIn
    };
  }

  /**
   * Get LinkedIn share URL (the "Copy link to post" format)
   */
  function getLinkedInShareUrl() {
    // Try to find the share button or copy link
    const currentUrl = window.location.href;

    // Check if it's already a share URL format
    if (currentUrl.includes('/posts/')) {
      return currentUrl;
    }

    // Convert activity URL to posts URL
    // From: https://www.linkedin.com/feed/update/urn:li:activity:7423460890341056512/
    // To: https://www.linkedin.com/posts/[author]-[activity-id]
    const activityMatch = currentUrl.match(/urn:li:activity:(\d+)/);
    if (activityMatch) {
      // Try to get author from page
      const authorElement = document.querySelector('.feed-shared-actor__name, .update-components-actor__name, [data-control-name="actor"] span');
      const authorName = authorElement?.textContent?.trim()?.toLowerCase()?.replace(/\s+/g, '-') || 'unknown';

      // Look for share URL in the page
      const shareLinks = document.querySelectorAll('a[href*="/posts/"]');
      for (const link of shareLinks) {
        if (link.href.includes(activityMatch[1])) {
          return link.href;
        }
      }

      // Check for copy-link button data
      const copyButton = document.querySelector('[data-control-name="copy_link"], button[aria-label*="Copy link"]');
      if (copyButton) {
        const dataUrl = copyButton.getAttribute('data-url') || copyButton.getAttribute('data-share-url');
        if (dataUrl) return dataUrl;
      }
    }

    return null;
  }

  /**
   * Extract page metadata (Open Graph, Twitter Cards, etc.)
   * Enhanced with LinkedIn-specific extraction
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
      keywords: [],
      platform: detectPlatform()
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
        case 'datePublished':
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

    // Try to get data from schema.org JSON-LD
    const ldJsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
    ldJsonScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        extractFromJsonLd(data, metadata);
      } catch (e) {
        // Invalid JSON
      }
    });

    // Platform-specific extraction
    if (metadata.platform === 'linkedin') {
      extractLinkedInMetadata(metadata);
    } else if (metadata.platform === 'twitter') {
      extractTwitterMetadata(metadata);
    } else if (metadata.platform === 'youtube') {
      extractYouTubeMetadata(metadata);
    }

    // Get canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      metadata.canonicalUrl = canonical.href;
    }

    return metadata;
  }

  /**
   * Detect which platform we're on
   */
  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('facebook.com')) return 'facebook';
    if (hostname.includes('instagram.com')) return 'instagram';
    if (hostname.includes('medium.com')) return 'medium';
    if (hostname.includes('substack.com')) return 'substack';
    if (hostname.includes('github.com')) return 'github';
    return 'other';
  }

  /**
   * Extract from JSON-LD structured data
   */
  function extractFromJsonLd(data, metadata) {
    if (Array.isArray(data)) {
      data.forEach(item => extractFromJsonLd(item, metadata));
      return;
    }

    if (data['@type']) {
      if (data.author) {
        metadata.author = typeof data.author === 'string' ? data.author : (data.author.name || data.author);
      }
      if (data.datePublished && !metadata.publishedDate) {
        metadata.publishedDate = data.datePublished;
      }
      if (data.dateCreated && !metadata.publishedDate) {
        metadata.publishedDate = data.dateCreated;
      }
      if (data.headline && !metadata.title) {
        metadata.title = data.headline;
      }
      if (data.description && !metadata.description) {
        metadata.description = data.description;
      }
    }
  }

  /**
   * LinkedIn-specific metadata extraction
   */
  function extractLinkedInMetadata(metadata) {
    // Try to find post date
    // LinkedIn uses relative dates like "1d", "2w", "3mo" or absolute dates
    const dateSelectors = [
      '.feed-shared-actor__sub-description time',
      '.update-components-actor__sub-description time',
      'time.visually-hidden',
      '[data-test-id="post-date"]',
      '.feed-shared-update-v2__description-wrapper time',
      '.update-components-text-view time'
    ];

    for (const selector of dateSelectors) {
      const timeEl = document.querySelector(selector);
      if (timeEl) {
        const datetime = timeEl.getAttribute('datetime');
        if (datetime) {
          metadata.publishedDate = datetime;
          break;
        }
        // Try to parse relative date
        const text = timeEl.textContent.trim();
        const parsedDate = parseRelativeDate(text);
        if (parsedDate) {
          metadata.publishedDate = parsedDate;
          break;
        }
      }
    }

    // Also look for date in the aria-label of time elements
    const timeElements = document.querySelectorAll('time');
    for (const el of timeElements) {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.includes('202')) { // Contains a year
        const parsedDate = parseNaturalDate(ariaLabel);
        if (parsedDate) {
          metadata.publishedDate = parsedDate;
          break;
        }
      }
    }

    // Get author from LinkedIn
    const authorSelectors = [
      '.feed-shared-actor__name',
      '.update-components-actor__name',
      '.feed-shared-actor__title',
      '[data-control-name="actor"] .visually-hidden'
    ];

    for (const selector of authorSelectors) {
      const authorEl = document.querySelector(selector);
      if (authorEl) {
        const authorText = authorEl.textContent.trim();
        if (authorText && !authorText.includes('LinkedIn')) {
          metadata.author = authorText.split('\n')[0].trim();
          break;
        }
      }
    }

    // Get post content as description
    const contentSelectors = [
      '.feed-shared-update-v2__description',
      '.update-components-text',
      '.feed-shared-text'
    ];

    for (const selector of contentSelectors) {
      const contentEl = document.querySelector(selector);
      if (contentEl) {
        metadata.description = contentEl.textContent.trim().substring(0, 500);
        break;
      }
    }
  }

  /**
   * Twitter-specific metadata extraction
   */
  function extractTwitterMetadata(metadata) {
    // Try to get tweet date
    const timeEl = document.querySelector('time');
    if (timeEl) {
      const datetime = timeEl.getAttribute('datetime');
      if (datetime) {
        metadata.publishedDate = datetime;
      }
    }

    // Get author
    const authorEl = document.querySelector('[data-testid="User-Name"] span');
    if (authorEl) {
      metadata.author = authorEl.textContent.trim();
    }
  }

  /**
   * YouTube-specific metadata extraction
   */
  function extractYouTubeMetadata(metadata) {
    // Try to get upload date
    const dateEl = document.querySelector('#info-strings yt-formatted-string, .date');
    if (dateEl) {
      const text = dateEl.textContent.trim();
      const parsedDate = parseNaturalDate(text.replace('Premiered ', '').replace('Streamed live ', ''));
      if (parsedDate) {
        metadata.publishedDate = parsedDate;
      }
    }

    // Get channel name
    const channelEl = document.querySelector('#channel-name a, ytd-channel-name a');
    if (channelEl) {
      metadata.author = channelEl.textContent.trim();
    }
  }

  /**
   * Parse relative dates like "1d ago", "2w", "3mo"
   */
  function parseRelativeDate(text) {
    const now = new Date();
    const lower = text.toLowerCase();

    const patterns = [
      { regex: /(\d+)\s*s(ec)?/i, unit: 'seconds' },
      { regex: /(\d+)\s*m(in)?(?!o)/i, unit: 'minutes' },
      { regex: /(\d+)\s*h(our|r)?/i, unit: 'hours' },
      { regex: /(\d+)\s*d(ay)?/i, unit: 'days' },
      { regex: /(\d+)\s*w(eek|k)?/i, unit: 'weeks' },
      { regex: /(\d+)\s*mo(nth)?/i, unit: 'months' },
      { regex: /(\d+)\s*y(ear|r)?/i, unit: 'years' }
    ];

    for (const { regex, unit } of patterns) {
      const match = lower.match(regex);
      if (match) {
        const value = parseInt(match[1]);
        const date = new Date(now);

        switch (unit) {
          case 'seconds': date.setSeconds(date.getSeconds() - value); break;
          case 'minutes': date.setMinutes(date.getMinutes() - value); break;
          case 'hours': date.setHours(date.getHours() - value); break;
          case 'days': date.setDate(date.getDate() - value); break;
          case 'weeks': date.setDate(date.getDate() - value * 7); break;
          case 'months': date.setMonth(date.getMonth() - value); break;
          case 'years': date.setFullYear(date.getFullYear() - value); break;
        }

        return date.toISOString();
      }
    }

    return null;
  }

  /**
   * Parse natural language dates like "January 15, 2024"
   */
  function parseNaturalDate(text) {
    try {
      // Try direct parsing
      const date = new Date(text);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (e) {
      // Parsing failed
    }
    return null;
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
    // Remove existing notification if any
    const existing = document.getElementById('airtable-clip-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'airtable-clip-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        background: ${data.success ? '#10B981' : '#EF4444'};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 12px;
        animation: airtableSlideIn 0.3s ease-out;
        max-width: 350px;
      ">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
          ${data.success
            ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
        </svg>
        <span>${data.message}</span>
      </div>
      <style>
        @keyframes airtableSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes airtableSlideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      </style>
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      const inner = notification.querySelector('div');
      if (inner) inner.style.animation = 'airtableSlideOut 0.3s ease-out forwards';
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
