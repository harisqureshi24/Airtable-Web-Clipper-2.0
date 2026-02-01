# Extension Icons

To generate the PNG icons required for the Chrome extension:

## Option 1: Using the HTML Generator (Recommended)

1. Open `generate-icons.html` in Chrome browser
2. Click "Download All" to download all icon sizes
3. Save the downloaded files to this `icons/` folder:
   - `icon16.png`
   - `icon32.png`
   - `icon48.png`
   - `icon128.png`

## Option 2: Using ImageMagick

If you have ImageMagick installed:

```bash
convert -background none icon.svg -resize 16x16 icon16.png
convert -background none icon.svg -resize 32x32 icon32.png
convert -background none icon.svg -resize 48x48 icon48.png
convert -background none icon.svg -resize 128x128 icon128.png
```

## Option 3: Using Online Converter

1. Go to https://cloudconvert.com/svg-to-png
2. Upload `icon.svg`
3. Generate at sizes: 16px, 32px, 48px, 128px
4. Download and rename appropriately

## Icon Specifications

| File | Size | Usage |
|------|------|-------|
| icon16.png | 16x16 | Favicon, small toolbar icon |
| icon32.png | 32x32 | Toolbar icon (Windows) |
| icon48.png | 48x48 | Extensions management page |
| icon128.png | 128x128 | Chrome Web Store, installation dialog |
