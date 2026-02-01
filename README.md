# Airtable Web Clipper 2.0

A complete web clipping solution for Airtable with two powerful components:

1. **Chrome Extension** - Clip any web page directly to Airtable from your browser
2. **Airtable Block** - Enhanced record creation within Airtable with full field type support

## Features

### Chrome Extension

- **One-Click Clipping** - Save web pages instantly with keyboard shortcuts
- **Smart Content Extraction** - Automatically captures page title, URL, selected text, and metadata
- **Full Field Support** - Works with all Airtable field types including dates, selects, and linked records
- **Context Menu Integration** - Right-click to clip pages, selections, links, or images
- **Quick Clip** - Configure a default table for instant clipping (Alt+Shift+S)
- **Clean Modern UI** - Beautiful interface that matches Airtable's design

### Airtable Block (Extension)

- **Date & DateTime Fields** - Full support for adding dates when creating records
- **Inline Linked Record Creation** - Create new records in related tables on-the-fly
- **Attachment Support** - Add attachments via URL
- **Interactive Rating Fields** - Click-to-rate star interface
- **Toast Notifications** - Elegant feedback instead of browser alerts
- **All Standard Field Types** - Text, numbers, URLs, emails, checkboxes, and more

## Installation

### Chrome Extension

1. **Clone this repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Airtable-Web-Clipper-2.0.git
   cd Airtable-Web-Clipper-2.0
   ```

2. **Generate icons** (if not already generated):
   - Open `chrome-extension/icons/generate-icons.html` in Chrome
   - Click "Download All" and save icons to the `icons/` folder

3. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

4. **Configure**:
   - Click the extension icon in the toolbar
   - Click "Set Up Connection"
   - Enter your [Airtable Personal Access Token](https://airtable.com/create/tokens)
   - Select your default base and table for quick clipping

### Airtable Block

1. **Install Airtable Blocks CLI** (if not already installed):
   ```bash
   npm install -g @airtable/blocks-cli
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the block**:
   ```bash
   npm start
   # or
   block run
   ```

4. **Follow the prompts** to connect to your Airtable base

## Usage

### Chrome Extension

#### Quick Clip (Fastest)
- Press **Alt+Shift+S** to instantly clip the current page to your default table
- Great for quickly saving articles, bookmarks, or research

#### Full Clipper
- Press **Alt+Shift+A** or click the extension icon
- Select a base and table
- Fill in additional fields as needed
- Click "Clip to Airtable"

#### Context Menu
- Right-click on any page, selection, link, or image
- Choose "Clip to Airtable" from the context menu

### Airtable Block

1. Open your Airtable base
2. Add the "Enhanced Web Clipper" extension
3. Select a table from the dropdown
4. Fill in the fields you need
5. Click "Create Record"

## Supported Field Types

| Field Type | Chrome Extension | Airtable Block |
|------------|-----------------|----------------|
| Single line text | ✅ | ✅ |
| Long text | ✅ | ✅ |
| Rich text | ✅ | ✅ |
| Email | ✅ | ✅ |
| URL | ✅ | ✅ |
| Phone number | ✅ | ✅ |
| Number | ✅ | ✅ |
| Currency | ✅ | ✅ |
| Percent | ✅ | ✅ |
| Date | ✅ | ✅ |
| Date & Time | ✅ | ✅ |
| Duration | ✅ | ✅ |
| Checkbox | ✅ | ✅ |
| Single select | ✅ | ✅ |
| Multiple select | ✅ | ✅ |
| Linked records | ✅ | ✅ |
| Rating | ✅ | ✅ |
| Attachments (URL) | ✅ | ✅ |
| Barcode | ✅ | ✅ |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Alt+Shift+A | Open the clipper popup |
| Alt+Shift+S | Quick clip to default table |

## API Key Setup

### Getting Your Personal Access Token

1. Go to [Airtable's token page](https://airtable.com/create/tokens)
2. Click "Create new token"
3. Name it (e.g., "Web Clipper")
4. Add scopes:
   - `data.records:read` - Read records
   - `data.records:write` - Create/update records
   - `schema.bases:read` - Read base schema
5. Add access to your bases
6. Click "Create token"
7. Copy the token (starts with `pat`)

### Security Notes

- Your API token is stored securely in Chrome's sync storage
- The token is never sent to any third-party servers
- Only Airtable's official API endpoints are used

## Project Structure

```
Airtable-Web-Clipper-2.0/
├── chrome-extension/           # Chrome Extension
│   ├── manifest.json          # Extension manifest (v3)
│   ├── popup.html            # Main popup UI
│   ├── popup.css             # Popup styles
│   ├── popup.js              # Popup logic
│   ├── content.js            # Content script
│   ├── content.css           # Content styles
│   ├── background.js         # Service worker
│   ├── options.html          # Settings page
│   ├── options.js            # Settings logic
│   ├── lib/
│   │   └── airtable-api.js   # API helper
│   └── icons/                # Extension icons
│       ├── icon.svg          # Source SVG
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
├── frontend/
│   └── index.tsx             # Airtable Block code
├── .block/
│   └── remote.json           # Airtable block config
├── block.json                # Block manifest
├── package.json              # Dependencies
└── README.md                 # This file
```

## Development

### Chrome Extension

The extension uses Chrome's Manifest V3 with:
- Service worker for background tasks
- Content scripts for page interaction
- Popup for main UI
- Options page for settings

To modify:
1. Edit files in `chrome-extension/`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension

### Airtable Block

The block uses React with the Airtable Blocks SDK:
- TypeScript for type safety
- Airtable UI components for consistent design
- Hooks for state management

To develop:
```bash
npm start
```

## Troubleshooting

### Chrome Extension

**"API key not configured"**
- Click the extension icon → Settings
- Enter your Personal Access Token

**"Failed to load bases"**
- Verify your API token is correct
- Check that the token has the required scopes
- Ensure you have access to at least one base

**Quick clip not working**
- Go to Settings and configure your default base/table
- Make sure the table has the fields you need

### Airtable Block

**"Extension won't load"**
- Run `npm install` first
- Make sure you're logged into Airtable CLI

**"Can't create records"**
- Verify you have edit permissions in the base
- Check that required fields are filled
- Some field types may require specific formatting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use and modify as needed.

## Acknowledgments

- Built with [Airtable Blocks SDK](https://airtable.com/developers/blocks)
- Chrome Extension uses [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- Icons designed with Airtable's color palette
