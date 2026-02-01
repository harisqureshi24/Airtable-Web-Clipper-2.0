/**
 * Airtable Web Clipper 2.0 - Popup Script
 * Handles the main clipper UI and interactions
 */

class AirtableWebClipper {
  constructor() {
    this.api = null;
    this.currentBase = null;
    this.currentTable = null;
    this.tableSchema = null;
    this.pageData = {};
    this.fieldValues = {};
    this.selectedText = '';
    this.createdRecordId = null;

    this.init();
  }

  async init() {
    // Initialize API helper
    this.api = new AirtableAPI();

    // Bind event listeners
    this.bindEvents();

    // Check if configured
    const isConfigured = await this.api.isConfigured();

    if (isConfigured) {
      this.showMainContent();
      await this.loadBases();
      await this.loadPageData();
    } else {
      this.showSetupRequired();
    }
  }

  bindEvents() {
    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Setup button
    document.getElementById('setupBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Base selection
    document.getElementById('baseSelect').addEventListener('change', (e) => {
      this.onBaseSelect(e.target.value);
    });

    // Table selection
    document.getElementById('tableSelect').addEventListener('change', (e) => {
      this.onTableSelect(e.target.value);
    });

    // Clip button
    document.getElementById('clipBtn').addEventListener('click', () => {
      this.clipToAirtable();
    });

    // Clear selection
    document.getElementById('clearSelection')?.addEventListener('click', () => {
      this.clearSelection();
    });

    // Success actions
    document.getElementById('viewRecordBtn')?.addEventListener('click', () => {
      this.viewRecord();
    });

    document.getElementById('clipAnotherBtn')?.addEventListener('click', () => {
      this.resetForNewClip();
    });

    // Retry button
    document.getElementById('retryBtn')?.addEventListener('click', () => {
      this.showMainContent();
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SELECTION_CHANGED') {
        this.handleSelectionChange(message.data);
      }
    });
  }

  // UI State Management
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
    document.getElementById('successDetails').textContent =
      `Record created in "${tableName}"`;
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

  // Data Loading
  async loadPageData() {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab) {
        this.pageData = {
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl
        };

        // Update UI
        document.getElementById('pageTitle').value = tab.title || '';
        document.getElementById('pageUrl').value = tab.url || '';

        // Set favicon if available
        if (tab.favIconUrl) {
          const thumbnail = document.getElementById('pageThumbnail');
          thumbnail.innerHTML = `<img src="${tab.favIconUrl}" alt="Site icon">`;
        }

        // Try to get selected text from page
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => window.getSelection().toString()
          });

          if (results && results[0] && results[0].result) {
            this.selectedText = results[0].result;
            this.updateSelectionUI();
          }
        } catch (e) {
          // Content script may not be available
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

      // Clear existing options
      baseSelect.innerHTML = '<option value="">Select a base...</option>';

      // Add bases
      bases.forEach(base => {
        const option = document.createElement('option');
        option.value = base.id;
        option.textContent = base.name;
        baseSelect.appendChild(option);
      });

      // Try to restore last used base
      const lastBaseId = await this.api.getLastUsedBase();
      if (lastBaseId) {
        baseSelect.value = lastBaseId;
        await this.onBaseSelect(lastBaseId);
      }
    } catch (error) {
      console.error('Error loading bases:', error);
      this.showError('Failed to load Airtable bases. Please check your API key.');
    } finally {
      this.hideLoading();
    }
  }

  async onBaseSelect(baseId) {
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

      // Store schema for later use
      this.baseSchema = schema;

      // Try to restore last used table
      const lastTableId = await this.api.getLastUsedTable(baseId);
      if (lastTableId) {
        tableSelect.value = lastTableId;
        await this.onTableSelect(lastTableId);
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

    // Find table in schema
    const table = this.baseSchema.tables.find(t => t.id === tableId);
    if (!table) return;

    this.tableSchema = table;
    this.fieldValues = {};

    // Render fields
    this.renderFields(table.fields);

    // Enable clip button
    document.getElementById('clipBtn').disabled = false;
  }

  renderFields(fields) {
    const container = document.getElementById('fieldsContainer');
    container.innerHTML = '';

    // Filter out computed fields
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

    // Auto-populate common fields
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
      'singleLineText': 'TEXT',
      'multilineText': 'LONG TEXT',
      'email': 'EMAIL',
      'url': 'URL',
      'phoneNumber': 'PHONE',
      'number': 'NUMBER',
      'currency': 'CURRENCY',
      'percent': 'PERCENT',
      'date': 'DATE',
      'dateTime': 'DATE/TIME',
      'checkbox': 'CHECKBOX',
      'singleSelect': 'SELECT',
      'multipleSelects': 'MULTI-SELECT',
      'multipleRecordLinks': 'LINKED',
      'rating': 'RATING',
      'richText': 'RICH TEXT',
      'multipleAttachments': 'ATTACHMENTS',
      'barcode': 'BARCODE',
      'duration': 'DURATION'
    };
    return badges[type] || type.toUpperCase();
  }

  createInputForFieldType(field) {
    const wrapper = document.createElement('div');

    switch (field.type) {
      case 'singleLineText':
      case 'email':
      case 'url':
      case 'phoneNumber':
      case 'barcode':
        wrapper.innerHTML = `
          <input type="${field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}"
                 class="input"
                 id="field-${field.id}"
                 placeholder="Enter ${field.name.toLowerCase()}">
        `;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          this.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'multilineText':
      case 'richText':
        wrapper.innerHTML = `
          <textarea class="textarea"
                    id="field-${field.id}"
                    placeholder="Enter ${field.name.toLowerCase()}"
                    rows="3"></textarea>
        `;
        wrapper.querySelector('textarea').addEventListener('change', (e) => {
          this.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'number':
      case 'currency':
      case 'percent':
      case 'duration':
        wrapper.innerHTML = `
          <input type="number"
                 class="input"
                 id="field-${field.id}"
                 step="${field.type === 'percent' ? '0.01' : 'any'}"
                 placeholder="Enter ${field.name.toLowerCase()}">
        `;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          const value = e.target.value ? parseFloat(e.target.value) : undefined;
          this.fieldValues[field.id] = value;
        });
        break;

      case 'date':
        wrapper.innerHTML = `
          <input type="date"
                 class="input"
                 id="field-${field.id}">
        `;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          this.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'dateTime':
        wrapper.innerHTML = `
          <input type="datetime-local"
                 class="input"
                 id="field-${field.id}">
        `;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          if (e.target.value) {
            this.fieldValues[field.id] = new Date(e.target.value).toISOString();
          } else {
            this.fieldValues[field.id] = undefined;
          }
        });
        break;

      case 'checkbox':
        wrapper.innerHTML = `
          <div class="checkbox-wrapper">
            <input type="checkbox"
                   class="checkbox"
                   id="field-${field.id}">
            <label for="field-${field.id}">Yes</label>
          </div>
        `;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          this.fieldValues[field.id] = e.target.checked;
        });
        break;

      case 'singleSelect':
        const options = field.options?.choices || [];
        wrapper.innerHTML = `
          <select class="select" id="field-${field.id}">
            <option value="">Select ${field.name.toLowerCase()}...</option>
            ${options.map(opt => `<option value="${opt.name}">${opt.name}</option>`).join('')}
          </select>
        `;
        wrapper.querySelector('select').addEventListener('change', (e) => {
          this.fieldValues[field.id] = e.target.value || undefined;
        });
        break;

      case 'multipleSelects':
        const multiOptions = field.options?.choices || [];
        wrapper.innerHTML = `
          <div class="tags-container" id="field-${field.id}">
            <input type="text"
                   class="tags-input"
                   placeholder="Type to add..."
                   list="list-${field.id}">
            <datalist id="list-${field.id}">
              ${multiOptions.map(opt => `<option value="${opt.name}">`).join('')}
            </datalist>
          </div>
        `;
        this.fieldValues[field.id] = [];
        const tagsInput = wrapper.querySelector('.tags-input');
        tagsInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.value) {
            e.preventDefault();
            this.addTag(field.id, e.target.value);
            e.target.value = '';
          }
        });
        tagsInput.addEventListener('change', (e) => {
          if (e.target.value) {
            this.addTag(field.id, e.target.value);
            e.target.value = '';
          }
        });
        break;

      case 'rating':
        const maxRating = field.options?.max || 5;
        wrapper.innerHTML = `
          <div class="rating-container" id="field-${field.id}">
            ${Array.from({length: maxRating}, (_, i) => `
              <button type="button" class="rating-star" data-value="${i + 1}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            `).join('')}
          </div>
        `;
        wrapper.querySelectorAll('.rating-star').forEach(star => {
          star.addEventListener('click', (e) => {
            const value = parseInt(star.dataset.value);
            this.fieldValues[field.id] = value;
            this.updateRatingUI(field.id, value);
          });
        });
        break;

      case 'multipleRecordLinks':
        const linkedTableId = field.options?.linkedTableId;
        wrapper.innerHTML = `
          <div class="linked-records" id="field-${field.id}">
            <div class="linked-items"></div>
            <button type="button" class="add-linked-record-btn" data-table-id="${linkedTableId}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Add linked record
            </button>
          </div>
        `;
        this.fieldValues[field.id] = [];
        wrapper.querySelector('.add-linked-record-btn').addEventListener('click', () => {
          this.showLinkedRecordPicker(field);
        });
        break;

      case 'multipleAttachments':
        wrapper.innerHTML = `
          <div class="attachment-drop-zone" id="field-${field.id}">
            <input type="file"
                   class="attachment-input"
                   multiple
                   style="display: none;">
            <button type="button" class="add-linked-record-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              Add attachments (URL only)
            </button>
            <div class="attachment-list"></div>
          </div>
        `;
        this.fieldValues[field.id] = [];
        wrapper.querySelector('.add-linked-record-btn').addEventListener('click', () => {
          const url = prompt('Enter attachment URL:');
          if (url) {
            this.addAttachment(field.id, url);
          }
        });
        break;

      default:
        wrapper.innerHTML = `
          <input type="text"
                 class="input"
                 id="field-${field.id}"
                 placeholder="Enter ${field.name.toLowerCase()}">
        `;
        wrapper.querySelector('input').addEventListener('change', (e) => {
          this.fieldValues[field.id] = e.target.value || undefined;
        });
    }

    return wrapper;
  }

  addTag(fieldId, value) {
    if (!this.fieldValues[fieldId]) {
      this.fieldValues[fieldId] = [];
    }

    // Check if already exists
    if (this.fieldValues[fieldId].includes(value)) return;

    this.fieldValues[fieldId].push(value);

    const container = document.getElementById(`field-${fieldId}`);
    const input = container.querySelector('.tags-input');

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `
      ${value}
      <button type="button" class="tag-remove" data-value="${value}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    tag.querySelector('.tag-remove').addEventListener('click', () => {
      this.removeTag(fieldId, value);
      tag.remove();
    });

    container.insertBefore(tag, input);
  }

  removeTag(fieldId, value) {
    if (this.fieldValues[fieldId]) {
      this.fieldValues[fieldId] = this.fieldValues[fieldId].filter(v => v !== value);
    }
  }

  updateRatingUI(fieldId, value) {
    const container = document.getElementById(`field-${fieldId}`);
    container.querySelectorAll('.rating-star').forEach(star => {
      const starValue = parseInt(star.dataset.value);
      if (starValue <= value) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });
  }

  addAttachment(fieldId, url) {
    if (!this.fieldValues[fieldId]) {
      this.fieldValues[fieldId] = [];
    }

    this.fieldValues[fieldId].push({ url });

    const container = document.getElementById(`field-${fieldId}`);
    const list = container.querySelector('.attachment-list');

    const item = document.createElement('div');
    item.className = 'linked-record-item';
    item.innerHTML = `
      <span>${url.substring(0, 40)}${url.length > 40 ? '...' : ''}</span>
      <button type="button" class="linked-record-remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    item.querySelector('.linked-record-remove').addEventListener('click', () => {
      this.fieldValues[fieldId] = this.fieldValues[fieldId].filter(a => a.url !== url);
      item.remove();
    });

    list.appendChild(item);
  }

  async showLinkedRecordPicker(field) {
    const linkedTableId = field.options?.linkedTableId;
    if (!linkedTableId) return;

    this.showLoading('Loading records...');

    try {
      const records = await this.api.listRecords(this.currentBase, linkedTableId, 100);

      // Create simple picker dialog
      const recordName = prompt(
        `Enter record name/ID to link:\n\nAvailable records:\n${
          records.records.slice(0, 10).map(r => {
            const primaryValue = Object.values(r.fields)[0] || r.id;
            return `- ${primaryValue}`;
          }).join('\n')
        }${records.records.length > 10 ? '\n...' : ''}`
      );

      if (recordName) {
        // Find matching record
        const matchingRecord = records.records.find(r => {
          const primaryValue = Object.values(r.fields)[0];
          return primaryValue?.toString().toLowerCase().includes(recordName.toLowerCase()) ||
                 r.id === recordName;
        });

        if (matchingRecord) {
          this.addLinkedRecord(field.id, matchingRecord);
        } else {
          alert('Record not found. Try entering the exact name or ID.');
        }
      }
    } catch (error) {
      console.error('Error loading linked records:', error);
      alert('Failed to load records.');
    } finally {
      this.hideLoading();
    }
  }

  addLinkedRecord(fieldId, record) {
    if (!this.fieldValues[fieldId]) {
      this.fieldValues[fieldId] = [];
    }

    // Check if already linked
    if (this.fieldValues[fieldId].find(r => r.id === record.id)) return;

    this.fieldValues[fieldId].push({ id: record.id });

    const container = document.getElementById(`field-${fieldId}`);
    const itemsDiv = container.querySelector('.linked-items');

    const primaryValue = Object.values(record.fields)[0] || record.id;

    const item = document.createElement('div');
    item.className = 'linked-record-item';
    item.innerHTML = `
      <span>${primaryValue}</span>
      <button type="button" class="linked-record-remove" data-id="${record.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    item.querySelector('.linked-record-remove').addEventListener('click', () => {
      this.fieldValues[fieldId] = this.fieldValues[fieldId].filter(r => r.id !== record.id);
      item.remove();
    });

    itemsDiv.appendChild(item);
  }

  autoPopulateFields(fields) {
    // Try to auto-populate based on field names
    fields.forEach(field => {
      const fieldName = field.name.toLowerCase();
      const inputElement = document.getElementById(`field-${field.id}`);

      if (!inputElement) return;

      // URL fields
      if (field.type === 'url' || fieldName.includes('url') || fieldName.includes('link')) {
        inputElement.value = this.pageData.url || '';
        this.fieldValues[field.id] = this.pageData.url;
      }

      // Title fields
      if (fieldName.includes('title') || fieldName.includes('name')) {
        if (field.type === 'singleLineText' || field.type === 'multilineText') {
          inputElement.value = this.pageData.title || '';
          this.fieldValues[field.id] = this.pageData.title;
        }
      }

      // Notes/content fields with selected text
      if (this.selectedText && (fieldName.includes('note') || fieldName.includes('content') ||
          fieldName.includes('description') || fieldName.includes('text'))) {
        if (field.type === 'multilineText' || field.type === 'richText') {
          inputElement.value = this.selectedText;
          this.fieldValues[field.id] = this.selectedText;
        }
      }

      // Date fields - default to today
      if (field.type === 'date' || field.type === 'dateTime') {
        if (fieldName.includes('clipped') || fieldName.includes('created') || fieldName.includes('added')) {
          const now = new Date();
          if (field.type === 'date') {
            inputElement.value = now.toISOString().split('T')[0];
            this.fieldValues[field.id] = now.toISOString().split('T')[0];
          } else {
            inputElement.value = now.toISOString().slice(0, 16);
            this.fieldValues[field.id] = now.toISOString();
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
      selectionInfo.classList.remove('hidden');
      const truncated = this.selectedText.length > 50
        ? this.selectedText.substring(0, 50) + '...'
        : this.selectedText;
      selectionText.textContent = `"${truncated}"`;
    } else {
      selectionInfo.classList.add('hidden');
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
      // Prepare fields - only include fields with values
      const fields = {};

      for (const [fieldId, value] of Object.entries(this.fieldValues)) {
        if (value !== undefined && value !== '' && value !== null) {
          // Find field in schema to get the name
          const fieldSchema = this.tableSchema.fields.find(f => f.id === fieldId);
          if (fieldSchema) {
            // Handle multi-select format
            if (fieldSchema.type === 'multipleSelects' && Array.isArray(value)) {
              fields[fieldSchema.name] = value.map(v => ({ name: v }));
            } else {
              fields[fieldSchema.name] = value;
            }
          }
        }
      }

      // Also include edited page title/URL if they were changed
      const editedTitle = document.getElementById('pageTitle').value;
      const editedUrl = document.getElementById('pageUrl').value;

      // Create the record
      const result = await this.api.createRecord(this.currentBase, this.currentTable, fields);

      this.hideLoading();
      this.showSuccess(result.id, this.tableSchema.name);

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

    // Re-render fields
    if (this.tableSchema) {
      this.renderFields(this.tableSchema.fields);
    }

    // Reload page data
    this.loadPageData();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new AirtableWebClipper();
});
