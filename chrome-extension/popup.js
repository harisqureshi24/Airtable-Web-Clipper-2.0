/**
 * Airtable Web Clipper 2.0 - Popup Script
 * Enhanced with searchable dropdowns, linked records, and better auto-fill
 */

class AirtableWebClipper {
  constructor() {
    this.api = null;
    this.currentBase = null;
    this.currentTable = null;
    this.tableSchema = null;
    this.baseSchema = null;
    this.pageData = {};
    this.fieldValues = {};
    this.selectedText = '';
    this.createdRecordId = null;
    this.linkedRecordsCache = {};

    this.init();
  }

  async init() {
    this.api = new AirtableAPI();
    this.bindEvents();

    const isConfigured = await this.api.isConfigured();

    if (isConfigured) {
      this.showMainContent();
      await this.loadPageData();
      await this.loadBases();
    } else {
      this.showSetupRequired();
    }
  }

  bindEvents() {
    document.getElementById('settingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('setupBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('baseSelect').addEventListener('change', (e) => {
      this.onBaseSelect(e.target.value);
    });

    document.getElementById('tableSelect').addEventListener('change', (e) => {
      this.onTableSelect(e.target.value);
    });

    document.getElementById('clipBtn').addEventListener('click', () => {
      this.clipToAirtable();
    });

    document.getElementById('clearSelection')?.addEventListener('click', () => {
      this.clearSelection();
    });

    document.getElementById('viewRecordBtn')?.addEventListener('click', () => {
      this.viewRecord();
    });

    document.getElementById('clipAnotherBtn')?.addEventListener('click', () => {
      this.resetForNewClip();
    });

    document.getElementById('retryBtn')?.addEventListener('click', () => {
      this.showMainContent();
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SELECTION_CHANGED') {
        this.handleSelectionChange(message.data);
      }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.searchable-select') && !e.target.closest('.linked-records-field')) {
        document.querySelectorAll('.select-dropdown, .linked-dropdown').forEach(el => {
          el.classList.add('hidden');
        });
      }
    });
  }

  showSetupRequired() {
    document.getElementById('setupRequired').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('successMessage').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
  }

  showMainContent() {
    document.getElementById('setupRequired').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('successMessage').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
  }

  showSuccess(recordId, tableName) {
    this.createdRecordId = recordId;
    document.getElementById('setupRequired').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('successMessage').classList.remove('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
    document.getElementById('successDetails').textContent = `Record created in "${tableName}"`;
  }

  showError(message) {
    document.getElementById('setupRequired').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('successMessage').classList.add('hidden');
    document.getElementById('errorMessage').classList.remove('hidden');
    document.getElementById('errorDetails').textContent = message;
  }

  showLoading(text = 'Loading...') {
    document.getElementById('loadingOverlay').classList.remove('hidden');
    document.getElementById('loadingText').textContent = text;
  }

  hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }

  async loadPageData() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab) {
        // Try to get comprehensive data from content script
        try {
          const results = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_DATA' });
          this.pageData = results || {};
        } catch (e) {
          this.pageData = {
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            metadata: {}
          };
        }

        // Fallbacks
        if (!this.pageData.url) this.pageData.url = tab.url;
        if (!this.pageData.title) this.pageData.title = tab.title;
        if (!this.pageData.favIconUrl) this.pageData.favIconUrl = tab.favIconUrl;

        // Update UI with page info
        const title = this.pageData.metadata?.title || this.pageData.title || '';
        document.getElementById('pageTitle').value = title;
        document.getElementById('pageUrl').value = this.pageData.url || '';

        if (this.pageData.favIconUrl) {
          const thumbnail = document.getElementById('pageThumbnail');
          thumbnail.innerHTML = `<img src="${this.pageData.favIconUrl}" alt="Site icon">`;
        }

        // Get selected text
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => window.getSelection().toString()
          });
          if (results?.[0]?.result) {
            this.selectedText = results[0].result;
            this.updateSelectionUI();
          }
        } catch (e) {
          console.log('Could not get selection:', e);
        }
      }
    } catch (error) {
      console.error('Error loading page data:', error);
    }
  }

  async loadBases() {
    this.showLoading('Loading bases...');

    try {
      const bases = await this.api.listBases();
      const baseSelect = document.getElementById('baseSelect');

      baseSelect.innerHTML = '<option value="">Select a base...</option>';
      bases.forEach(base => {
        const option = document.createElement('option');
        option.value = base.id;
        option.textContent = base.name;
        baseSelect.appendChild(option);
      });

      // Use quick clip settings first, then fall back to last used
      const settings = await chrome.storage.sync.get(['quickClipBaseId', 'quickClipTableId']);
      let baseToSelect = settings.quickClipBaseId || await this.api.getLastUsedBase();
      let tableToSelect = settings.quickClipTableId;

      if (!tableToSelect && baseToSelect) {
        tableToSelect = await this.api.getLastUsedTable(baseToSelect);
      }

      if (baseToSelect) {
        baseSelect.value = baseToSelect;
        await this.onBaseSelect(baseToSelect, tableToSelect);
      }
    } catch (error) {
      console.error('Error loading bases:', error);
      this.showError('Failed to load Airtable bases. Please check your API key.');
    } finally {
      this.hideLoading();
    }
  }

  async onBaseSelect(baseId, preSelectTableId = null) {
    if (!baseId) {
      document.getElementById('tableSelect').disabled = true;
      document.getElementById('tableSelect').innerHTML = '<option value="">Select a table...</option>';
      document.getElementById('fieldsContainer').innerHTML = '';
      document.getElementById('clipBtn').disabled = true;
      return;
    }

    this.currentBase = baseId;
    await this.api.setLastUsedBase(baseId);
    this.showLoading('Loading tables...');

    try {
      const schema = await this.api.getBaseSchema(baseId);
      const tableSelect = document.getElementById('tableSelect');

      tableSelect.disabled = false;
      tableSelect.innerHTML = '<option value="">Select a table...</option>';

      schema.tables.forEach(table => {
        const option = document.createElement('option');
        option.value = table.id;
        option.textContent = table.name;
        tableSelect.appendChild(option);
      });

      this.baseSchema = schema;

      // Pre-select table
      const tableToSelect = preSelectTableId || await this.api.getLastUsedTable(baseId);
      if (tableToSelect) {
        tableSelect.value = tableToSelect;
        await this.onTableSelect(tableToSelect);
      }
    } catch (error) {
      console.error('Error loading tables:', error);
      this.showError('Failed to load tables.');
    } finally {
      this.hideLoading();
    }
  }

  async onTableSelect(tableId) {
    if (!tableId) {
      document.getElementById('fieldsContainer').innerHTML = '';
      document.getElementById('clipBtn').disabled = true;
      return;
    }

    this.currentTable = tableId;
    await this.api.setLastUsedTable(this.currentBase, tableId);

    const table = this.baseSchema.tables.find(t => t.id === tableId);
    if (!table) return;

    this.tableSchema = table;
    this.fieldValues = {};
    this.linkedRecordsCache = {};

    this.renderFields(table.fields);
    document.getElementById('clipBtn').disabled = false;
  }

  renderFields(fields) {
    const container = document.getElementById('fieldsContainer');
    container.innerHTML = '';

    const editableFields = fields.filter(field => {
      const nonEditableTypes = ['autoNumber', 'createdTime', 'lastModifiedTime',
                                'createdBy', 'lastModifiedBy', 'count',
                                'lookup', 'rollup', 'formula', 'button'];
      return !nonEditableTypes.includes(field.type);
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
    label.innerHTML = `
      <span>${field.name}</span>
      <span class="field-type-badge">${this.getFieldTypeBadge(field.type)}</span>
    `;
    div.appendChild(label);

    const input = this.createInputForFieldType(field);
    div.appendChild(input);

    return div;
  }

  getFieldTypeBadge(type) {
    const badges = {
      'singleLineText': 'TEXT', 'multilineText': 'LONG TEXT', 'email': 'EMAIL',
      'url': 'URL', 'phoneNumber': 'PHONE', 'number': 'NUMBER', 'currency': 'CURRENCY',
      'percent': 'PERCENT', 'date': 'DATE', 'dateTime': 'DATE/TIME', 'checkbox': 'CHECKBOX',
      'singleSelect': 'SELECT', 'multipleSelects': 'MULTI-SELECT', 'multipleRecordLinks': 'LINKED',
      'rating': 'RATING', 'richText': 'RICH TEXT', 'multipleAttachments': 'ATTACHMENTS',
      'barcode': 'BARCODE', 'duration': 'DURATION'
    };
    return badges[type] || type.toUpperCase();
  }

  createInputForFieldType(field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field-input-wrapper';

    switch (field.type) {
      case 'singleLineText':
      case 'email':
      case 'url':
      case 'phoneNumber':
      case 'barcode':
        wrapper.innerHTML = `<input type="${field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}" class="input" id="field-${field.id}" placeholder="Enter ${field.name.toLowerCase()}">`;
        wrapper.querySelector('input').addEventListener('input', (e) => {
          this.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'multilineText':
      case 'richText':
        wrapper.innerHTML = `<textarea class="textarea" id="field-${field.id}" placeholder="Enter ${field.name.toLowerCase()}" rows="3"></textarea>`;
        wrapper.querySelector('textarea').addEventListener('input', (e) => {
          this.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'number':
      case 'currency':
      case 'percent':
      case 'duration':
        wrapper.innerHTML = `<input type="number" class="input" id="field-${field.id}" step="${field.type === 'percent' ? '0.01' : 'any'}" placeholder="Enter ${field.name.toLowerCase()}">`;
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
        wrapper.innerHTML = `<div class="rating-container" id="field-${field.id}">${Array.from({length: maxRating}, (_, i) => `<button type="button" class="rating-star" data-value="${i + 1}"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>`).join('')}</div>`;
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
        wrapper.innerHTML = `<div class="attachment-container" id="field-${field.id}"><div class="attachment-list"></div><button type="button" class="add-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Add attachment URL</button></div>`;
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
      <input type="text" class="select-input" placeholder="Type to search or create...">
      <div class="select-dropdown hidden">
        <div class="select-options"></div>
        <div class="select-create hidden"><span class="create-icon">+</span> Create "<span class="create-value"></span>"</div>
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
        `<div class="select-option" data-value="${opt.name}"><span class="option-color" style="background: ${this.getSelectColor(opt.color)}"></span>${opt.name}</div>`
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
        <input type="text" class="linked-search-input" placeholder="Search records to link...">
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
          const result = await this.api.listRecords(this.currentBase, linkedTableId, 100);
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
        console.error('Error loading linked records:', error);
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
    const container = document.getElementById(`field-${fieldId}`);
    container.querySelectorAll('.rating-star').forEach(star => {
      const starValue = parseInt(star.dataset.value);
      star.classList.toggle('active', starValue <= value);
    });
  }

  addAttachment(fieldId, url) {
    if (!this.fieldValues[fieldId]) this.fieldValues[fieldId] = [];
    this.fieldValues[fieldId].push({ url });

    const container = document.getElementById(`field-${fieldId}`);
    const list = container.querySelector('.attachment-list');

    const item = document.createElement('div');
    item.className = 'linked-record-item';
    item.innerHTML = `<span>${url.substring(0, 35)}${url.length > 35 ? '...' : ''}</span><button type="button" class="linked-record-remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

    item.querySelector('.linked-record-remove').addEventListener('click', () => {
      this.fieldValues[fieldId] = this.fieldValues[fieldId].filter(a => a.url !== url);
      item.remove();
    });

    list.appendChild(item);
  }

  autoPopulateFields(fields) {
    fields.forEach(field => {
      const fieldName = field.name.toLowerCase();
      const inputElement = document.getElementById(`field-${field.id}`);
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

      // Notes/content fields
      if (this.selectedText && (fieldName.includes('note') || fieldName.includes('content') ||
          fieldName.includes('description') || fieldName.includes('excerpt'))) {
        if (field.type === 'multilineText' || field.type === 'richText') {
          if (input) {
            input.value = this.selectedText;
            this.fieldValues[field.id] = this.selectedText;
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

      // Clipped/Created date - default to today
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

  handleSelectionChange(data) {
    this.selectedText = data.text;
    this.updateSelectionUI();
  }

  updateSelectionUI() {
    const selectionInfo = document.getElementById('selectionInfo');
    const selectionText = document.getElementById('selectionText');

    if (this.selectedText) {
      selectionInfo?.classList.remove('hidden');
      const truncated = this.selectedText.length > 50 ? this.selectedText.substring(0, 50) + '...' : this.selectedText;
      if (selectionText) selectionText.textContent = `"${truncated}"`;
    } else {
      selectionInfo?.classList.add('hidden');
    }
  }

  clearSelection() {
    this.selectedText = '';
    this.updateSelectionUI();
  }

  async clipToAirtable() {
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

      const result = await this.api.createRecord(this.currentBase, this.currentTable, fields);

      this.hideLoading();
      this.showSuccess(result.id, this.tableSchema.name);

      // Show notification on page
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_CLIP_NOTIFICATION',
            data: { success: true, message: 'Clipped to Airtable!' }
          });
        }
      } catch (e) {}

    } catch (error) {
      console.error('Error clipping to Airtable:', error);
      this.hideLoading();
      this.showError(error.message || 'Failed to create record. Please try again.');
    }
  }

  viewRecord() {
    if (this.createdRecordId && this.currentBase && this.currentTable) {
      const url = `https://airtable.com/${this.currentBase}/${this.currentTable}/${this.createdRecordId}`;
      chrome.tabs.create({ url });
    }
  }

  resetForNewClip() {
    this.fieldValues = {};
    this.createdRecordId = null;
    this.showMainContent();

    if (this.tableSchema) {
      this.renderFields(this.tableSchema.fields);
    }

    this.loadPageData();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AirtableWebClipper();
});
