/**
 * Airtable API Helper
 * Handles all communication with the Airtable REST API
 */

class AirtableAPI {
  constructor() {
    this.baseUrl = 'https://api.airtable.com/v0';
    this.metaUrl = 'https://api.airtable.com/v0/meta';
  }

  /**
   * Get the stored API key
   */
  async getApiKey() {
    const result = await chrome.storage.sync.get(['airtableApiKey']);
    return result.airtableApiKey;
  }

  /**
   * Save the API key
   */
  async setApiKey(apiKey) {
    await chrome.storage.sync.set({ airtableApiKey: apiKey });
  }

  /**
   * Check if API is configured
   */
  async isConfigured() {
    const apiKey = await this.getApiKey();
    return !!apiKey;
  }

  /**
   * Get last used base ID
   */
  async getLastUsedBase() {
    const result = await chrome.storage.local.get(['lastUsedBaseId']);
    return result.lastUsedBaseId;
  }

  /**
   * Save last used base ID
   */
  async setLastUsedBase(baseId) {
    await chrome.storage.local.set({ lastUsedBaseId: baseId });
  }

  /**
   * Get last used table ID for a base
   */
  async getLastUsedTable(baseId) {
    const result = await chrome.storage.local.get([`lastUsedTableId_${baseId}`]);
    return result[`lastUsedTableId_${baseId}`];
  }

  /**
   * Save last used table ID for a base
   */
  async setLastUsedTable(baseId, tableId) {
    await chrome.storage.local.set({ [`lastUsedTableId_${baseId}`]: tableId });
  }

  /**
   * Make an authenticated API request
   */
  async request(url, options = {}) {
    const apiKey = await this.getApiKey();

    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * List all bases the user has access to
   */
  async listBases() {
    const result = await this.request(`${this.metaUrl}/bases`);
    return result.bases || [];
  }

  /**
   * Get the schema for a base (tables and fields)
   */
  async getBaseSchema(baseId) {
    return this.request(`${this.metaUrl}/bases/${baseId}/tables`);
  }

  /**
   * List records from a table
   */
  async listRecords(baseId, tableId, maxRecords = 100, filterByFormula = null) {
    let url = `${this.baseUrl}/${baseId}/${tableId}?maxRecords=${maxRecords}`;

    if (filterByFormula) {
      url += `&filterByFormula=${encodeURIComponent(filterByFormula)}`;
    }

    return this.request(url);
  }

  /**
   * Get a single record
   */
  async getRecord(baseId, tableId, recordId) {
    return this.request(`${this.baseUrl}/${baseId}/${tableId}/${recordId}`);
  }

  /**
   * Create a new record
   */
  async createRecord(baseId, tableId, fields) {
    return this.request(`${this.baseUrl}/${baseId}/${tableId}`, {
      method: 'POST',
      body: JSON.stringify({
        fields,
        typecast: true // Allow Airtable to automatically convert types
      })
    });
  }

  /**
   * Create multiple records at once
   */
  async createRecords(baseId, tableId, records) {
    // Airtable allows max 10 records per request
    const batches = [];
    for (let i = 0; i < records.length; i += 10) {
      batches.push(records.slice(i, i + 10));
    }

    const results = [];
    for (const batch of batches) {
      const result = await this.request(`${this.baseUrl}/${baseId}/${tableId}`, {
        method: 'POST',
        body: JSON.stringify({
          records: batch.map(fields => ({ fields })),
          typecast: true
        })
      });
      results.push(...result.records);
    }

    return results;
  }

  /**
   * Update a record
   */
  async updateRecord(baseId, tableId, recordId, fields) {
    return this.request(`${this.baseUrl}/${baseId}/${tableId}/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields,
        typecast: true
      })
    });
  }

  /**
   * Delete a record
   */
  async deleteRecord(baseId, tableId, recordId) {
    return this.request(`${this.baseUrl}/${baseId}/${tableId}/${recordId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(apiKey) {
    try {
      const response = await fetch(`${this.metaUrl}/bases`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return { valid: true, bases: data.bases?.length || 0 };
      } else {
        const error = await response.json().catch(() => ({}));
        return { valid: false, error: error.error?.message || 'Invalid API key' };
      }
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Search records by field value
   */
  async searchRecords(baseId, tableId, fieldName, searchValue, maxRecords = 20) {
    const filterFormula = `SEARCH("${searchValue}", {${fieldName}})`;
    return this.listRecords(baseId, tableId, maxRecords, filterFormula);
  }

  /**
   * Get field choices for select fields
   */
  async getFieldChoices(baseId, tableId, fieldId) {
    const schema = await this.getBaseSchema(baseId);
    const table = schema.tables.find(t => t.id === tableId);
    if (!table) return [];

    const field = table.fields.find(f => f.id === fieldId);
    if (!field) return [];

    return field.options?.choices || [];
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AirtableAPI;
}
