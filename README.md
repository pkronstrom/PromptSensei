
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

### Method 1: Temporary Installation (Development)

1. Open Firefox and navigate to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click the **"Load Temporary Add-on"** button
4. Navigate to the `firefox` folder in this project
5. Select the `manifest.json` file
6. The extension will be loaded and active immediately

### Method 2: Permanent Installation

1. Navigate to `about:addons` in Firefox
2. Click the gear icon and select **"Install Add-on From File"**
3. Select the extension's `.xpi` file (if packaged)
4. Click **"Add"** to install permanently

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

## 📝 Sample Prompts

Here are some useful prompts to get you started:

### Code-Related Prompts

**Code Review**
```
Please review this code for potential improvements, bugs, and best practices. Focus on:
- Code efficiency and performance
- Security vulnerabilities
- Maintainability and readability
- Error handling
```

**Explain Code**
```
Please explain what this code does in simple terms. Break down:
- The main purpose and functionality
- Key components and their roles
- How the different parts work together
```

**Debug Help**
```
Help me identify and fix the bug in this code. Please:
- Analyze the code for potential issues
- Suggest specific fixes
- Explain why the bug occurs
```

### Writing Prompts

**Improve Writing**
```
Please improve this text for clarity, grammar, and style. Make it more:
- Professional and polished
- Clear and concise
- Engaging for the target audience
```

**Summarize Content**
```
Please provide a concise summary of this content, highlighting:
- Key points and main ideas
- Important details and findings
- Actionable insights or conclusions
```

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

### Testing

1. Load the extension in development mode
2. Open `firefox/test.html` in your browser
3. Test both hotkey and text trigger functionality
4. Verify dropdown appears and prompts can be inserted

## 🔧 Troubleshooting

### Common Issues

**Dropdown not appearing**
- Ensure the input field is properly focused
- Check if hotkey conflicts with browser shortcuts
- Verify extension is properly loaded in `about:debugging`

**Prompts not inserting**
- Make sure you have prompts saved in settings
- Check if the target input field supports text insertion
- Try refreshing the page and testing again

**Settings not saving**
- Check browser permissions for local storage
- Ensure extension has proper permissions
- Try reloading the extension

### Browser Compatibility

- **Minimum Firefox Version**: 57+ (Quantum)
- **Manifest Version**: 2 (compatible with current Firefox)
- **Permissions Required**: `storage`, `activeTab`, `<all_urls>`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

If you encounter any issues or have suggestions:

1. Check the troubleshooting section above
2. Review existing issues in the repository
3. Create a new issue with detailed information about the problem

---

**Happy prompting! 🎉**
