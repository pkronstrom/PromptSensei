# Overview

AI Prompt Auto-Complete is a browser extension that enables users to quickly access and insert saved AI prompts into any text input field on web pages. The extension provides both hotkey and text trigger activation methods, allowing users to build a personal library of reusable prompt templates for AI interactions.

# User Preferences

Preferred communication style: Simple, everyday language.
UI preferences: Compact interface with minimal padding, technical/monospace styling for dropdowns, breathable but efficient use of space.

# System Architecture

## Extension Architecture
The system follows the standard browser extension architecture with three main components:

- **Background Script** (`background.js`): Handles data persistence, settings management, and command processing. Uses browser.storage.local for data persistence and manages the core AIPromptManager class.

- **Content Script** (`content.js`): Injected into all web pages to monitor user input, detect triggers, and display the prompt dropdown. Implements the AIPromptAutocomplete class for real-time interaction.

- **Options Page** (`options.html/js/css`): Provides a dedicated interface for managing saved prompts and configuring extension settings through the OptionsManager class.

## Data Storage
Uses browser.storage.local API for client-side data persistence. Stores settings object containing:
- Hotkey configuration (default: Ctrl+Shift+P)
- Text trigger (default: 'AI:')
- Array of saved prompts with metadata (id, name, content, created timestamp)

## User Interface Components
- **Dropdown Interface**: Dark themed, technical-style overlay with monospace font that appears over web page inputs with keyboard navigation support
- **Options Interface**: Compact settings and prompt management interface with reduced padding for efficiency  
- **Real-time Input Monitoring**: Detects text triggers and hotkey combinations across all web pages with form submission prevention
- **Export/Import System**: JSON-based backup and restore functionality for prompt libraries

## Activation Methods
Dual trigger system:
1. **Hotkey Activation**: Global keyboard shortcut (configurable)
2. **Text Trigger**: Typing specific text sequence in input fields (configurable)

## Cross-Component Communication
Uses browser.runtime messaging API for communication between background script, content scripts, and options page. Implements message broadcasting for settings updates across all active tabs.

# External Dependencies

## Browser APIs
- **browser.storage.local**: Client-side data persistence for settings and prompts
- **browser.runtime**: Inter-component messaging and extension lifecycle management
- **browser.commands**: Hotkey registration and handling
- **browser.tabs**: Tab management for cross-tab communication

## Web Standards
- **Manifest V2**: Extension configuration and permissions
- **Content Security Policy**: Security restrictions for extension execution
- **DOM APIs**: Input field detection and manipulation across web pages

No external services, databases, or third-party APIs are required. The extension operates entirely within the browser environment using local storage and native browser extension APIs.

# Recent Changes (August 2025)

## UI/UX Improvements
- Reduced padding throughout options interface for more compact design
- Updated dropdown to dark theme with monospace font for technical appearance
- Added proper form padding in modal edit dialogs
- Improved responsive design for mobile devices

## New Features
- **Export/Import Functionality**: Users can now backup and restore prompt libraries via JSON files
- **Form Submission Prevention**: Fixed critical issue where AI: text trigger would accidentally submit forms
- **Enhanced Event Handling**: Improved keyboard navigation and prevented unwanted form submissions
- **Hotkey Filtering**: Added filtering capability when using hotkey - now filters prompts based on text before cursor
- **Improved ESC Behavior**: ESC key now properly resets text trigger state, requiring full keyword to be typed again

## Technical Enhancements
- Added comprehensive form event prevention when dropdown is active
- Improved text trigger state management
- Enhanced error handling for import/export operations
- Better focus management after prompt insertion
- **Major Architecture Refactor (August 10, 2025)**: Unified dropdown mode system
  - Replaced separate text trigger and hotkey handling with unified `isInDropdownMode` state
  - Added `activateDropdownMode()` method for consistent activation from both triggers
  - Implemented `handleDropdownModeInput()` for real-time filtering after activation
  - Added `resetDropdownMode()` for proper state cleanup on ESC or focus change
  - Enhanced initialization with DOM ready checks and retry logic to fix startup delays
  - Both hotkey and text trigger now use the same filtering mechanism
  - Magic word state properly resets after prompt insertion or ESC key
  - **Smart Filtering System (August 10, 2025)**: Implemented intelligent best-match scoring
    - Score-based ranking: exact matches > starts-with > contains > word boundaries
    - Always auto-selects first (best) match for faster interaction
    - Fixed keyword reset logic to prevent flickering dropdown behavior
    - Enhanced text trigger validation to ensure proper cursor positioning