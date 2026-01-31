# Enhanced Web Clipper for Airtable

A powerful Airtable extension that improves upon the native web clipper with two critical features:

1. **Date Field Support** - Add date and datetime fields when clipping content
2. **Inline Linked Record Creation** - Create new records in linked tables without leaving the clipper

## Features

### Core Improvements Over Native Web Clipper

- ✅ **Date & DateTime Fields**: Full support for adding dates when creating records
- ✅ **Create Linked Records Inline**: Create new records in related tables on-the-fly
- ✅ **All Standard Field Types**: Text, numbers, URLs, emails, checkboxes, ratings, and more
- ✅ **Multi-Select Support**: Add multiple selections and linked records
- ✅ **Clean UI**: Simple, intuitive interface that matches Airtable's design language

### Supported Field Types

- Single line text
- Long text (multiline)
- Email
- URL
- Phone number
- Number
- Currency
- Percent
- Date (NEW!)
- Date & Time (NEW!)
- Checkbox
- Single select
- Multiple select
- Linked records (with inline creation - NEW!)
- Rating

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- An Airtable account with a base where you want to install the extension

### Steps

1. **Install Airtable Blocks CLI** (if not already installed):
   ```bash
   npm install -g @airtable/blocks-cli
   ```

2. **Navigate to the extension directory**:
   ```bash
   cd "/Users/harisqureshi/Library/Mobile Documents/com~apple~CloudDocs/Personal/Vibe Coding/Claude"
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Initialize the extension in your Airtable base**:
   ```bash
   block run
   ```

5. **Follow the prompts**:
   - You'll be asked to log in to Airtable (if not already logged in)
   - Select the base where you want to install the extension
   - The extension will open in your browser

## Usage

### Basic Workflow

1. **Select a Table**: Choose which table you want to create records in
2. **Fill in Fields**: The extension will show all available fields for that table
3. **Add Dates**: Use the date picker for any date/datetime fields
4. **Link Records**:
   - Select existing records from the dropdown
   - Or click "Create new record" to add a new linked record inline
5. **Submit**: Click "Create Record" to save

### Creating Linked Records

When you encounter a linked record field:

1. You can select existing records from the dropdown
2. Click the "Create new record in [Table Name]" button
3. A modal will open with fields from the linked table
4. Fill in the required information
5. Click "Create Record" to add it
6. The new record will automatically be linked to your main record

### Working with Date Fields

Date fields now use a native datetime picker:
- Select both date and time
- The extension automatically formats it for Airtable
- Works with both Date and DateTime field types

## Development

### Project Structure

```
enhanced-web-clipper/
├── frontend/
│   └── index.tsx          # Main extension component
├── block.json             # Extension configuration
├── package.json           # Dependencies
└── README.md             # Documentation
```

### Key Components

- **Main Component**: Renders the form with all field types
- **Field Renderer**: Dynamically renders appropriate input for each field type
- **Linked Record Modal**: Handles inline creation of related records
- **Form Submission**: Creates records with proper field formatting

### Customization

You can customize the extension by modifying `frontend/index.tsx`:

- Add custom field validation
- Implement auto-fill from clipboard
- Add browser extension integration for actual web clipping
- Customize the UI theme

## Technical Details

### Date Field Implementation

Date fields are handled using the HTML5 `datetime-local` input, which provides:
- Native date/time picker UI
- Automatic validation
- Conversion to ISO format for Airtable

```typescript
<Input
    type="datetime-local"
    onChange={(e) => {
        const isoDate = new Date(e.target.value).toISOString();
        handleFieldChange(fieldId, isoDate);
    }}
/>
```

### Linked Record Creation

The extension creates a two-step process:
1. Creates the new record in the linked table
2. Adds the record ID to the linking field in the main record

```typescript
const recordId = await linkedTable.createRecordAsync(newRecordData);
handleFieldChange(fieldId, [...currentValue, { id: recordId }]);
```

## Limitations

- Attachment fields require file upload (not yet implemented)
- Formula and rollup fields are read-only (as designed)
- Some complex field types may have limited support
- Browser integration for automatic URL/title detection requires additional setup

## Future Enhancements

Potential features for future versions:
- Browser extension for actual web page clipping
- Auto-detect URL and page title from browser
- Batch record creation
- Custom field templates
- Keyboard shortcuts
- Attachment support via drag-and-drop

## Troubleshooting

### Extension won't load
- Make sure you've run `npm install`
- Check that you're in the correct directory
- Verify your Airtable CLI is up to date

### Can't create records
- Verify you have edit permissions in the base
- Check that required fields are filled
- Some field types may require specific formatting

### Linked record creation fails
- Ensure you have permissions in both tables
- Check that the linked table has the necessary fields
- Required fields in the linked table must be filled

## Support

For issues or questions:
- Check the Airtable Blocks SDK documentation
- Review the code in `frontend/index.tsx`
- Test in a development base before production use

## License

This is a custom extension for personal use. Modify and distribute as needed.
