/**
 * Airtable Web Clipper 2.0 - Injected Panel
 * Persistent clipper panel injected into web pages
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__airtableClipperPanel) return;
  window.__airtableClipperPanel = true;

  const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

  class ClipperPanel {
    constructor() {
      this.panel = null;
      this.isOpen = false;
      this.apiKey = null;
      this.bases = [];
      this.currentBase = null;
      this.currentTable = null;
      this.tableSchema = null;
      this.baseSchema = null;
      this.pageData = {};
      this.fieldValues = {};
      this.linkedRecordsCache = {};
      this.hiddenFields = {};
    }

    async init() {
      await this.loadSettings();
      this.createPanel();
      this.bindEvents();
    }

    async loadSettings() {
      return new Promise(resolve => {
        chrome.storage.sync.get(['airtableApiKey', 'quickClipBaseId', 'quickClipTableId', 'hiddenFields'], (result) => {
          this.apiKey = result.airtableApiKey;
          this.quickClipBaseId = result.quickClipBaseId;
          this.quickClipTableId = result.quickClipTableId;
          this.hiddenFields = result.hiddenFields || {};
          resolve();
        });
      });
    }

    createPanel() {
      // Create the panel container
      this.panel = document.createElement('div');
      this.panel.id = 'airtable-clipper-panel';
      this.panel.className = 'hidden';

      this.panel.innerHTML = `
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

      document.body.appendChild(this.panel);
    }

    bindEvents() {
      // Close button
      this.panel.querySelector('#clipper-close-btn').addEventListener('click', () => this.close());

      // Setup button
      this.panel.querySelector('#clipper-setup-btn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      });

      // Base select
      this.panel.querySelector('#clipper-base-select').addEventListener('change', (e) => {
        this.onBaseSelect(e.target.value);
      });

      // Table select
      this.panel.querySelector('#clipper-table-select').addEventListener('change', (e) => {
        this.onTableSelect(e.target.value);
      });

      // Submit button
      this.panel.querySelector('#clipper-submit-btn').addEventListener('click', () => this.submit());

      // Success actions
      this.panel.querySelector('#clipper-view-btn').addEventListener('click', () => this.viewRecord());
      this.panel.querySelector('#clipper-another-btn').addEventListener('click', () => this.reset());

      // Error retry
      this.panel.querySelector('#clipper-retry-btn').addEventListener('click', () => this.showMain());

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });

      // Close dropdowns when clicking outside
      this.panel.addEventListener('click', (e) => {
        if (!e.target.closest('.searchable-select') && !e.target.closest('.linked-records-field')) {
          this.panel.querySelectorAll('.select-dropdown, .linked-dropdown').forEach(el => {
            el.classList.add('hidden');
          });
        }
      });

      // Listen for messages from background
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'TOGGLE_CLIPPER') {
          this.toggle();
          sendResponse({ success: true });
        } else if (message.type === 'OPEN_CLIPPER') {
          this.open();
          sendResponse({ success: true });
        } else if (message.type === 'CLOSE_CLIPPER') {
          this.close();
          sendResponse({ success: true });
        }
        return true;
      });
    }

    async toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        await this.open();
      }
    }

    async open() {
      if (this.isOpen) return;

      await this.loadSettings();
      this.panel.classList.remove('hidden');
      this.isOpen = true;

      if (this.apiKey) {
        this.showMain();
        this.loadPageData();
        await this.loadBases();
      } else {
        this.showSetup();
      }
    }

    close() {
      if (!this.isOpen) return;

      this.panel.classList.add('closing');
      setTimeout(() => {
        this.panel.classList.add('hidden');
        this.panel.classList.remove('closing');
        this.isOpen = false;
      }, 200);
    }

    showSetup() {
      this.panel.querySelector('#clipper-setup').classList.remove('hidden');
      this.panel.querySelector('#clipper-main').classList.add('hidden');
      this.panel.querySelector('#clipper-success').classList.add('hidden');
      this.panel.querySelector('#clipper-error').classList.add('hidden');
      this.panel.querySelector('#clipper-footer').classList.add('hidden');
    }

    showMain() {
      this.panel.querySelector('#clipper-setup').classList.add('hidden');
      this.panel.querySelector('#clipper-main').classList.remove('hidden');
      this.panel.querySelector('#clipper-success').classList.add('hidden');
      this.panel.querySelector('#clipper-error').classList.add('hidden');
      this.panel.querySelector('#clipper-footer').classList.remove('hidden');
    }

    showSuccess(tableName) {
      this.panel.querySelector('#clipper-setup').classList.add('hidden');
      this.panel.querySelector('#clipper-main').classList.add('hidden');
      this.panel.querySelector('#clipper-success').classList.remove('hidden');
      this.panel.querySelector('#clipper-error').classList.add('hidden');
      this.panel.querySelector('#clipper-footer').classList.add('hidden');
      this.panel.querySelector('#clipper-success-details').textContent = `Record created in "${tableName}"`;
    }

    showError(message) {
      this.panel.querySelector('#clipper-setup').classList.add('hidden');
      this.panel.querySelector('#clipper-main').classList.add('hidden');
      this.panel.querySelector('#clipper-success').classList.add('hidden');
      this.panel.querySelector('#clipper-error').classList.remove('hidden');
      this.panel.querySelector('#clipper-footer').classList.add('hidden');
      this.panel.querySelector('#clipper-error-details').textContent = message;
    }

    showLoading(text = 'Loading...') {
      this.panel.querySelector('#clipper-loading').classList.remove('hidden');
      this.panel.querySelector('#clipper-loading-text').textContent = text;
    }

    hideLoading() {
      this.panel.querySelector('#clipper-loading').classList.add('hidden');
    }

    loadPageData() {
      const metadata = window.__airtableClipperMetadata || {};

      this.pageData = {
        url: metadata.url || window.location.href,
        title: metadata.title || document.title,
        metadata: metadata
      };

      // Update UI
      this.panel.querySelector('#clipper-page-title').textContent = this.pageData.title;
      this.panel.querySelector('#clipper-page-url').textContent = this.pageData.url;

      // Favicon
      const favicon = document.querySelector('link[rel*="icon"]');
      if (favicon?.href) {
        this.panel.querySelector('#clipper-thumbnail').innerHTML =
          `<img src="${favicon.href}" alt="Site icon" style="width:100%;height:100%;object-fit:cover;">`;
      }
    }

    async loadBases() {
      this.showLoading('Loading bases...');

      try {
        const response = await this.apiRequest(`https://api.airtable.com/v0/meta/bases`);
        this.bases = response.bases || [];

        const select = this.panel.querySelector('#clipper-base-select');
        select.innerHTML = '<option value="">Select a base...</option>';
        select.disabled = false;

        this.bases.forEach(base => {
          const option = document.createElement('option');
          option.value = base.id;
          option.textContent = base.name;
          select.appendChild(option);
        });

        // Pre-select from quick clip settings
        if (this.quickClipBaseId) {
          select.value = this.quickClipBaseId;
          await this.onBaseSelect(this.quickClipBaseId);
        }
      } catch (error) {
        console.error('Error loading bases:', error);
        this.showError('Failed to load bases. Check your API key.');
      } finally {
        this.hideLoading();
      }
    }

    async onBaseSelect(baseId) {
      const tableSelect = this.panel.querySelector('#clipper-table-select');

      if (!baseId) {
        tableSelect.disabled = true;
        tableSelect.innerHTML = '<option value="">Select a base first...</option>';
        this.panel.querySelector('#clipper-fields').innerHTML = '';
        this.panel.querySelector('#clipper-submit-btn').disabled = true;
        return;
      }

      this.currentBase = baseId;
      this.showLoading('Loading tables...');

      try {
        const response = await this.apiRequest(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`);
        this.baseSchema = response;

        tableSelect.disabled = false;
        tableSelect.innerHTML = '<option value="">Select a table...</option>';

        response.tables.forEach(table => {
          const option = document.createElement('option');
          option.value = table.id;
          option.textContent = table.name;
          tableSelect.appendChild(option);
        });

        // Pre-select from quick clip settings
        if (this.quickClipTableId && baseId === this.quickClipBaseId) {
          tableSelect.value = this.quickClipTableId;
          await this.onTableSelect(this.quickClipTableId);
        }
      } catch (error) {
        console.error('Error loading tables:', error);
      } finally {
        this.hideLoading();
      }
    }

    async onTableSelect(tableId) {
      if (!tableId) {
        this.panel.querySelector('#clipper-fields').innerHTML = '';
        this.panel.querySelector('#clipper-submit-btn').disabled = true;
        return;
      }

      this.currentTable = tableId;
      this.tableSchema = this.baseSchema.tables.find(t => t.id === tableId);
      this.fieldValues = {};
      this.linkedRecordsCache = {};

      if (this.tableSchema) {
        this.renderFields(this.tableSchema.fields);
        this.panel.querySelector('#clipper-submit-btn').disabled = false;
      }
    }

    renderFields(fields) {
      const container = this.panel.querySelector('#clipper-fields');
      container.innerHTML = '';

      const nonEditableTypes = ['autoNumber', 'createdTime', 'lastModifiedTime',
                                'createdBy', 'lastModifiedBy', 'count',
                                'lookup', 'rollup', 'formula', 'button'];

      // Get hidden fields for current table
      const tableKey = `${this.currentBase}_${this.currentTable}`;
      const hiddenFieldIds = this.hiddenFields[tableKey] || [];

      const editableFields = fields.filter(field => {
        if (nonEditableTypes.includes(field.type)) return false;
        if (hiddenFieldIds.includes(field.id)) return false;
        return true;
      });

      editableFields.forEach(field => {
        const fieldElement = this.createFieldInput(field);
        container.appendChild(fieldElement);
      });

      this.autoPopulateFields(editableFields);
    }

    createFieldInput(field) {
      const div = document.createElement('div');
      div.className = 'field-item';
      div.dataset.fieldId = field.id;

      const label = document.createElement('div');
      label.className = 'field-label';
      label.innerHTML = `<span>${field.name}</span><span class="field-type-badge">${this.getFieldTypeBadge(field.type)}</span>`;
      div.appendChild(label);

      const input = this.createInputForType(field);
      div.appendChild(input);

      return div;
    }

    getFieldTypeBadge(type) {
      const badges = {
        'singleLineText': 'TEXT', 'multilineText': 'LONG', 'email': 'EMAIL',
        'url': 'URL', 'phoneNumber': 'PHONE', 'number': 'NUM', 'currency': '$',
        'percent': '%', 'date': 'DATE', 'dateTime': 'DATE', 'checkbox': 'CHECK',
        'singleSelect': 'SELECT', 'multipleSelects': 'MULTI', 'multipleRecordLinks': 'LINK',
        'rating': 'RATE', 'richText': 'RICH', 'multipleAttachments': 'FILE', 'barcode': 'CODE'
      };
      return badges[type] || type.substring(0, 4).toUpperCase();
    }

    createInputForType(field) {
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
            this.fieldValues[field.id] = e.target.value || undefined;
          });
          break;

        case 'multilineText':
        case 'richText':
          wrapper.innerHTML = `<textarea class="textarea" id="field-${field.id}" placeholder="Enter ${field.name.toLowerCase()}" rows="2"></textarea>`;
          wrapper.querySelector('textarea').addEventListener('input', (e) => {
            this.fieldValues[field.id] = e.target.value || undefined;
          });
          break;

        case 'number':
        case 'currency':
        case 'percent':
        case 'duration':
          wrapper.innerHTML = `<input type="number" class="input" id="field-${field.id}" step="any" placeholder="0">`;
          wrapper.querySelector('input').addEventListener('input', (e) => {
            this.fieldValues[field.id] = e.target.value ? parseFloat(e.target.value) : undefined;
          });
          break;

        case 'date':
          wrapper.innerHTML = `<input type="date" class="input" id="field-${field.id}">`;
          wrapper.querySelector('input').addEventListener('change', (e) => {
            this.fieldValues[field.id] = e.target.value || undefined;
          });
          break;

        case 'dateTime':
          wrapper.innerHTML = `<input type="datetime-local" class="input" id="field-${field.id}">`;
          wrapper.querySelector('input').addEventListener('change', (e) => {
            this.fieldValues[field.id] = e.target.value ? new Date(e.target.value).toISOString() : undefined;
          });
          break;

        case 'checkbox':
          wrapper.innerHTML = `<div class="checkbox-wrapper"><input type="checkbox" class="checkbox" id="field-${field.id}"><label for="field-${field.id}">Yes</label></div>`;
          wrapper.querySelector('input').addEventListener('change', (e) => {
            this.fieldValues[field.id] = e.target.checked;
          });
          break;

        case 'singleSelect':
          wrapper.appendChild(this.createSearchableSelect(field, false));
          break;

        case 'multipleSelects':
          wrapper.appendChild(this.createSearchableSelect(field, true));
          break;

        case 'rating':
          const maxRating = field.options?.max || 5;
          wrapper.innerHTML = `<div class="rating-container" id="field-${field.id}">${Array.from({length: maxRating}, (_, i) =>
            `<button type="button" class="rating-star" data-value="${i + 1}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>`
          ).join('')}</div>`;
          wrapper.querySelectorAll('.rating-star').forEach(star => {
            star.addEventListener('click', () => {
              const value = parseInt(star.dataset.value);
              this.fieldValues[field.id] = value;
              this.updateRatingUI(field.id, value);
            });
          });
          break;

        case 'multipleRecordLinks':
          wrapper.appendChild(this.createLinkedRecordField(field));
          break;

        case 'multipleAttachments':
          wrapper.innerHTML = `<div class="attachment-container" id="field-${field.id}"><div class="attachment-list"></div><button type="button" class="add-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Add URL</button></div>`;
          this.fieldValues[field.id] = [];
          wrapper.querySelector('.add-btn').addEventListener('click', () => {
            const url = prompt('Enter attachment URL:');
            if (url) this.addAttachment(field.id, url);
          });
          break;

        default:
          wrapper.innerHTML = `<input type="text" class="input" id="field-${field.id}" placeholder="Enter ${field.name.toLowerCase()}">`;
          wrapper.querySelector('input').addEventListener('input', (e) => {
            this.fieldValues[field.id] = e.target.value || undefined;
          });
      }

      return wrapper;
    }

    createSearchableSelect(field, isMultiple) {
      const container = document.createElement('div');
      container.className = 'searchable-select';
      container.id = `field-${field.id}`;

      const options = field.options?.choices || [];
      if (isMultiple) this.fieldValues[field.id] = [];

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
      const tagsContainer = container.querySelector('.select-tags');

      const renderOptions = (filter = '') => {
        const filterLower = filter.toLowerCase();
        const filtered = options.filter(opt => opt.name.toLowerCase().includes(filterLower));

        optionsContainer.innerHTML = filtered.map(opt =>
          `<div class="select-option" data-value="${opt.name}"><span class="option-color" style="background:${this.getSelectColor(opt.color)}"></span>${opt.name}</div>`
        ).join('');

        optionsContainer.querySelectorAll('.select-option').forEach(el => {
          el.addEventListener('click', () => this.selectOption(field, el.dataset.value, isMultiple, container));
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
          if (value) this.selectOption(field, value, isMultiple, container);
        } else if (e.key === 'Escape') {
          dropdown.classList.add('hidden');
          input.blur();
        }
      });

      createOption.addEventListener('click', () => {
        const value = input.value.trim();
        if (value) this.selectOption(field, value, isMultiple, container);
      });

      return container;
    }

    getSelectColor(colorName) {
      const colors = {
        'blueLight2': '#D0F0FD', 'cyanLight2': '#C2F5E9', 'tealLight2': '#C2F5E9',
        'greenLight2': '#D1F7C4', 'yellowLight2': '#FFEAB6', 'orangeLight2': '#FEE2D5',
        'redLight2': '#FFDCE5', 'pinkLight2': '#FFDAF6', 'purpleLight2': '#EDE2FE', 'grayLight2': '#E5E5E5'
      };
      return colors[colorName] || colorName || '#E5E7EB';
    }

    selectOption(field, value, isMultiple, container) {
      const input = container.querySelector('.select-input');
      const dropdown = container.querySelector('.select-dropdown');
      const tagsContainer = container.querySelector('.select-tags');

      if (isMultiple) {
        if (this.fieldValues[field.id]?.includes(value)) {
          input.value = '';
          dropdown.classList.add('hidden');
          return;
        }
        if (!this.fieldValues[field.id]) this.fieldValues[field.id] = [];
        this.fieldValues[field.id].push(value);

        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.innerHTML = `${value}<button type="button" class="tag-remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
        tag.querySelector('.tag-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          this.fieldValues[field.id] = this.fieldValues[field.id].filter(v => v !== value);
          tag.remove();
        });
        tagsContainer.appendChild(tag);
      } else {
        this.fieldValues[field.id] = value;
        tagsContainer.innerHTML = `<span class="tag single">${value}<button type="button" class="tag-remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button></span>`;
        tagsContainer.querySelector('.tag-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          this.fieldValues[field.id] = undefined;
          tagsContainer.innerHTML = '';
          input.classList.remove('hidden');
        });
        input.classList.add('hidden');
      }

      input.value = '';
      dropdown.classList.add('hidden');
    }

    createLinkedRecordField(field) {
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

      this.fieldValues[field.id] = [];

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
          if (!this.linkedRecordsCache[linkedTableId]) {
            const result = await this.apiRequest(`${AIRTABLE_API_BASE}/${this.currentBase}/${linkedTableId}?maxRecords=100`);
            this.linkedRecordsCache[linkedTableId] = result.records || [];
          }

          const records = this.linkedRecordsCache[linkedTableId];
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
              this.addLinkedRecord(field.id, { id: el.dataset.id, name: el.dataset.name }, container);
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

    addLinkedRecord(fieldId, record, container) {
      if (!this.fieldValues[fieldId]) this.fieldValues[fieldId] = [];
      if (this.fieldValues[fieldId].find(r => r.id === record.id)) return;

      this.fieldValues[fieldId].push({ id: record.id });

      const itemsDiv = container.querySelector('.linked-items');
      const item = document.createElement('div');
      item.className = 'linked-record-item';
      item.innerHTML = `<span>${record.name}</span><button type="button" class="linked-record-remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

      item.querySelector('.linked-record-remove').addEventListener('click', () => {
        this.fieldValues[fieldId] = this.fieldValues[fieldId].filter(r => r.id !== record.id);
        item.remove();
      });

      itemsDiv.appendChild(item);
    }

    updateRatingUI(fieldId, value) {
      const container = this.panel.querySelector(`#field-${fieldId}`);
      container.querySelectorAll('.rating-star').forEach(star => {
        const starValue = parseInt(star.dataset.value);
        star.classList.toggle('active', starValue <= value);
      });
    }

    addAttachment(fieldId, url) {
      if (!this.fieldValues[fieldId]) this.fieldValues[fieldId] = [];
      this.fieldValues[fieldId].push({ url });

      const container = this.panel.querySelector(`#field-${fieldId}`);
      const list = container.querySelector('.attachment-list');

      const item = document.createElement('div');
      item.className = 'linked-record-item';
      item.innerHTML = `<span>${url.substring(0, 30)}${url.length > 30 ? '...' : ''}</span><button type="button" class="linked-record-remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

      item.querySelector('.linked-record-remove').addEventListener('click', () => {
        this.fieldValues[fieldId] = this.fieldValues[fieldId].filter(a => a.url !== url);
        item.remove();
      });

      list.appendChild(item);
    }

    autoPopulateFields(fields) {
      fields.forEach(field => {
        const fieldName = field.name.toLowerCase();
        const inputElement = this.panel.querySelector(`#field-${field.id}`);
        if (!inputElement) return;

        const input = inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA'
          ? inputElement : inputElement.querySelector('input, textarea');

        // URL/Link fields
        if (field.type === 'url' || fieldName === 'link' || fieldName === 'url' || fieldName === 'source') {
          if (input) {
            input.value = this.pageData.url || '';
            this.fieldValues[field.id] = this.pageData.url;
          }
        }

        // Title fields
        if (fieldName.includes('title') || fieldName === 'name') {
          if (field.type === 'singleLineText' || field.type === 'multilineText') {
            const title = this.pageData.metadata?.title || this.pageData.title || '';
            if (input) {
              input.value = title;
              this.fieldValues[field.id] = title;
            }
          }
        }

        // Author fields
        if (fieldName.includes('author') || fieldName === 'by' || fieldName === 'creator') {
          if (field.type === 'singleLineText') {
            const author = this.pageData.metadata?.author || '';
            if (input && author) {
              input.value = author;
              this.fieldValues[field.id] = author;
            }
          }
        }

        // Date Published fields
        if (fieldName.includes('publish') || fieldName.includes('posted') || fieldName === 'date published') {
          if (field.type === 'date' || field.type === 'dateTime') {
            const publishedDate = this.pageData.metadata?.publishedDate;
            if (publishedDate && input) {
              try {
                const date = new Date(publishedDate);
                if (!isNaN(date.getTime())) {
                  if (field.type === 'date') {
                    input.value = date.toISOString().split('T')[0];
                    this.fieldValues[field.id] = date.toISOString().split('T')[0];
                  } else {
                    input.value = date.toISOString().slice(0, 16);
                    this.fieldValues[field.id] = date.toISOString();
                  }
                }
              } catch (e) {}
            }
          }
        }

        // Clipped date - default to today
        if (fieldName.includes('clipped') || fieldName.includes('created') || fieldName.includes('added')) {
          if ((field.type === 'date' || field.type === 'dateTime') && !this.fieldValues[field.id]) {
            const now = new Date();
            if (input) {
              if (field.type === 'date') {
                input.value = now.toISOString().split('T')[0];
                this.fieldValues[field.id] = now.toISOString().split('T')[0];
              } else {
                input.value = now.toISOString().slice(0, 16);
                this.fieldValues[field.id] = now.toISOString();
              }
            }
          }
        }
      });
    }

    async submit() {
      if (!this.currentBase || !this.currentTable) {
        alert('Please select a base and table first.');
        return;
      }

      this.showLoading('Clipping to Airtable...');

      try {
        const fields = {};

        for (const [fieldId, value] of Object.entries(this.fieldValues)) {
          if (value !== undefined && value !== '' && value !== null) {
            if (Array.isArray(value) && value.length === 0) continue;

            const fieldSchema = this.tableSchema.fields.find(f => f.id === fieldId);
            if (fieldSchema) {
              if (fieldSchema.type === 'multipleSelects' && Array.isArray(value)) {
                fields[fieldSchema.name] = value.map(v => ({ name: v }));
              } else if (fieldSchema.type === 'singleSelect' && typeof value === 'string') {
                fields[fieldSchema.name] = { name: value };
              } else {
                fields[fieldSchema.name] = value;
              }
            }
          }
        }

        const result = await this.apiRequest(`${AIRTABLE_API_BASE}/${this.currentBase}/${this.currentTable}`, {
          method: 'POST',
          body: JSON.stringify({ fields, typecast: true })
        });

        this.createdRecordId = result.id;
        this.hideLoading();
        this.showSuccess(this.tableSchema.name);

      } catch (error) {
        console.error('Error clipping:', error);
        this.hideLoading();
        this.showError(error.message || 'Failed to create record');
      }
    }

    viewRecord() {
      if (this.createdRecordId && this.currentBase && this.currentTable) {
        const url = `https://airtable.com/${this.currentBase}/${this.currentTable}/${this.createdRecordId}`;
        window.open(url, '_blank');
      }
    }

    reset() {
      this.fieldValues = {};
      this.createdRecordId = null;
      this.showMain();

      if (this.tableSchema) {
        this.renderFields(this.tableSchema.fields);
      }

      this.loadPageData();
    }

    async apiRequest(url, options = {}) {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
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
  }

  // Initialize the clipper panel
  const clipper = new ClipperPanel();
  clipper.init();

  // Expose toggle function for content script
  window.__airtableClipperToggle = () => clipper.toggle();
  window.__airtableClipperOpen = () => clipper.open();
  window.__airtableClipperClose = () => clipper.close();
})();
