/**
 * Airtable Web Clipper 2.0 - Options Page Script
 * Handles settings and configuration
 */

class OptionsPage {
  constructor() {
    this.api = new AirtableAPI();
    this.bases = [];
    this.baseSchemas = {};
    this.hiddenFields = {};
    this.fieldOrder = {};
    this.currentFieldVisBase = null;
    this.currentFieldVisTable = null;
    this.draggedItem = null;
    this.hotkeys = {
      openClipper: { key: 'A', ctrl: false, alt: true, shift: true, meta: false },
      quickClip: { key: 'S', ctrl: false, alt: true, shift: true, meta: false }
    };
    this.recordingHotkey = null;

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadSettings();
    await this.loadHotkeys();
    await this.checkConnection();
  }

  bindEvents() {
    // Toggle password visibility
    document.getElementById('togglePassword').addEventListener('click', () => {
      const input = document.getElementById('apiKey');
      const type = input.type === 'password' ? 'text' : 'password';
      input.type = type;
    });

    // Save API key
    document.getElementById('saveApiKey').addEventListener('click', () => {
      this.saveApiKey();
    });

    // Quick clip base selection
    document.getElementById('quickClipBase').addEventListener('change', (e) => {
      this.onBaseChange(e.target.value);
    });

    // Save quick clip settings
    document.getElementById('saveQuickClip').addEventListener('click', () => {
      this.saveQuickClipSettings();
    });

    // Disconnect
    document.getElementById('disconnectBtn').addEventListener('click', () => {
      this.disconnect();
    });

    // Enter key on API key input
    document.getElementById('apiKey').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveApiKey();
      }
    });

    // Field visibility base selection
    document.getElementById('fieldVisBase').addEventListener('change', (e) => {
      this.onFieldVisBaseChange(e.target.value);
    });

    // Field visibility table selection
    document.getElementById('fieldVisTable').addEventListener('change', (e) => {
      this.onFieldVisTableChange(e.target.value);
    });

    // Save field visibility
    document.getElementById('saveFieldVisibility').addEventListener('click', () => {
      this.saveFieldVisibility();
    });

    // Hotkey inputs
    document.getElementById('hotkeyOpen').addEventListener('focus', () => {
      this.startRecordingHotkey('openClipper', 'hotkeyOpen');
    });

    document.getElementById('hotkeyOpen').addEventListener('blur', () => {
      this.stopRecordingHotkey('hotkeyOpen');
    });

    document.getElementById('hotkeyQuickClip').addEventListener('focus', () => {
      this.startRecordingHotkey('quickClip', 'hotkeyQuickClip');
    });

    document.getElementById('hotkeyQuickClip').addEventListener('blur', () => {
      this.stopRecordingHotkey('hotkeyQuickClip');
    });

    // Hotkey capture
    document.addEventListener('keydown', (e) => {
      if (this.recordingHotkey) {
        e.preventDefault();
        this.captureHotkey(e);
      }
    });

    // Save hotkeys
    document.getElementById('saveHotkeys').addEventListener('click', () => {
      this.saveHotkeys();
    });

    // Reset hotkeys
    document.getElementById('resetHotkeys').addEventListener('click', () => {
      this.resetHotkeys();
    });
  }

  async loadSettings() {
    // Load API key
    const apiKey = await this.api.getApiKey();
    if (apiKey) {
      document.getElementById('apiKey').value = apiKey;
    }

    // Load quick clip settings, hidden fields, and field order
    const settings = await chrome.storage.sync.get(['quickClipBaseId', 'quickClipTableId', 'hiddenFields', 'fieldOrder']);

    if (settings.quickClipBaseId) {
      // Will be set after bases load
      this.savedQuickClipBase = settings.quickClipBaseId;
      this.savedQuickClipTable = settings.quickClipTableId;
    }

    // Load hidden fields and field order
    this.hiddenFields = settings.hiddenFields || {};
    this.fieldOrder = settings.fieldOrder || {};
  }

  async checkConnection() {
    const apiKey = await this.api.getApiKey();

    if (!apiKey) {
      this.updateStatus('disconnected', 'Not connected');
      return;
    }

    this.updateStatus('checking', 'Checking connection...');

    try {
      const result = await this.api.validateApiKey(apiKey);

      if (result.valid) {
        this.updateStatus('connected', `Connected (${result.bases} bases)`);
        await this.loadBases();
      } else {
        this.updateStatus('disconnected', 'Invalid API key');
        this.showAlert('error', result.error || 'Invalid API key');
      }
    } catch (error) {
      this.updateStatus('disconnected', 'Connection failed');
      this.showAlert('error', error.message);
    }
  }

  updateStatus(status, text) {
    const badge = document.getElementById('statusBadge');
    badge.className = `status-badge ${status}`;

    let icon = '';
    switch (status) {
      case 'connected':
        icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        break;
      case 'disconnected':
        icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        break;
      case 'checking':
        icon = '<span class="spinner"></span>';
        break;
    }

    badge.innerHTML = `${icon} ${text}`;
  }

  showAlert(type, message) {
    const container = document.getElementById('alertContainer');
    container.className = `alert alert-${type}`;
    container.textContent = message;
    container.classList.remove('hidden');

    // Auto-hide success alerts
    if (type === 'success') {
      setTimeout(() => {
        container.classList.add('hidden');
      }, 3000);
    }
  }

  hideAlert() {
    document.getElementById('alertContainer').classList.add('hidden');
  }

  async saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!apiKey) {
      this.showAlert('error', 'Please enter an API key');
      return;
    }

    if (!apiKey.startsWith('pat')) {
      this.showAlert('error', 'API key should start with "pat" (Personal Access Token)');
      return;
    }

    const saveBtn = document.getElementById('saveApiKey');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Validating...';

    try {
      const result = await this.api.validateApiKey(apiKey);

      if (result.valid) {
        await this.api.setApiKey(apiKey);
        this.showAlert('success', 'Connected successfully!');
        this.updateStatus('connected', `Connected (${result.bases} bases)`);
        await this.loadBases();
      } else {
        this.showAlert('error', result.error || 'Invalid API key');
        this.updateStatus('disconnected', 'Invalid API key');
      }
    } catch (error) {
      this.showAlert('error', error.message);
      this.updateStatus('disconnected', 'Connection failed');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save & Connect
      `;
    }
  }

  async loadBases() {
    try {
      this.bases = await this.api.listBases();

      const baseSelect = document.getElementById('quickClipBase');
      baseSelect.disabled = false;
      baseSelect.innerHTML = '<option value="">Select a base...</option>';

      // Also populate field visibility base select
      const fieldVisBase = document.getElementById('fieldVisBase');
      fieldVisBase.disabled = false;
      fieldVisBase.innerHTML = '<option value="">Select a base...</option>';

      this.bases.forEach(base => {
        const option = document.createElement('option');
        option.value = base.id;
        option.textContent = base.name;
        baseSelect.appendChild(option);

        // Clone for field visibility
        const option2 = option.cloneNode(true);
        fieldVisBase.appendChild(option2);
      });

      // Restore saved selection
      if (this.savedQuickClipBase) {
        baseSelect.value = this.savedQuickClipBase;
        await this.onBaseChange(this.savedQuickClipBase);
      }

      document.getElementById('saveQuickClip').disabled = false;

    } catch (error) {
      console.error('Error loading bases:', error);
      this.showAlert('error', 'Failed to load bases');
    }
  }

  async onBaseChange(baseId) {
    const tableSelect = document.getElementById('quickClipTable');

    if (!baseId) {
      tableSelect.disabled = true;
      tableSelect.innerHTML = '<option value="">Select a base first...</option>';
      return;
    }

    tableSelect.disabled = true;
    tableSelect.innerHTML = '<option value="">Loading tables...</option>';

    try {
      // Check if we already have the schema cached
      if (!this.baseSchemas[baseId]) {
        this.baseSchemas[baseId] = await this.api.getBaseSchema(baseId);
      }

      const schema = this.baseSchemas[baseId];
      tableSelect.disabled = false;
      tableSelect.innerHTML = '<option value="">Select a table...</option>';

      schema.tables.forEach(table => {
        const option = document.createElement('option');
        option.value = table.id;
        option.textContent = table.name;
        tableSelect.appendChild(option);
      });

      // Restore saved selection
      if (this.savedQuickClipTable && baseId === this.savedQuickClipBase) {
        tableSelect.value = this.savedQuickClipTable;
      }

    } catch (error) {
      console.error('Error loading tables:', error);
      tableSelect.innerHTML = '<option value="">Error loading tables</option>';
    }
  }

  async saveQuickClipSettings() {
    const baseId = document.getElementById('quickClipBase').value;
    const tableId = document.getElementById('quickClipTable').value;

    await chrome.storage.sync.set({
      quickClipBaseId: baseId,
      quickClipTableId: tableId
    });

    this.showAlert('success', 'Quick clip settings saved!');
  }

  async disconnect() {
    const confirmed = confirm(
      'Are you sure you want to disconnect? This will remove your API key and all settings.'
    );

    if (!confirmed) return;

    // Clear all storage
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();

    // Reset UI
    document.getElementById('apiKey').value = '';
    document.getElementById('quickClipBase').disabled = true;
    document.getElementById('quickClipBase').innerHTML = '<option value="">Connect to load bases...</option>';
    document.getElementById('quickClipTable').disabled = true;
    document.getElementById('quickClipTable').innerHTML = '<option value="">Select a base first...</option>';
    document.getElementById('saveQuickClip').disabled = true;

    // Reset field visibility UI
    document.getElementById('fieldVisBase').disabled = true;
    document.getElementById('fieldVisBase').innerHTML = '<option value="">Connect to load bases...</option>';
    document.getElementById('fieldVisTable').disabled = true;
    document.getElementById('fieldVisTable').innerHTML = '<option value="">Select a base first...</option>';
    document.getElementById('fieldsList').style.display = 'none';
    document.getElementById('saveFieldVisibility').disabled = true;

    // Reset state
    this.hiddenFields = {};
    this.fieldOrder = {};

    this.updateStatus('disconnected', 'Not connected');
    this.showAlert('success', 'Disconnected successfully');
  }

  // Field Visibility Methods
  async onFieldVisBaseChange(baseId) {
    const tableSelect = document.getElementById('fieldVisTable');
    const fieldsList = document.getElementById('fieldsList');

    if (!baseId) {
      tableSelect.disabled = true;
      tableSelect.innerHTML = '<option value="">Select a base first...</option>';
      fieldsList.style.display = 'none';
      document.getElementById('saveFieldVisibility').disabled = true;
      return;
    }

    this.currentFieldVisBase = baseId;
    tableSelect.disabled = true;
    tableSelect.innerHTML = '<option value="">Loading tables...</option>';

    try {
      if (!this.baseSchemas[baseId]) {
        this.baseSchemas[baseId] = await this.api.getBaseSchema(baseId);
      }

      const schema = this.baseSchemas[baseId];
      tableSelect.disabled = false;
      tableSelect.innerHTML = '<option value="">Select a table...</option>';

      schema.tables.forEach(table => {
        const option = document.createElement('option');
        option.value = table.id;
        option.textContent = table.name;
        tableSelect.appendChild(option);
      });

    } catch (error) {
      console.error('Error loading tables:', error);
      tableSelect.innerHTML = '<option value="">Error loading tables</option>';
    }
  }

  async onFieldVisTableChange(tableId) {
    const fieldsList = document.getElementById('fieldsList');
    const saveBtn = document.getElementById('saveFieldVisibility');

    if (!tableId) {
      fieldsList.style.display = 'none';
      saveBtn.disabled = true;
      return;
    }

    this.currentFieldVisTable = tableId;

    const schema = this.baseSchemas[this.currentFieldVisBase];
    const table = schema.tables.find(t => t.id === tableId);

    if (!table) {
      fieldsList.style.display = 'none';
      return;
    }

    // Filter to editable fields only
    const nonEditableTypes = ['autoNumber', 'createdTime', 'lastModifiedTime',
                              'createdBy', 'lastModifiedBy', 'count',
                              'lookup', 'rollup', 'formula', 'button'];

    let editableFields = table.fields.filter(f => !nonEditableTypes.includes(f.type));

    // Get hidden fields and saved order for this table
    const tableKey = `${this.currentFieldVisBase}_${tableId}`;
    const hiddenFieldIds = this.hiddenFields[tableKey] || [];
    const savedOrder = this.fieldOrder[tableKey] || [];

    // Sort by saved order if exists
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

    // Render sortable checkboxes
    const checkboxesContainer = document.getElementById('fieldsCheckboxes');
    checkboxesContainer.innerHTML = '';

    editableFields.forEach(field => {
      const isHidden = hiddenFieldIds.includes(field.id);
      const item = document.createElement('div');
      item.className = 'field-checkbox-item';
      item.draggable = true;
      item.dataset.fieldId = field.id;
      item.innerHTML = `
        <span class="drag-handle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/>
          </svg>
        </span>
        <input type="checkbox" value="${field.id}" ${!isHidden ? 'checked' : ''}>
        <span class="field-name">${field.name}</span>
        <span class="field-type">${this.getFieldTypeBadge(field.type)}</span>
      `;

      // Drag events
      item.addEventListener('dragstart', (e) => this.handleDragStart(e, item));
      item.addEventListener('dragend', (e) => this.handleDragEnd(e, item));
      item.addEventListener('dragover', (e) => this.handleDragOver(e, item));
      item.addEventListener('dragleave', (e) => this.handleDragLeave(e, item));
      item.addEventListener('drop', (e) => this.handleDrop(e, item));

      checkboxesContainer.appendChild(item);
    });

    fieldsList.style.display = 'block';
    saveBtn.disabled = false;
  }

  // Drag and Drop handlers
  handleDragStart(e, item) {
    this.draggedItem = item;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.fieldId);
  }

  handleDragEnd(e, item) {
    item.classList.remove('dragging');
    this.draggedItem = null;
    // Remove drag-over class from all items
    document.querySelectorAll('.field-checkbox-item.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  handleDragOver(e, item) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (item !== this.draggedItem) {
      item.classList.add('drag-over');
    }
  }

  handleDragLeave(e, item) {
    item.classList.remove('drag-over');
  }

  handleDrop(e, item) {
    e.preventDefault();
    item.classList.remove('drag-over');

    if (!this.draggedItem || this.draggedItem === item) return;

    const container = document.getElementById('fieldsCheckboxes');
    const items = Array.from(container.children);
    const draggedIndex = items.indexOf(this.draggedItem);
    const dropIndex = items.indexOf(item);

    if (draggedIndex < dropIndex) {
      item.after(this.draggedItem);
    } else {
      item.before(this.draggedItem);
    }
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

  async saveFieldVisibility() {
    const tableKey = `${this.currentFieldVisBase}_${this.currentFieldVisTable}`;
    const items = document.querySelectorAll('#fieldsCheckboxes .field-checkbox-item');

    // Get field order (from DOM order) and hidden fields
    const fieldOrderArr = [];
    const hiddenFieldIds = [];

    items.forEach(item => {
      const fieldId = item.dataset.fieldId;
      const checkbox = item.querySelector('input[type="checkbox"]');

      fieldOrderArr.push(fieldId);

      if (!checkbox.checked) {
        hiddenFieldIds.push(fieldId);
      }
    });

    // Update both hidden fields and field order
    this.hiddenFields[tableKey] = hiddenFieldIds;
    this.fieldOrder[tableKey] = fieldOrderArr;

    // Save to storage
    await chrome.storage.sync.set({
      hiddenFields: this.hiddenFields,
      fieldOrder: this.fieldOrder
    });

    this.showAlert('success', 'Field visibility and order saved!');
  }

  // Hotkey Methods
  async loadHotkeys() {
    const settings = await chrome.storage.sync.get(['hotkeys']);
    if (settings.hotkeys) {
      this.hotkeys = settings.hotkeys;
    }
    this.updateHotkeyDisplays();
  }

  updateHotkeyDisplays() {
    document.getElementById('hotkeyOpen').value = this.formatHotkey(this.hotkeys.openClipper);
    document.getElementById('hotkeyQuickClip').value = this.formatHotkey(this.hotkeys.quickClip);
  }

  formatHotkey(hotkey) {
    if (!hotkey || !hotkey.key) return '';
    const parts = [];
    if (hotkey.ctrl) parts.push('Ctrl');
    if (hotkey.alt) parts.push('Alt');
    if (hotkey.shift) parts.push('Shift');
    if (hotkey.meta) parts.push('⌘');
    parts.push(hotkey.key.toUpperCase());
    return parts.join(' + ');
  }

  startRecordingHotkey(hotkeyName, inputId) {
    this.recordingHotkey = { name: hotkeyName, inputId };
    const input = document.getElementById(inputId);
    input.classList.add('recording');
    input.value = 'Press keys...';
  }

  stopRecordingHotkey(inputId) {
    const input = document.getElementById(inputId);
    input.classList.remove('recording');
    this.recordingHotkey = null;
    this.updateHotkeyDisplays();
  }

  captureHotkey(e) {
    // Ignore modifier-only keys
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return;
    }

    const hotkey = {
      key: e.key.length === 1 ? e.key.toUpperCase() : e.key,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    };

    // Must have at least one modifier
    if (!hotkey.ctrl && !hotkey.alt && !hotkey.shift && !hotkey.meta) {
      return;
    }

    this.hotkeys[this.recordingHotkey.name] = hotkey;
    
    const input = document.getElementById(this.recordingHotkey.inputId);
    input.value = this.formatHotkey(hotkey);
    input.classList.remove('recording');
    input.blur();
  }

  async saveHotkeys() {
    await chrome.storage.sync.set({ hotkeys: this.hotkeys });
    this.showAlert('success', 'Keyboard shortcuts saved!');
  }

  resetHotkeys() {
    this.hotkeys = {
      openClipper: { key: 'A', ctrl: false, alt: true, shift: true, meta: false },
      quickClip: { key: 'S', ctrl: false, alt: true, shift: true, meta: false }
    };
    this.updateHotkeyDisplays();
    this.showAlert('info', 'Hotkeys reset to defaults. Click "Save Hotkeys" to apply.');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new OptionsPage();
});
