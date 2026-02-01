# GitHub Setup Instructions

Follow these steps to push this extension to GitHub:

## Option 1: Using GitHub CLI (Recommended)

If you have GitHub CLI installed:

```bash
cd "/Users/harisqureshi/Library/Mobile Documents/com~apple~CloudDocs/Personal/Vibe Coding/Claude"
gh repo create airtable-enhanced-web-clipper --public --source=. --description="Enhanced Airtable web clipper with date field support and inline linked record creation" --push
```

## Option 2: Using GitHub Web Interface

1. **Go to GitHub and create a new repository**:
   - Visit https://github.com/new
   - Repository name: `airtable-enhanced-web-clipper`
   - Description: `Enhanced Airtable web clipper with date field support and inline linked record creation`
   - Choose Public or Private
   - DON'T initialize with README (we already have one)
   - Click "Create repository"

2. **Push your local code to GitHub**:

   GitHub will show you commands, but here they are:

   ```bash
   cd "/Users/harisqureshi/Library/Mobile Documents/com~apple~CloudDocs/Personal/Vibe Coding/Claude"
   git remote add origin https://github.com/YOUR_USERNAME/airtable-enhanced-web-clipper.git
   git branch -M main
   git push -u origin main
   ```

   Replace `YOUR_USERNAME` with your actual GitHub username.

## Option 3: Using GitHub Desktop

1. Open GitHub Desktop
2. Click "Add" → "Add Existing Repository"
3. Choose the folder: `/Users/harisqureshi/Library/Mobile Documents/com~apple~CloudDocs/Personal/Vibe Coding/Claude`
4. Click "Publish repository"
5. Name it `airtable-enhanced-web-clipper`
6. Choose public or private
7. Click "Publish Repository"

## After Pushing to GitHub

Once your code is on GitHub, you can:

1. **Clone it anywhere**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/airtable-enhanced-web-clipper.git
   cd airtable-enhanced-web-clipper
   npm install
   block run
   ```

2. **Share it with others** by sending them the GitHub URL

3. **Update it easily**:
   ```bash
   git add .
   git commit -m "Your update message"
   git push
   ```

## Installing the Extension from GitHub

Once on GitHub, anyone (including you) can install it:

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/airtable-enhanced-web-clipper.git
cd airtable-enhanced-web-clipper

# Install dependencies
npm install

# Run in Airtable
block run
```

The `block run` command will:
- Prompt you to log in to Airtable
- Ask which base to install it in
- Start a development server
- Open the extension in your browser

## Benefits of Using GitHub

- ✅ Easy to update and maintain
- ✅ Version control for all changes
- ✅ Can install in multiple Airtable bases
- ✅ Easy to share with team members
- ✅ Can contribute improvements over time
- ✅ Backup of your code
