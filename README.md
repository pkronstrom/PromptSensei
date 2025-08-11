# AI Prompt Auto-Complete

A Firefox extension that lets you quickly access and insert saved AI prompts into any text input field on web pages.

![Demo](demo.gif)

## What It Does

This extension provides two ways to trigger a dropdown of your saved prompts:

1. **Text Trigger**: Type `AI:` in any input field
2. **Hotkey**: Press `Ctrl+Shift+P` while focused on any input field

Once the dropdown appears, you can:

- Navigate with arrow keys (↑/↓) or Tab/Shift+Tab
- Filter prompts by typing
- Insert prompts with Enter or mouse click
- Close with Escape or clicking outside

## Supported Input Fields

- Standard text inputs (`<input type="text">`)
- Textareas (`<textarea>`)
- ContentEditable elements (rich text editors)
- Elements with `role="textbox"`

Works on all websites with any of these input types.

## Installation

### Temporary Installation (Development)

1. Open Firefox and go to `about:debugging`
2. Click **"This Firefox"** in the sidebar
3. Click **"Load Temporary Add-on"**
4. Select the `prompt-sensei-1.0.0.xpi` file
5. The extension is now active

**Note**: Temporary installations are removed when Firefox restarts. This is the standard way to test unsigned extensions.

## Configuration

Access settings by:

- Right-clicking the extension icon → **"Options"**
- Or go to `about:addons` → Extension → **"Options"**

### Settings Available:

- **Hotkey**: Customize the key combination (default: `Ctrl+Shift+P`)
- **Text Trigger**: Change the trigger text (default: `AI:`)
- **Show instruction bar**: Toggle keyboard shortcut hints
- **Show mouse buttons**: Toggle clickable insert/back buttons
- **Prompt Management**: Add, edit, delete, and organize prompts
- **Import/Export**: Backup and restore your prompt library

## How It Works

1. **Background Script** manages data storage and settings
2. **Content Script** monitors input fields and displays the dropdown
3. **Options Page** provides the management interface

The extension uses browser storage to persist your prompts and settings across browsing sessions.

## License

MIT License
