/**
 * Airtable Web Clipper 2.0 - Content Script
 * Persistent clipper panel with full Chrome API access
 * Includes metadata extraction with LinkedIn support
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__airtableClipperContent) return;
  window.__airtableClipperContent = true;

  const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

  // ===========================================
  // Clipper Panel State
  // ===========================================
  let clipperPanel = null;
  let clipperState = {
    isOpen: false,
    apiKey: null,
    bases: [],
    currentBase: null,
    currentTable: null,
    tableSchema: null,
    baseSchema: null,
    pageData: {},
    fieldValues: {},
    linkedRecordsCache: {},
    hiddenFields: {},
    fieldOrder: {},
    quickClipBaseId: null,
    quickClipTableId: null,
    createdRecordId: null
  };

  // Track selection changes
  let lastSelection = '';

  // Default hotkeys
  let hotkeys = {
    openClipper: { key: 'A', ctrl: false, alt: true, shift: true, meta: false },
    quickClip: { key: 'S', ctrl: false, alt: true, shift: true, meta: false }
  };

  // ===========================================
  // Settings Management
  // ===========================================
  async function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get(
        ['airtableApiKey', 'quickClipBaseId', 'quickClipTableId', 'hiddenFields', 'fieldOrder', 'hotkeys'],
        (result) => {
          clipperState.apiKey = result.airtableApiKey;
          clipperState.quickClipBaseId = result.quickClipBaseId;
          clipperState.quickClipTableId = result.quickClipTableId;
          clipperState.hiddenFields = result.hiddenFields || {};
          clipperState.fieldOrder = result.fieldOrder || {};
          if (result.hotkeys) {
            hotkeys = result.hotkeys;
          }
          resolve();
        }
      );
    });
  }

  // ===========================================
  // Custom Hotkey Listener
  // ===========================================
  function matchesHotkey(e, hotkey) {
    if (!hotkey || !hotkey.key) return false;
    const keyMatches = e.key.toUpperCase() === hotkey.key.toUpperCase() ||
                       e.code === `Key${hotkey.key.toUpperCase()}`;
    return keyMatches &&
           e.ctrlKey === !!hotkey.ctrl &&
           e.altKey === !!hotkey.alt &&
           e.shiftKey === !!hotkey.shift &&
           e.metaKey === !!hotkey.meta;
  }

  document.addEventListener('keydown', async (e) => {
    // Check for open clipper hotkey
    if (matchesHotkey(e, hotkeys.openClipper)) {
      e.preventDefault();
      toggleClipper();
      return;
    }

    // Check for quick clip hotkey
    if (matchesHotkey(e, hotkeys.quickClip)) {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'QUICK_CLIP', data: { type: 'page' } });
      return;
    }
  });

  // ===========================================
  // Panel Creation & Management
  // ===========================================
  function injectStyles() {
    if (document.getElementById('airtable-clipper-styles')) return;

    const link = document.createElement('link');
    link.id = 'airtable-clipper-styles';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('clipper-panel.css');
    document.head.appendChild(link);
  }

  function createClipperPanel() {
    if (clipperPanel) return;

    injectStyles();

    clipperPanel = document.createElement('div');
    clipperPanel.id = 'airtable-clipper-panel';
    clipperPanel.className = 'hidden';

    clipperPanel.innerHTML = `
      <div class="clipper-container">
        <div class="clipper-header">
          <div class="clipper-logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#FCB400"/>
              <path d="M2 17L12 22L22 17" stroke="#18BFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="#F82B60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Web Clipper</span>
          </div>
          <button class="clipper-close" id="clipper-close-btn" title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="clipper-body">
          <!-- Setup Required -->
          <div id="clipper-setup" class="setup-required hidden">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2D7FF9" stroke-width="1.5">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
            <h2>Set Up Connection</h2>
            <p>Configure your Airtable API key to start clipping</p>
            <button class="btn btn-primary" id="clipper-setup-btn">Open Settings</button>
          </div>

          <!-- Main Content -->
          <div id="clipper-main" class="hidden">
            <div class="page-info">
              <div class="page-thumbnail" id="clipper-thumbnail">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <div class="page-details">
                <div class="page-title-display" id="clipper-page-title">Loading...</div>
                <div class="page-url-display" id="clipper-page-url"></div>
              </div>
            </div>

            <div class="form-group">
              <label>Base</label>
              <select class="select" id="clipper-base-select" disabled>
                <option value="">Loading bases...</option>
              </select>
            </div>

            <div class="form-group">
              <label>Table</label>
              <select class="select" id="clipper-table-select" disabled>
                <option value="">Select a base first...</option>
              </select>
            </div>

            <div class="fields-container" id="clipper-fields"></div>
          </div>

          <!-- Success -->
          <div id="clipper-success" class="state-message hidden">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h2>Clipped!</h2>
            <p id="clipper-success-details">Record created successfully</p>
            <div class="actions">
              <button class="btn btn-secondary" id="clipper-view-btn">View Record</button>
              <button class="btn btn-primary" id="clipper-another-btn">Clip Another</button>
            </div>
          </div>

          <!-- Error -->
          <div id="clipper-error" class="state-message hidden">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <h2>Error</h2>
            <p id="clipper-error-details">Something went wrong</p>
            <div class="actions">
              <button class="btn btn-primary" id="clipper-retry-btn">Try Again</button>
            </div>
          </div>
        </div>

        <div class="clipper-footer" id="clipper-footer">
          <button class="btn btn-primary" id="clipper-submit-btn" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            Clip to Airtable
          </button>
        </div>

        <div class="keyboard-hint">
          Press <kbd>Esc</kbd> to close
        </div>

        <div class="loading-overlay hidden" id="clipper-loading">
          <div class="spinner"></div>
          <p id="clipper-loading-text">Loading...</p>
        </div>
      </div>
    `;

    document.body.appendChild(clipperPanel);
    bindClipperEvents();
  }

  function bindClipperEvents() {
    // Close button
    clipperPanel.querySelector('#clipper-close-btn').addEventListener('click', closeClipper);

    // Setup button
    clipperPanel.querySelector('#clipper-setup-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    });

    // Base select
    clipperPanel.querySelector('#clipper-base-select').addEventListener('change', (e) => {
      onBaseSelect(e.target.value);
    });

    // Table select
    clipperPanel.querySelector('#clipper-table-select').addEventListener('change', (e) => {
      onTableSelect(e.target.value);
    });

    // Submit button
    clipperPanel.querySelector('#clipper-submit-btn').addEventListener('click', submitToAirtable);

    // Success actions
    clipperPanel.querySelector('#clipper-view-btn').addEventListener('click', viewRecord);
    clipperPanel.querySelector('#clipper-another-btn').addEventListener('click', resetClipper);

    // Error retry
    clipperPanel.querySelector('#clipper-retry-btn').addEventListener('click', showMainView);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && clipperState.isOpen) {
        closeClipper();
      }
    });

    // Close dropdowns when clicking outside
    clipperPanel.addEventListener('click', (e) => {
      if (!e.target.closest('.searchable-select') && !e.target.closest('.linked-records-field')) {
        clipperPanel.querySelectorAll('.select-dropdown, .linked-dropdown').forEach(el => {
          el.classList.add('hidden');
        });
      }
    });
  }

  // ===========================================
  // Panel Toggle/Open/Close
  // ===========================================
  async function toggleClipper() {
    if (clipperState.isOpen) {
      closeClipper();
    } else {
      await openClipper();
    }
  }

  async function openClipper() {
    if (clipperState.isOpen) return;

    createClipperPanel();
    await loadSettings();

    clipperPanel.classList.remove('hidden');
    clipperState.isOpen = true;

    if (clipperState.apiKey) {
      showMainView();
      loadPageData();
      await loadBases();
    } else {
      showSetupView();
    }
  }

  function closeClipper() {
    if (!clipperState.isOpen || !clipperPanel) return;

    clipperPanel.classList.add('closing');
      setTimeout(() => {
      clipperPanel.classList.add('hidden');
      clipperPanel.classList.remove('closing');
      clipperState.isOpen = false;
    }, 200);
  }

  // ===========================================
  // View Helpers
  // ===========================================
  function showSetupView() {
    clipperPanel.querySelector('#clipper-setup').classList.remove('hidden');
    clipperPanel.querySelector('#clipper-main').classList.add('hidden');
    clipperPanel.querySelector('#clipper-success').classList.add('hidden');
    clipperPanel.querySelector('#clipper-error').classList.add('hidden');
    clipperPanel.querySelector('#clipper-footer').classList.add('hidden');
  }

  function showMainView() {
    clipperPanel.querySelector('#clipper-setup').classList.add('hidden');
    clipperPanel.querySelector('#clipper-main').classList.remove('hidden');
    clipperPanel.querySelector('#clipper-success').classList.add('hidden');
    clipperPanel.querySelector('#clipper-error').classList.add('hidden');
    clipperPanel.querySelector('#clipper-footer').classList.remove('hidden');
  }

  function showSuccessView(tableName) {
    clipperPanel.querySelector('#clipper-setup').classList.add('hidden');
    clipperPanel.querySelector('#clipper-main').classList.add('hidden');
    clipperPanel.querySelector('#clipper-success').classList.remove('hidden');
    clipperPanel.querySelector('#clipper-error').classList.add('hidden');
    clipperPanel.querySelector('#clipper-footer').classList.add('hidden');
    clipperPanel.querySelector('#clipper-success-details').textContent = `Record created in "${tableName}"`;
  }

  function showErrorView(message) {
    clipperPanel.querySelector('#clipper-setup').classList.add('hidden');
    clipperPanel.querySelector('#clipper-main').classList.add('hidden');
    clipperPanel.querySelector('#clipper-success').classList.add('hidden');
    clipperPanel.querySelector('#clipper-error').classList.remove('hidden');
    clipperPanel.querySelector('#clipper-footer').classList.add('hidden');
    clipperPanel.querySelector('#clipper-error-details').textContent = message;
  }

  function showLoading(text = 'Loading...') {
    clipperPanel.querySelector('#clipper-loading').classList.remove('hidden');
    clipperPanel.querySelector('#clipper-loading-text').textContent = text;
  }

  function hideLoading() {
    clipperPanel.querySelector('#clipper-loading').classList.add('hidden');
  }

  // ===========================================
  // Data Loading
  // ===========================================
  function loadPageData() {
    const metadata = getPageMetadata();

    clipperState.pageData = {
      url: metadata.url || window.location.href,
      title: metadata.title || document.title,
      metadata: metadata
    };

    clipperPanel.querySelector('#clipper-page-title').textContent = clipperState.pageData.title;
    clipperPanel.querySelector('#clipper-page-url').textContent = clipperState.pageData.url;

    const favicon = document.querySelector('link[rel*="icon"]');
    if (favicon?.href) {
      clipperPanel.querySelector('#clipper-thumbnail').innerHTML =
        `<img src="${favicon.href}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    }
  }

  async function loadBases() {
    showLoading('Loading bases...');

    try {
      const response = await apiRequest('https://api.airtable.com/v0/meta/bases');
      clipperState.bases = response.bases || [];

      const select = clipperPanel.querySelector('#clipper-base-select');
      select.innerHTML = '<option value="">Select a base...</option>';
      select.disabled = false;

      clipperState.bases.forEach(base => {
        const option = document.createElement('option');
        option.value = base.id;
        option.textContent = base.name;
        select.appendChild(option);
      });

      // Pre-select from quick clip settings
      if (clipperState.quickClipBaseId) {
        select.value = clipperState.quickClipBaseId;
        await onBaseSelect(clipperState.quickClipBaseId);
      }
    } catch (error) {
      console.error('Error loading bases:', error);
      showErrorView('Failed to load bases. Check your API key.');
    } finally {
      hideLoading();
    }
  }

  async function onBaseSelect(baseId) {
    const tableSelect = clipperPanel.querySelector('#clipper-table-select');

    if (!baseId) {
      tableSelect.disabled = true;
      tableSelect.innerHTML = '<option value="">Select a base first...</option>';
      clipperPanel.querySelector('#clipper-fields').innerHTML = '';
      clipperPanel.querySelector('#clipper-submit-btn').disabled = true;
      return;
    }

    clipperState.currentBase = baseId;
    showLoading('Loading tables...');

    try {
      const response = await apiRequest(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`);
      clipperState.baseSchema = response;

      tableSelect.disabled = false;
      tableSelect.innerHTML = '<option value="">Select a table...</option>';

      response.tables.forEach(table => {
        const option = document.createElement('option');
        option.value = table.id;
        option.textContent = table.name;
        tableSelect.appendChild(option);
      });

      // Pre-select from quick clip settings
      if (clipperState.quickClipTableId && baseId === clipperState.quickClipBaseId) {
        tableSelect.value = clipperState.quickClipTableId;
        await onTableSelect(clipperState.quickClipTableId);
      }
    } catch (error) {
      console.error('Error loading tables:', error);
    } finally {
      hideLoading();
    }
  }

  async function onTableSelect(tableId) {
    if (!tableId) {
      clipperPanel.querySelector('#clipper-fields').innerHTML = '';
      clipperPanel.querySelector('#clipper-submit-btn').disabled = true;
      return;
    }

    clipperState.currentTable = tableId;
    clipperState.tableSchema = clipperState.baseSchema.tables.find(t => t.id === tableId);
    clipperState.fieldValues = {};
    clipperState.linkedRecordsCache = {};

    if (clipperState.tableSchema) {
      renderFields(clipperState.tableSchema.fields);
      clipperPanel.querySelector('#clipper-submit-btn').disabled = false;
    }
  }

  // ===========================================
  // Field Rendering
  // ===========================================
  function renderFields(fields) {
    const container = clipperPanel.querySelector('#clipper-fields');
    container.innerHTML = '';

    const nonEditableTypes = ['autoNumber', 'createdTime', 'lastModifiedTime',
                              'createdBy', 'lastModifiedBy', 'count',
                              'lookup', 'rollup', 'formula', 'button'];

    // Get hidden fields and field order for current table
    const tableKey = `${clipperState.currentBase}_${clipperState.currentTable}`;
    const hiddenFieldIds = clipperState.hiddenFields[tableKey] || [];
    const savedOrder = clipperState.fieldOrder[tableKey] || [];

    let editableFields = fields.filter(field => {
      if (nonEditableTypes.includes(field.type)) return false;
      if (hiddenFieldIds.includes(field.id)) return false;
      return true;
    });

    // Apply saved order if exists
    if (savedOrder.length > 0) {
      editableFields.sort((a, b) => {
        const indexA = savedOrder.indexOf(a.id);
        const indexB = savedOrder.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
    }

    editableFields.forEach(field => {
      const fieldElement = createFieldInput(field);
      container.appendChild(fieldElement);
    });

    autoPopulateFields(editableFields);
  }

  function createFieldInput(field) {
    const div = document.createElement('div');
    div.className = 'field-item';
    div.dataset.fieldId = field.id;

    const label = document.createElement('div');
    label.className = 'field-label';
    label.innerHTML = `<span>${field.name}</span><span class="field-type-badge">${getFieldTypeBadge(field.type)}</span>`;
    div.appendChild(label);

    const input = createInputForType(field);
    div.appendChild(input);

    return div;
  }

  function getFieldTypeBadge(type) {
    const badges = {
      'singleLineText': 'TEXT', 'multilineText': 'LONG', 'email': 'EMAIL',
      'url': 'URL', 'phoneNumber': 'PHONE', 'number': 'NUM', 'currency': '$',
      'percent': '%', 'date': 'DATE', 'dateTime': 'DATE', 'checkbox': 'CHECK',
      'singleSelect': 'SELECT', 'multipleSelects': 'MULTI', 'multipleRecordLinks': 'LINK',
      'rating': 'RATE', 'richText': 'RICH', 'multipleAttachments': 'FILE', 'barcode': 'CODE'
    };
    return badges[type] || type.substring(0, 4).toUpperCase();
  }

  function createInputForType(field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field-input-wrapper';

    switch (field.type) {
      case 'singleLineText':
      case 'email':
      case 'url':
      case 'phoneNumber':
      case 'barcode':
        const inputType = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
        wrapper.innerHTML = `<input type="${inputType}" class="input" id="field-${field.id}" placeholder="Enter ${field.name.toLowerCase()}">`;
        wrapper.querySelector('input').addEventListener('input', (e) => {
          clipperState.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'multilineText':
      case 'richText':
        wrapper.innerHTML = `<textarea class="textarea" id="field-${field.id}" placeholder="Enter ${field.name.toLowerCase()}" rows="2"></textarea>`;
        wrapper.querySelector('textarea').addEventListener('input', (e) => {
          clipperState.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'number':
      case 'currency':
      case 'percent':
      case 'duration':
        wrapper.innerHTML = `<input type="number" class="input" id="field-${field.id}" step="any" placeholder="0">`;
        wrapper.querySelector('input').addEventListener('input', (e) => {
          clipperState.fieldValues[field.id] = e.target.value ? parseFloat(e.target.value) : undefined;
        });
        break;

      case 'date':
        wrapper.innerHTML = `<input type="date" class="input" id="field-${field.id}">`;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          clipperState.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'dateTime':
        wrapper.innerHTML = `<input type="datetime-local" class="input" id="field-${field.id}">`;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          clipperState.fieldValues[field.id] = e.target.value ? new Date(e.target.value).toISOString() : undefined;
        });
        break;

      case 'checkbox':
        wrapper.innerHTML = `<div class="checkbox-wrapper"><input type="checkbox" class="checkbox" id="field-${field.id}"><label for="field-${field.id}">Yes</label></div>`;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          clipperState.fieldValues[field.id] = e.target.checked;
        });
        break;

      case 'singleSelect':
        wrapper.appendChild(createSearchableSelect(field, false));
        break;

      case 'multipleSelects':
        wrapper.appendChild(createSearchableSelect(field, true));
        break;

      case 'rating':
        const maxRating = field.options?.max || 5;
        wrapper.innerHTML = `<div class="rating-container" id="field-${field.id}">${Array.from({length: maxRating}, (_, i) =>
          `<button type="button" class="rating-star" data-value="${i + 1}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>`
        ).join('')}</div>`;
        wrapper.querySelectorAll('.rating-star').forEach(star => {
          star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            clipperState.fieldValues[field.id] = value;
            updateRatingUI(field.id, value);
          });
        });
        break;

      case 'multipleRecordLinks':
        wrapper.appendChild(createLinkedRecordField(field));
        break;

      case 'multipleAttachments':
        wrapper.innerHTML = `<div class="attachment-container" id="field-${field.id}"><div class="attachment-list"></div><button type="button" class="add-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Add URL</button></div>`;
        clipperState.fieldValues[field.id] = [];
        wrapper.querySelector('.add-btn').addEventListener('click', () => {
          const url = prompt('Enter attachment URL:');
          if (url) addAttachment(field.id, url);
        });
        break;

      default:
        wrapper.innerHTML = `<input type="text" class="input" id="field-${field.id}" placeholder="Enter ${field.name.toLowerCase()}">`;
        wrapper.querySelector('input').addEventListener('input', (e) => {
          clipperState.fieldValues[field.id] = e.target.value || undefined;
        });
    }

    return wrapper;
  }

  // ===========================================
  // Searchable Select
  // ===========================================
  function createSearchableSelect(field, isMultiple) {
    const container = document.createElement('div');
    container.className = 'searchable-select';
    container.id = `field-${field.id}`;

    const options = field.options?.choices || [];
    if (isMultiple) clipperState.fieldValues[field.id] = [];

    container.innerHTML = `
      <div class="select-tags"></div>
      <input type="text" class="select-input" placeholder="Type to search...">
      <div class="select-dropdown hidden">
        <div class="select-options"></div>
        <div class="select-create hidden"><span>+</span> Create "<span class="create-value"></span>"</div>
      </div>
    `;

    const input = container.querySelector('.select-input');
    const dropdown = container.querySelector('.select-dropdown');
    const optionsContainer = container.querySelector('.select-options');
    const createOption = container.querySelector('.select-create');

    const renderOptions = (filter = '') => {
      const filterLower = filter.toLowerCase();
      const filtered = options.filter(opt => opt.name.toLowerCase().includes(filterLower));

      optionsContainer.innerHTML = filtered.map(opt =>
        `<div class="select-option" data-value="${opt.name}"><span class="option-color" style="background:${getSelectColor(opt.color)}"></span>${opt.name}</div>`
      ).join('');

      optionsContainer.querySelectorAll('.select-option').forEach(el => {
        el.addEventListener('click', () => selectOption(field, el.dataset.value, isMultiple, container));
      });

      const exactMatch = options.some(opt => opt.name.toLowerCase() === filterLower);
      if (filter && !exactMatch) {
        createOption.classList.remove('hidden');
        createOption.querySelector('.create-value').textContent = filter;
      } else {
        createOption.classList.add('hidden');
      }
    };

    input.addEventListener('focus', () => {
      dropdown.classList.remove('hidden');
      renderOptions(input.value);
    });

    input.addEventListener('input', () => renderOptions(input.value));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value.trim();
        if (value) selectOption(field, value, isMultiple, container);
      } else if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
        input.blur();
      }
    });

    createOption.addEventListener('click', () => {
      const value = input.value.trim();
      if (value) selectOption(field, value, isMultiple, container);
    });

    return container;
  }

  function getSelectColor(colorName) {
    const colors = {
      'blueLight2': '#D0F0FD', 'cyanLight2': '#C2F5E9', 'tealLight2': '#C2F5E9',
      'greenLight2': '#D1F7C4', 'yellowLight2': '#FFEAB6', 'orangeLight2': '#FEE2D5',
      'redLight2': '#FFDCE5', 'pinkLight2': '#FFDAF6', 'purpleLight2': '#EDE2FE', 'grayLight2': '#E5E5E5'
    };
    return colors[colorName] || colorName || '#E5E7EB';
  }

  function selectOption(field, value, isMultiple, container) {
    const input = container.querySelector('.select-input');
    const dropdown = container.querySelector('.select-dropdown');
    const tagsContainer = container.querySelector('.select-tags');

    if (isMultiple) {
      if (clipperState.fieldValues[field.id]?.includes(value)) {
        input.value = '';
        dropdown.classList.add('hidden');
        return;
      }
      if (!clipperState.fieldValues[field.id]) clipperState.fieldValues[field.id] = [];
      clipperState.fieldValues[field.id].push(value);

      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `${value}<button type="button" class="tag-remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
      tag.querySelector('.tag-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        clipperState.fieldValues[field.id] = clipperState.fieldValues[field.id].filter(v => v !== value);
        tag.remove();
      });
      tagsContainer.appendChild(tag);
    } else {
      clipperState.fieldValues[field.id] = value;
      tagsContainer.innerHTML = `<span class="tag single">${value}<button type="button" class="tag-remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button></span>`;
      tagsContainer.querySelector('.tag-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        clipperState.fieldValues[field.id] = undefined;
        tagsContainer.innerHTML = '';
        input.classList.remove('hidden');
      });
      input.classList.add('hidden');
    }

    input.value = '';
    dropdown.classList.add('hidden');
  }

  // ===========================================
  // Linked Records
  // ===========================================
  function createLinkedRecordField(field) {
    const container = document.createElement('div');
    container.className = 'linked-records-field';
    container.id = `field-${field.id}`;

    const linkedTableId = field.options?.linkedTableId;

    container.innerHTML = `
      <div class="linked-items"></div>
      <div class="linked-search-container">
        <input type="text" class="linked-search-input" placeholder="Search records...">
        <div class="linked-dropdown hidden">
          <div class="linked-options"></div>
          <div class="linked-loading hidden">Loading...</div>
        </div>
      </div>
    `;

    clipperState.fieldValues[field.id] = [];

    const searchInput = container.querySelector('.linked-search-input');
    const dropdown = container.querySelector('.linked-dropdown');
    const optionsContainer = container.querySelector('.linked-options');
    const loadingEl = container.querySelector('.linked-loading');

    let searchTimeout = null;

    const loadRecords = async (filter = '') => {
      if (!linkedTableId) return;

      loadingEl.classList.remove('hidden');
      optionsContainer.innerHTML = '';

      try {
        if (!clipperState.linkedRecordsCache[linkedTableId]) {
          const result = await apiRequest(`${AIRTABLE_API_BASE}/${clipperState.currentBase}/${linkedTableId}?maxRecords=100`);
          clipperState.linkedRecordsCache[linkedTableId] = result.records || [];
        }

        const records = clipperState.linkedRecordsCache[linkedTableId];
        const filterLower = filter.toLowerCase();

        const filtered = records.filter(r => {
          const primaryValue = Object.values(r.fields)[0]?.toString() || '';
          return primaryValue.toLowerCase().includes(filterLower);
        }).slice(0, 15);

        optionsContainer.innerHTML = filtered.length
          ? filtered.map(r => {
              const primaryValue = Object.values(r.fields)[0] || r.id;
              return `<div class="linked-option" data-id="${r.id}" data-name="${primaryValue}">${primaryValue}</div>`;
            }).join('')
          : '<div class="linked-empty">No records found</div>';

        optionsContainer.querySelectorAll('.linked-option').forEach(el => {
          el.addEventListener('click', () => {
            addLinkedRecord(field.id, { id: el.dataset.id, name: el.dataset.name }, container);
            searchInput.value = '';
            dropdown.classList.add('hidden');
          });
        });

      } catch (error) {
        optionsContainer.innerHTML = '<div class="linked-empty">Error loading records</div>';
      } finally {
        loadingEl.classList.add('hidden');
      }
    };

    searchInput.addEventListener('focus', () => {
      dropdown.classList.remove('hidden');
      loadRecords(searchInput.value);
    });

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadRecords(searchInput.value), 300);
    });

    return container;
  }

  function addLinkedRecord(fieldId, record, container) {
    if (!clipperState.fieldValues[fieldId]) clipperState.fieldValues[fieldId] = [];
    if (clipperState.fieldValues[fieldId].find(r => r.id === record.id)) return;

    clipperState.fieldValues[fieldId].push({ id: record.id });

    const itemsDiv = container.querySelector('.linked-items');
    const item = document.createElement('div');
    item.className = 'linked-record-item';
    item.innerHTML = `<span>${record.name}</span><button type="button" class="linked-record-remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

    item.querySelector('.linked-record-remove').addEventListener('click', () => {
      clipperState.fieldValues[fieldId] = clipperState.fieldValues[fieldId].filter(r => r.id !== record.id);
      item.remove();
    });

    itemsDiv.appendChild(item);
  }

  // ===========================================
  // UI Helpers
  // ===========================================
  function updateRatingUI(fieldId, value) {
    const container = clipperPanel.querySelector(`#field-${fieldId}`);
    container.querySelectorAll('.rating-star').forEach(star => {
      const starValue = parseInt(star.dataset.value);
      star.classList.toggle('active', starValue <= value);
    });
  }

  function addAttachment(fieldId, url) {
    if (!clipperState.fieldValues[fieldId]) clipperState.fieldValues[fieldId] = [];
    clipperState.fieldValues[fieldId].push({ url });

    const container = clipperPanel.querySelector(`#field-${fieldId}`);
    const list = container.querySelector('.attachment-list');

    const item = document.createElement('div');
    item.className = 'linked-record-item';
    item.innerHTML = `<span>${url.substring(0, 30)}${url.length > 30 ? '...' : ''}</span><button type="button" class="linked-record-remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

    item.querySelector('.linked-record-remove').addEventListener('click', () => {
      clipperState.fieldValues[fieldId] = clipperState.fieldValues[fieldId].filter(a => a.url !== url);
      item.remove();
    });

    list.appendChild(item);
  }

  // ===========================================
  // Auto-populate Fields
  // ===========================================
  function autoPopulateFields(fields) {
    fields.forEach(field => {
      const fieldName = field.name.toLowerCase();
      const inputElement = clipperPanel.querySelector(`#field-${field.id}`);
      if (!inputElement) return;

      const input = inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA'
        ? inputElement : inputElement.querySelector('input, textarea');

      // URL/Link fields - only populate if field type is URL
      if (field.type === 'url' && (fieldName === 'link' || fieldName === 'url')) {
        if (input) {
          input.value = clipperState.pageData.url || '';
          clipperState.fieldValues[field.id] = clipperState.pageData.url;
        }
      }

      // Title fields
      if (fieldName.includes('title') || fieldName === 'name') {
        if (field.type === 'singleLineText' || field.type === 'multilineText') {
          const title = clipperState.pageData.metadata?.title || clipperState.pageData.title || '';
          if (input) {
            input.value = title;
            clipperState.fieldValues[field.id] = title;
          }
        }
      }

      // Author fields
      if (fieldName.includes('author') || fieldName === 'by' || fieldName === 'creator') {
        if (field.type === 'singleLineText') {
          const author = clipperState.pageData.metadata?.author || '';
          if (input && author) {
            input.value = author;
            clipperState.fieldValues[field.id] = author;
          }
        }
      }

      // Date Published fields
      if (fieldName.includes('publish') || fieldName.includes('posted') || fieldName === 'date published') {
        if (field.type === 'date' || field.type === 'dateTime') {
          const publishedDate = clipperState.pageData.metadata?.publishedDate;
          if (publishedDate && input) {
            try {
              const date = new Date(publishedDate);
              if (!isNaN(date.getTime())) {
                if (field.type === 'date') {
                  input.value = date.toISOString().split('T')[0];
                  clipperState.fieldValues[field.id] = date.toISOString().split('T')[0];
                } else {
                  input.value = date.toISOString().slice(0, 16);
                  clipperState.fieldValues[field.id] = date.toISOString();
                }
              }
            } catch (e) {}
          }
        }
      }

      // Clipped date - default to today
      if (fieldName.includes('clipped') || fieldName.includes('created') || fieldName.includes('added')) {
        if ((field.type === 'date' || field.type === 'dateTime') && !clipperState.fieldValues[field.id]) {
          const now = new Date();
          if (input) {
            if (field.type === 'date') {
              input.value = now.toISOString().split('T')[0];
              clipperState.fieldValues[field.id] = now.toISOString().split('T')[0];
            } else {
              input.value = now.toISOString().slice(0, 16);
              clipperState.fieldValues[field.id] = now.toISOString();
            }
          }
        }
      }
    });
  }

  // ===========================================
  // Submit to Airtable
  // ===========================================
  async function submitToAirtable() {
    if (!clipperState.currentBase || !clipperState.currentTable) {
      alert('Please select a base and table first.');
      return;
    }

    showLoading('Clipping to Airtable...');

    try {
      const fields = {};

      for (const [fieldId, value] of Object.entries(clipperState.fieldValues)) {
        // Skip empty values
        if (value === undefined || value === '' || value === null) continue;
        if (Array.isArray(value) && value.length === 0) continue;

        const fieldSchema = clipperState.tableSchema.fields.find(f => f.id === fieldId);
        if (!fieldSchema) continue;

        // Format value based on field type
        // With typecast: true, Airtable accepts plain strings for selects
        switch (fieldSchema.type) {
          case 'singleSelect':
            // Send as plain string with typecast
            if (typeof value === 'string' && value.trim()) {
              fields[fieldSchema.name] = value;
            }
            break;

          case 'multipleSelects':
            // Send as array of strings with typecast
            if (Array.isArray(value) && value.length > 0) {
              fields[fieldSchema.name] = value.filter(v => typeof v === 'string' && v.trim());
            }
            break;

          case 'multipleRecordLinks':
            // Send as array of record IDs
            if (Array.isArray(value) && value.length > 0) {
              const recordIds = value.map(v => v.id || v).filter(Boolean);
              if (recordIds.length > 0) {
                fields[fieldSchema.name] = recordIds;
              }
            }
            break;

          case 'multipleAttachments':
            // Send as array of {url: ...} objects
            if (Array.isArray(value) && value.length > 0) {
              fields[fieldSchema.name] = value.filter(v => v.url);
            }
            break;

          case 'checkbox':
            // Send boolean
            fields[fieldSchema.name] = !!value;
            break;

          case 'number':
          case 'currency':
          case 'percent':
          case 'rating':
            // Send as number
            if (typeof value === 'number' && !isNaN(value)) {
              fields[fieldSchema.name] = value;
            }
            break;

          default:
            // For text, url, email, date, etc. - send as-is
            fields[fieldSchema.name] = value;
        }
      }

      // Only submit if we have at least one field
      if (Object.keys(fields).length === 0) {
        hideLoading();
        showErrorView('Please fill in at least one field');
        return;
      }

      const result = await apiRequest(`${AIRTABLE_API_BASE}/${clipperState.currentBase}/${clipperState.currentTable}`, {
        method: 'POST',
        body: JSON.stringify({ fields, typecast: true })
      });

      clipperState.createdRecordId = result.id;
      hideLoading();
      showSuccessView(clipperState.tableSchema.name);

    } catch (error) {
      console.error('Error clipping:', error);
      hideLoading();
      showErrorView(error.message || 'Failed to create record');
    }
  }

  function viewRecord() {
    if (clipperState.createdRecordId && clipperState.currentBase && clipperState.currentTable) {
      const url = `https://airtable.com/${clipperState.currentBase}/${clipperState.currentTable}/${clipperState.createdRecordId}`;
      window.open(url, '_blank');
    }
  }

  function resetClipper() {
    clipperState.fieldValues = {};
    clipperState.createdRecordId = null;
    showMainView();

    if (clipperState.tableSchema) {
      renderFields(clipperState.tableSchema.fields);
    }

    loadPageData();
  }

  // ===========================================
  // API Request Helper
  // ===========================================
  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${clipperState.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  // ===========================================
  // Page Metadata Extraction
  // ===========================================
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
      platform: detectPlatform(),
      url: window.location.href
    };

    // Handle LinkedIn URL
    if (metadata.platform === 'linkedin') {
      metadata.url = getLinkedInShareUrl() || window.location.href;
    }

    // Get meta tags
    document.querySelectorAll('meta').forEach(tag => {
      const property = tag.getAttribute('property') || tag.getAttribute('name');
      const content = tag.getAttribute('content');

      if (!property || !content) return;

      switch (property.toLowerCase()) {
        case 'og:title': metadata.title = content; break;
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
        case 'datepublished':
          metadata.publishedDate = content;
          break;
        case 'og:site_name':
          metadata.siteName = content;
          break;
      }
    });

    // JSON-LD extraction
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        extractFromJsonLd(data, metadata);
      } catch (e) {}
    });

    // Platform-specific extraction
    if (metadata.platform === 'linkedin') extractLinkedInMetadata(metadata);
    else if (metadata.platform === 'twitter') extractTwitterMetadata(metadata);
    else if (metadata.platform === 'youtube') extractYouTubeMetadata(metadata);

    return metadata;
  }

  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('facebook.com')) return 'facebook';
    if (hostname.includes('medium.com')) return 'medium';
    if (hostname.includes('github.com')) return 'github';
    return 'other';
  }

  function getLinkedInShareUrl() {
    const currentUrl = window.location.href;
    if (currentUrl.includes('/posts/')) return currentUrl;

    const activityMatch = currentUrl.match(/urn:li:activity:(\d+)/);
    if (activityMatch) {
      const shareLinks = document.querySelectorAll('a[href*="/posts/"]');
      for (const link of shareLinks) {
        if (link.href.includes(activityMatch[1])) return link.href;
      }
    }
    return null;
  }

  function extractFromJsonLd(data, metadata) {
    if (Array.isArray(data)) {
      data.forEach(item => extractFromJsonLd(item, metadata));
      return;
    }

    if (data['@type']) {
      if (data.author) {
        metadata.author = typeof data.author === 'string' ? data.author : (data.author.name || data.author);
      }
      if (data.datePublished && !metadata.publishedDate) metadata.publishedDate = data.datePublished;
      if (data.headline && !metadata.title) metadata.title = data.headline;
    }
  }

  function extractLinkedInMetadata(metadata) {
    const dateSelectors = [
      '.feed-shared-actor__sub-description time',
      '.update-components-actor__sub-description time',
      'time.visually-hidden'
    ];

    for (const selector of dateSelectors) {
      const timeEl = document.querySelector(selector);
      if (timeEl) {
        const datetime = timeEl.getAttribute('datetime');
        if (datetime) { metadata.publishedDate = datetime; break; }
        const parsed = parseRelativeDate(timeEl.textContent.trim());
        if (parsed) { metadata.publishedDate = parsed; break; }
      }
    }

    const authorSelectors = ['.feed-shared-actor__name', '.update-components-actor__name'];
    for (const selector of authorSelectors) {
      const el = document.querySelector(selector);
      if (el) { metadata.author = el.textContent.trim().split('\n')[0].trim(); break; }
    }
  }

  function extractTwitterMetadata(metadata) {
    const timeEl = document.querySelector('time');
    if (timeEl) {
      const datetime = timeEl.getAttribute('datetime');
      if (datetime) metadata.publishedDate = datetime;
    }

    const authorEl = document.querySelector('[data-testid="User-Name"] span');
    if (authorEl) metadata.author = authorEl.textContent.trim();
  }

  function extractYouTubeMetadata(metadata) {
    const dateEl = document.querySelector('#info-strings yt-formatted-string');
    if (dateEl) {
      const parsed = parseNaturalDate(dateEl.textContent.trim());
      if (parsed) metadata.publishedDate = parsed;
    }

    const channelEl = document.querySelector('#channel-name a');
    if (channelEl) metadata.author = channelEl.textContent.trim();
  }

  function parseRelativeDate(text) {
    const now = new Date();
    const patterns = [
      { regex: /(\d+)\s*d(ay)?/i, unit: 'days' },
      { regex: /(\d+)\s*w(eek|k)?/i, unit: 'weeks' },
      { regex: /(\d+)\s*mo(nth)?/i, unit: 'months' },
      { regex: /(\d+)\s*h(our|r)?/i, unit: 'hours' }
    ];

    for (const { regex, unit } of patterns) {
      const match = text.toLowerCase().match(regex);
      if (match) {
        const value = parseInt(match[1]);
        const date = new Date(now);
        switch (unit) {
          case 'hours': date.setHours(date.getHours() - value); break;
          case 'days': date.setDate(date.getDate() - value); break;
          case 'weeks': date.setDate(date.getDate() - value * 7); break;
          case 'months': date.setMonth(date.getMonth() - value); break;
        }
        return date.toISOString();
      }
    }
    return null;
  }

  function parseNaturalDate(text) {
    try {
      const date = new Date(text);
      if (!isNaN(date.getTime())) return date.toISOString();
    } catch (e) {}
    return null;
  }

  // ===========================================
  // Message Handling
  // ===========================================
  document.addEventListener('selectionchange', debounce(() => {
    const selection = window.getSelection().toString().trim();
    if (selection !== lastSelection) {
      lastSelection = selection;
      chrome.runtime.sendMessage({
        type: 'SELECTION_CHANGED',
        data: { text: selection, url: window.location.href }
      }).catch(() => {});
    }
  }, 300));

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'TOGGLE_CLIPPER':
        toggleClipper();
        sendResponse({ success: true });
        break;

      case 'OPEN_CLIPPER':
        openClipper();
        sendResponse({ success: true });
        break;

      case 'CLOSE_CLIPPER':
        closeClipper();
        sendResponse({ success: true });
        break;

      case 'GET_PAGE_DATA':
        sendResponse(getPageMetadata());
        break;

      case 'GET_SELECTION':
        sendResponse({ text: window.getSelection().toString().trim() });
        break;

      case 'SHOW_CLIP_NOTIFICATION':
        showClipNotification(message.data);
        break;
    }
    return true;
  });

  function showClipNotification(data) {
    const existing = document.getElementById('airtable-clip-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'airtable-clip-notification';
    notification.innerHTML = `
      <div style="position:fixed;top:20px;right:20px;z-index:2147483647;background:${data.success ? '#10B981' : '#EF4444'};color:white;padding:16px 24px;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;box-shadow:0 10px 40px rgba(0,0,0,0.3);display:flex;align-items:center;gap:12px;animation:airtableSlideIn 0.3s ease-out;">
        <span>${data.message}</span>
      </div>
      <style>@keyframes airtableSlideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}</style>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
})();
