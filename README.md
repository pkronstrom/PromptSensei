# AI Prompt Auto-Complete Firefox Extension

A powerful Firefox extension that allows users to quickly access and insert saved AI prompts into any text input field on web pages. Streamline your AI interactions with customizable hotkeys and text triggers.

## 🚀 Features

- **Text Trigger Activation**: Type `AI:` in any input field to display the prompt dropdown
- **Hotkey Activation**: Press `Ctrl+Shift+P` to show prompts in any focused input field
- **Keyboard Navigation**: Use arrow keys (↑/↓) to navigate through prompts
- **Quick Selection**: Press Enter to insert selected prompt or click to select
- **Escape to Close**: Press Esc to hide the dropdown anytime
- **Smart Input Detection**: Works with text inputs, textareas, and contentEditable elements
- **Customizable Settings**: Change hotkey combinations and text triggers
- **Prompt Management**: Add, edit, delete, and organize your prompt library
- **Import/Export**: Backup and share your prompt collections
- **Cross-Page Persistence**: Your prompts are available on all websites

## 📦 Installation

### Development Installation (Recommended)

1. Open Firefox and navigate to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click the **"Load Temporary Add-on"** button
4. Select the prompt-sensei-1.x.x.xpi
5. The extension will be loaded and active immediately

**Note**: This method loads the extension temporarily and it will be removed when Firefox restarts. This is the standard development approach for testing unsigned extensions.

### Future: Mozilla Add-ons Store

For permanent installation, the extension can be submitted to Mozilla's Add-ons store for review and signing. Once approved, users will be able to install it normally. The current `.xpi` file can only be installed via the debugging method above due to Firefox's security policies for unsigned extensions.

## 🎯 How to Use

### Basic Usage

1. **Focus any text input field** on any webpage
2. **Trigger the dropdown** using either method:
   - Type `AI:` followed by optional search terms
   - Press `Ctrl+Shift+P` (or your custom hotkey)
3. **Navigate and select**:
   - Use ↑/↓ arrow keys to navigate
   - Press Enter to insert the selected prompt
   - Or click directly on any prompt
4. **Close the dropdown**:
   - Press Esc key
   - Click outside the dropdown

### Text Trigger Examples

```
AI: code review
AI: explain
AI: optimize
```

The dropdown will filter prompts based on your search terms.

### Compatible Input Fields

- Standard text inputs (`<input type="text">`)
- Email, URL, search, and password inputs
- Textareas (`<textarea>`)
- ContentEditable elements
- Elements with `role="textbox"`

## ⚙️ Configuration

### Accessing Settings

1. Right-click the extension icon in Firefox toolbar
2. Select **"Options"** or **"Preferences"**
3. Or navigate to `about:addons` → Extension → **"Options"**

### Customization Options

#### Hotkey Configuration

- Click **"Change Hotkey"** button
- Press your desired key combination
- Supports Ctrl, Alt, Shift modifiers
- Examples: `Ctrl+Shift+P`, `Alt+Space`, `Ctrl+Alt+A`

#### Text Trigger Configuration

- Modify the text trigger phrase (default: `AI:`)
- Examples: `>>`, `//ai`, `prompt:`
- Leave empty to disable text trigger

#### Prompt Management

- **Add New Prompts**: Click "Add New Prompt" button
- **Edit Existing**: Click edit icon on any prompt
- **Delete Prompts**: Click delete icon with confirmation
- **Search Prompts**: Use the search bar to filter prompts
- **Export/Import**: Backup your prompts as JSON files

## 🛠️ Development

### Project Structure

```
firefox/
├── manifest.json      # Extension configuration
├── background.js      # Background script for data management
├── content.js         # Content script for page interaction
├── content.css        # Dropdown styling
├── options.html       # Settings page HTML
├── options.js         # Settings page functionality
├── options.css        # Settings page styling
└── test.html          # Testing page for development
```

### Key Components

- **AIPromptManager** (background.js): Handles data persistence and storage
- **AIPromptAutocomplete** (content.js): Manages dropdown display and user interaction
- **OptionsManager** (options.js): Provides settings interface

### Browser Compatibility

- **Minimum Firefox Version**: 57+ (Quantum)
- **Manifest Version**: 2 (compatible with current Firefox)
- **Permissions Required**: `storage`, `activeTab`, `<all_urls>`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
