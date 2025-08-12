// Content script for input monitoring and dropdown display
class AIPromptAutocomplete {
  constructor() {
    // Constants
    this.ACTIVATION_DELAY = 10;
    this.FOCUS_DELAY = 10;
    this.settings = {
      hotkey: 'Ctrl+Shift+P',
      textTrigger: 'AI:',
      prompts: []
    };
    this.activeInput = null;
    this.dropdown = null;
    this.selectedIndex = -1;
    this.filteredPrompts = [];
    this.isDropdownVisible = false;
    this.isInDropdownMode = false; // Unified mode for both hotkey and text trigger
    this.dropdownModeStartPosition = -1;
    this.dropdownModeType = null; // 'hotkey' or 'textTrigger'
    this.dropdownModeLastCursorPos = -1;
    this.justInsertedPrompt = false;

    // Placeholder form state
    this.isInPlaceholderMode = false;
    this.currentPromptContent = '';
    this.placeholders = [];
    this.placeholderValues = {};
    this.currentPlaceholderIndex = 0;

    // Internal guards to avoid duplicate registrations
    this._eventsRegistered = false;
    this._messageRegistered = false;

    // Register message listener immediately so early background messages are not missed
    if (!this._messageRegistered) {
      try {
        browser.runtime.onMessage.addListener((message) => this.handleMessage(message));
        this._messageRegistered = true;
      } catch (_) {}
    }

    // Register DOM/input listeners immediately
    if (!this._eventsRegistered) {
      this.setupEventListeners();
      this._eventsRegistered = true;
    }

    // Ensure DOM is ready before any DOM-dependent operations, but don't block overall init
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      // DOM already loaded, init immediately
      this.init();
    }
  }

  async init() {
    try {
      // Proceed as soon as the DOM is at least interactive to avoid long delays on SPA pages
      await this.waitForDOM();

      // Load settings from background (non-blocking defaults already set)
      let retries = 5;
      while (retries > 0) {
        const s = await this.sendMessage({ action: 'getSettings' });
        if (s) {
          this.settings = s;
          break;
        }
        retries--;
        if (retries > 0) await new Promise(r => setTimeout(r, 200));
      }

      // Small delay to ensure page is fully rendered
      await new Promise(resolve => setTimeout(resolve, 50));

    } catch (error) {
      console.error('Error initializing AI Prompt Extension:', error);
      // Retry initialization after a delay
      setTimeout(() => this.init(), 1000);
    }
  }

  async waitForDOM() {
    return new Promise((resolve) => {
      const ready = document.readyState;
      if (ready === 'interactive' || ready === 'complete' || document.body) {
        resolve();
      } else {
        const checkReady = () => {
          const rs = document.readyState;
          if (rs === 'interactive' || rs === 'complete' || document.body) {
            resolve();
          } else {
            setTimeout(checkReady, 25);
          }
        };
        checkReady();
      }
    });
  }

  async sendMessage(message) {
    try {
      return await browser.runtime.sendMessage(message);
    } catch (error) {
      console.error('Error sending message:', error);
      return null;
    }
  }

  /**
   * Universal check if an element is editable (works for all input types and editors)
   * @param {Element} element - The element to check
   * @returns {boolean} True if it's editable
   */
  isEditableElement(element) {
    if (!element) return false;
    
    // Standard form inputs
    if (element.tagName === 'INPUT' && ['text', 'search', 'url', 'email', 'password'].includes(element.type)) {
      return true;
    }
    if (element.tagName === 'TEXTAREA') {
      return true;
    }
    
    // Any contenteditable element (covers all rich text editors)
    if (element.isContentEditable) {

      return true;
    }
    
    // Role textbox (accessibility standard)
    if (element.getAttribute && element.getAttribute('role') === 'textbox') {
      return true;
    }
    
    return false;
  }

  /**
   * Find the currently active editable element using focus and selection fallback
   * @returns {Element|null} The active editable element or null
   */
  findActiveEditableElement() {
    // Prefer the currently focused element
    let target = document.activeElement;
    let editable = this.isInputElement(target) ? this.getEditableRoot(target) : null;

    // Fallback: use current selection's editable root if focus isn't on an input/editor
    if (!editable) {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.anchorNode) {
        const anchorEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
        editable = this.getEditableRoot(anchorEl);
      }
    }

    return editable;
  }

  handleMessage(message) {
    switch (message.action) {
      case 'showPromptDropdown':
        // Toggle dropdown: hide if visible, show if hidden
        if (this.isDropdownVisible) {
          this.resetDropdownMode();
        } else {
          const editable = this.findActiveEditableElement();
          if (editable) {
            this.activeInput = editable;
            setTimeout(() => { this.activateDropdownMode('hotkey'); }, this.ACTIVATION_DELAY);
          }
        }
        break;

      case 'settingsUpdated':
        this.settings = message.settings;
        break;
    }
  }

  setupEventListeners() {
    // Monitor all input fields
    document.addEventListener('focusin', (e) => {
      const editableRoot = this.getEditableRoot(e.target);
      
      if (editableRoot && !this.isPlaceholderInput(e.target)) {
        // Simply track the active input
        this.activeInput = editableRoot;
      }
    });

    document.addEventListener('focusout', (e) => {
      // Don't handle focusout when in placeholder mode at all
      if (this.isInPlaceholderMode) {
        return;
      }
      
      // Only handle focusout for the main input
      if (e.target === this.activeInput) {
        setTimeout(() => {
          if (!this.shouldKeepDropdownOpen()) {
            this.resetDropdownMode();
            this.activeInput = null;
          }
        }, 100);
      }
    });

    // Handle keyboard events - use normal bubbling phase to not interfere with other handlers
    document.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    document.addEventListener('input', (e) => {
      if (this.isInputElement(e.target) && !this.isPlaceholderInput(e.target)) {
        this.handleInput(e);
      }
    });

    // Listen for keyup events as a fallback for editors that don't fire input events reliably
    document.addEventListener('keyup', (e) => {
      if (e.target.getAttribute && e.target.getAttribute('data-lexical-editor') === 'true') {
        // Only handle text keys, not navigation keys
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
          if (this.isInputElement(e.target) && !this.isPlaceholderInput(e.target)) {
            this.handleInput(e);
          }
        }
      }
    });

    // Handle clicks outside dropdown
    document.addEventListener('click', (e) => {
      if (this.dropdown && !this.dropdown.contains(e.target) && e.target !== this.activeInput) {
        
        this.hideDropdown();
      }
    });
  }

  isInputElement(element) {
    const editableRoot = this.getEditableRoot(element);
    return Boolean(editableRoot);
  }

  /**
   * Find the root editable element for a given element, handling various editor types
   * @param {Element} element - The element to check
   * @returns {Element|null} The root editable element or null
   */
  getEditableRoot(element) {
    if (!element) return null;

    // Check if element itself is editable
    if (this.isEditableElement(element)) {
      // For contenteditable, find the root contenteditable element
      if (element.isContentEditable) {
        let root = element;
        while (root.parentElement && root.parentElement.isContentEditable) {
          root = root.parentElement;
        }
        return root;
      }
      return element;
    }

    // Look for hidden textarea that might have a visible contenteditable sibling
    if (element.tagName === 'TEXTAREA') {
      try {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 2 && rect.height <= 2) {
          // Tiny textarea, look for contenteditable in the same container
          const container = element.closest('form, .editor-container, [role="main"]') || element.parentElement;
          if (container) {
            const ce = container.querySelector('[contenteditable="true"]:not([aria-hidden="true"])');
            if (ce) return ce;
          }
        }
      } catch {}
    }

    // Traverse ancestors to find an editable element
    let current = element.parentElement;
    while (current) {
      if (this.isEditableElement(current)) {
        if (current.isContentEditable) {
          let root = current;
          while (root.parentElement && root.parentElement.isContentEditable) {
            root = root.parentElement;
          }
          return root;
        }
        return current;
      }
      current = current.parentElement;
    }
    
    return null;
  }

  handleKeydown(e) {
    // Handle placeholder mode first
    if (this.isInPlaceholderMode) {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          this.insertPromptWithPlaceholders();
          return false;

        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            this.navigateToPreviousPlaceholder();
          } else {
            this.navigateToNextPlaceholder();
          }
          return false;

        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          this.navigateToNextPlaceholder();
          return false;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          this.navigateToPreviousPlaceholder();
          return false;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.exitPlaceholderMode();
          return false;
      }
      return;
    }

    // Handle custom hotkey - only when focused on an editable element
    if (this.matchesHotkey(e, this.settings?.hotkey)) {
      const editable = this.findActiveEditableElement();
      if (editable) {
        e.preventDefault();
        e.stopPropagation();
        
        // Toggle dropdown: hide if visible, show if hidden
        if (this.isDropdownVisible) {
          this.resetDropdownMode();
        } else {
          this.activeInput = editable;
          setTimeout(() => { this.activateDropdownMode('hotkey'); }, this.ACTIVATION_DELAY);
        }
        return false;
      }
      // If not focused on an editable element, let the event proceed normally
      return;
    }

    // When dropdown is visible, completely intercept ALL Enter events
    if (this.isDropdownVisible && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (this.selectedIndex >= 0 && this.filteredPrompts[this.selectedIndex]) {
        this.insertSelectedPrompt();
      } else if (this.filteredPrompts.length > 0) {
        // If no item selected, select the first one
        this.selectedIndex = 0;
        this.updateSelection();
        this.insertSelectedPrompt();
      }
      return false;
    }



    // Handle dropdown navigation
    if (this.isDropdownVisible) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          this.selectNext();
          return false;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          this.selectPrevious();
          return false;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          if (this.isInPlaceholderMode) {
            this.exitPlaceholderMode();
          } else {
            this.hideDropdown();
            // Reset dropdown mode completely
            this.resetDropdownMode();
          }
          return false;
      }
    }
  }

  handleInput(e) {
    if (!this.settings) return;

    const input = e.target;
    const value = this.getInputValue(input);
    const cursorPos = this.getCursorPosition(input);



    if (this.isInDropdownMode) {
      // In dropdown mode - filter prompts based on current input
      this.handleDropdownModeInput(value, cursorPos);
    } else {
      // Check for text trigger to activate dropdown mode
      this.checkTextTrigger(value, cursorPos);
    }
  }

  checkTextTrigger(value, cursorPos) {
    const trigger = this.settings.textTrigger;
    if (!trigger) return;

    const beforeCursor = value.substring(0, cursorPos);
    const triggerIndex = beforeCursor.lastIndexOf(trigger);

    if (triggerIndex !== -1) {
      // Check if trigger is at word boundary and cursor is after the trigger
      const isValidTrigger = triggerIndex === 0 || /\s/.test(beforeCursor[triggerIndex - 1]);
      const cursorAfterTrigger = cursorPos >= triggerIndex + trigger.length;

      if (isValidTrigger && cursorAfterTrigger) {
        // Activate dropdown mode with text trigger
        this.activateDropdownMode('textTrigger', triggerIndex);
        return;
      }
    }
  }

  activateDropdownMode(type, startPosition = null) {
    if (!this.settings?.prompts?.length) {
      this.showNoPromptsMessage();
      return;
    }

    this.isInDropdownMode = true;
    this.dropdownModeType = type;
    
    if (type === 'hotkey') {
      const cursorPos = this.getCursorPosition(this.activeInput);
      this.dropdownModeLastCursorPos = cursorPos;
      const value = this.getInputValue(this.activeInput);
      const beforeCursor = value.substring(0, cursorPos);
      
      // For hotkey, start filtering from the last word
      const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
      this.dropdownModeStartPosition = lastSpaceIndex + 1;
      
      // Always show all prompts initially when triggered by hotkey
      this.filterAndShowPromptsWithBestMatch('');
    } else if (type === 'textTrigger') {
      this.dropdownModeStartPosition = startPosition + this.settings.textTrigger.length;
      
      // Get text after trigger for filtering
      const value = this.getInputValue(this.activeInput);
      const cursorPos = this.getCursorPosition(this.activeInput);
      this.dropdownModeLastCursorPos = cursorPos;
      const afterTrigger = value.substring(this.dropdownModeStartPosition, cursorPos);
      this.filterAndShowPromptsWithBestMatch(afterTrigger);
    }
  }

  handleDropdownModeInput(value, cursorPos) {
    
    // Track last known cursor position while in dropdown mode (used after placeholder collection)
    this.dropdownModeLastCursorPos = cursorPos;
    
    // If cursor moved before start position, exit dropdown mode
    if (cursorPos < this.dropdownModeStartPosition) {
      
      this.resetDropdownMode();
      return;
    }
    
    // For text trigger, validate the trigger is still present
    if (this.dropdownModeType === 'textTrigger') {
      const trigger = this.settings.textTrigger;
      const triggerStart = this.dropdownModeStartPosition - trigger.length;
      const triggerText = value.substring(triggerStart, this.dropdownModeStartPosition);
      
      if (triggerText !== trigger) {
        
        this.resetDropdownMode();
        return;
      }
    }
    
    // Extract the filter text from the start position to cursor
    const filterText = value.substring(this.dropdownModeStartPosition, cursorPos);
    
    // Filter prompts based on current text (including empty text to show all)
    this.filterAndShowPromptsWithBestMatch(filterText);
  }

  resetDropdownMode() {
    this.isInDropdownMode = false;
    this.dropdownModeType = null;
    this.dropdownModeStartPosition = -1;
    this.dropdownModeLastCursorPos = -1;
    this.resetPlaceholderMode();
    this.hideDropdown();
    // Reset filter to show all prompts on next activation
    this.filteredPrompts = [];
  }

  resetPlaceholderMode() {
    this.isInPlaceholderMode = false;
    this.currentPromptContent = '';
    this.placeholders = [];
    this.placeholderValues = {};
    this.currentPlaceholderIndex = 0;
  }

  showPlaceholderForm(promptContent, placeholders) {

    
    // Set placeholder mode first to prevent focus handling issues
    this.isInPlaceholderMode = true;
    this.currentPromptContent = promptContent;
    this.placeholders = placeholders;
    this.currentPlaceholderIndex = 0;
    this.placeholderValues = {};
    
    // Initialize placeholder values with defaults
    placeholders.forEach(placeholder => {
      this.placeholderValues[placeholder.name] = placeholder.defaultValue;
    });
    
    // Temporarily disable focus event handling
    const originalHandleFocusOut = this.handleFocusOut;
    this.handleFocusOut = () => {};
    
    this.renderPlaceholderForm();
    this.positionDropdown();
    
    // Re-enable focus handling and focus after rendering is complete
    setTimeout(() => {
      this.handleFocusOut = originalHandleFocusOut;
      this.focusCurrentPlaceholder();
    }, 50);
  }

  renderPlaceholderForm() {
    this.dropdown.innerHTML = '';
    this.dropdown.className = 'ai-prompt-dropdown placeholder-mode';
    const scroll = document.createElement('div');
    scroll.className = 'ai-scroll';

    // Add prompt name header for context
    const nameHeader = document.createElement('div');
    nameHeader.className = 'placeholder-prompt-name';
    
    // Add back button (if mouse buttons enabled)
    if (this.settings?.showMouseButtons !== false) {
      const backBtn = document.createElement('button');
      backBtn.className = 'placeholder-back-btn';
      backBtn.innerHTML = '‹';
      backBtn.title = 'Back to prompts';
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.exitPlaceholderMode();
      });
      nameHeader.appendChild(backBtn);
    }
    
    // Add prompt title
    const titleSpan = document.createElement('span');
    titleSpan.className = 'placeholder-prompt-title';
    const currentPrompt = this.filteredPrompts[this.selectedIndex];
    titleSpan.textContent = currentPrompt ? currentPrompt.name : 'Prompt';
    nameHeader.appendChild(titleSpan);
    
    scroll.appendChild(nameHeader);
    
    // Create preview section
    const previewSection = document.createElement('div');
    previewSection.className = 'placeholder-preview';
    
    const previewContent = document.createElement('div');
    previewContent.className = 'placeholder-preview-content';
    previewContent.id = 'placeholder-preview-text';
    
    previewSection.appendChild(previewContent);
    scroll.appendChild(previewSection);
    
    // Create form section
    const formSection = document.createElement('div');
    formSection.className = 'placeholder-form';
    
    this.placeholders.forEach((placeholder, index) => {
      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'placeholder-field';
      if (index === this.currentPlaceholderIndex) {
        fieldDiv.classList.add('active');
      }
      
      // Create label
      const label = document.createElement('div');
      label.className = 'placeholder-label';
      label.textContent = placeholder.name;
      label.title = placeholder.name; // Full text on hover tooltip
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'placeholder-input';
      input.value = this.placeholderValues[placeholder.name] || '';
      input.placeholder = placeholder.defaultValue || 'Enter value...';
      input.setAttribute('data-placeholder-name', placeholder.name);
      input.setAttribute('data-placeholder-index', index);
      
      fieldDiv.appendChild(label);
      fieldDiv.appendChild(input);
      formSection.appendChild(fieldDiv);
      
      // Add input event listener for real-time preview
      input.addEventListener('input', (e) => {
        this.placeholderValues[placeholder.name] = e.target.value;
        this.updatePreview();
      });
      
      input.addEventListener('focus', () => {
        this.currentPlaceholderIndex = index;
        this.updateActiveField();
        this.updatePreview();
      });
    });
    
    scroll.appendChild(formSection);
    
    // Add action buttons (if enabled)
    if (this.settings?.showMouseButtons !== false) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'placeholder-actions';
      
      const insertBtn = document.createElement('button');
      insertBtn.className = 'placeholder-insert-btn';
      insertBtn.textContent = 'Insert';
      insertBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.insertPromptWithPlaceholders();
      });
      
      actionsDiv.appendChild(insertBtn);
      scroll.appendChild(actionsDiv);
    }
    
    // Add instructions (if enabled)
    if (this.settings?.showInfoBar !== false) {
      const instructions = document.createElement('div');
      instructions.className = 'placeholder-instructions';
      instructions.innerHTML = 'Tab/Shift+Tab or ↑/↓ to navigate • Enter to insert • Esc to go back';
      scroll.appendChild(instructions);
    }
    this.dropdown.appendChild(scroll);
    
    this.updatePreview();
  }

  updatePreview() {
    const previewElement = document.getElementById('placeholder-preview-text');
    if (!previewElement) return;
    
    let preview = this.currentPromptContent;

    // Replace all placeholders with their values, and only wrap the actual placeholder positions
    this.placeholders.forEach((placeholder, index) => {
      const name = placeholder.name;
      const valueRaw = this.placeholderValues[name] || placeholder.defaultValue || `[${name}]`;
      const value = this.escapeHtml(valueRaw);

      const wrapIfCurrent = (match) => {
        return index === this.currentPlaceholderIndex
          ? `<span class="current-placeholder" id="current-placeholder-highlight">${value}</span>`
          : value;
      };

      // Replace both bracket and brace syntaxes for this placeholder name
      const bracketRegex = new RegExp(`\\[${this.escapeRegex(name)}(?::[^\\]]*)?\\]`, 'g');
      const braceRegex = new RegExp(`\\{${this.escapeRegex(name)}(?::[^\\}]*)?\\}`, 'g');
      preview = preview.replace(bracketRegex, wrapIfCurrent).replace(braceRegex, wrapIfCurrent);
    });

    previewElement.innerHTML = preview;
    
    // Scroll the current placeholder into view
    this.scrollCurrentPlaceholderIntoView();
  }

  /**
   * Scroll the currently highlighted placeholder into view in the preview
   */
  scrollCurrentPlaceholderIntoView() {
    const currentHighlight = document.getElementById('current-placeholder-highlight');
    const previewContainer = document.getElementById('placeholder-preview-text');
    
    if (currentHighlight && previewContainer) {
      // Use a small delay to ensure the DOM has updated
      setTimeout(() => {
        currentHighlight.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }, 10);
    }
  }

  updateActiveField() {
    const fields = this.dropdown.querySelectorAll('.placeholder-field');
    fields.forEach((field, index) => {
      field.classList.toggle('active', index === this.currentPlaceholderIndex);
    });
  }

  focusCurrentPlaceholder() {
    // Use double requestAnimationFrame for more stable focus
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const activeInput = this.dropdown.querySelector(`.placeholder-input[data-placeholder-index="${this.currentPlaceholderIndex}"]`);
        if (activeInput) {
          // Ensure the input is ready for focus
          if (activeInput.offsetParent !== null) {
            activeInput.focus();
            activeInput.select();
          } else {
            // Retry if element isn't rendered yet
            setTimeout(() => this.focusCurrentPlaceholder(), 10);
          }
        }
      });
    });
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if an event matches the configured hotkey, with cross-platform modifier support
   * @param {KeyboardEvent} event - The keyboard event
   * @param {string} hotkey - The hotkey string (e.g., "Ctrl+Shift+P", "Mod+P")
   * @returns {boolean} True if the event matches the hotkey
   */
  matchesHotkey(event, hotkey) {
    if (!hotkey) return false;

    // Normalize hotkey string
    const normalize = (s) => s.trim().toLowerCase();
    const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent || '');

    // Split and normalize tokens
    const rawTokens = hotkey.split('+').map(normalize);

    // Map synonyms and MOD pseudo key
    const mappedTokens = rawTokens.map(t => {
      if (t === 'mod') return isMac ? 'meta' : 'ctrl';
      if (t === 'cmd') return 'meta';
      if (t === 'command') return 'meta';
      if (t === 'control') return 'ctrl';
      if (t === 'option') return 'alt';
      return t;
    });

    const modifiers = mappedTokens.slice(0, -1);
    const mainKey = mappedTokens[mappedTokens.length - 1];

    const eventKey = (event.key || '').toLowerCase();

    // Required modifier states
    const requireCtrl = modifiers.includes('ctrl');
    const requireShift = modifiers.includes('shift');
    const requireAlt = modifiers.includes('alt');
    const requireMeta = modifiers.includes('meta');

    // No extra modifiers allowed beyond required
    const hasOnlyRequiredModifiers = (
      (!!event.ctrlKey === requireCtrl) &&
      (!!event.shiftKey === requireShift) &&
      (!!event.altKey === requireAlt) &&
      (!!event.metaKey === requireMeta)
    );

    // Main key match (normalize single letters to lower case)
    const mainKeyMatches = eventKey === mainKey;

    // Special case: if the saved hotkey uses ctrl on macOS but user presses meta, allow it
    const ctrlMetaCompat = isMac && requireCtrl && !requireMeta && event.metaKey && !event.ctrlKey;

    return mainKeyMatches && (hasOnlyRequiredModifiers || ctrlMetaCompat);
  }



  filterAndShowPrompts(query) {
    if (!this.settings?.prompts?.length) {
      this.showNoPromptsMessage();
      return;
    }

    this.filteredPrompts = this.settings.prompts.filter(prompt =>
      prompt.name.toLowerCase().includes(query.toLowerCase()) ||
      prompt.content.toLowerCase().includes(query.toLowerCase())
    );

    // Only create dropdown if it doesn't exist yet
    if (!this.dropdown || !this.isDropdownVisible) {
      this.createDropdown();
      this.positionDropdown();
      this.isDropdownVisible = true;
    }
    
    // Always re-render content, but don't recreate/reposition
    this.renderDropdown();
  }

  filterAndShowPromptsWithBestMatch(query) {
    if (!this.settings?.prompts?.length) {
      this.showNoPromptsMessage();
      return;
    }

    const queryLower = query.toLowerCase().trim();

    if (!queryLower) {
      // No query - show all prompts
      this.filteredPrompts = [...this.settings.prompts];
    } else {
      // Score-based matching for better results
      const scoredPrompts = this.settings.prompts.map(prompt => {
        const nameLower = prompt.name.toLowerCase();
        const contentLower = prompt.content.toLowerCase();
        
        let score = 0;
        
        // Exact matches get highest score
        if (nameLower === queryLower) score += 1000;
        if (contentLower === queryLower) score += 500;
        
        // Starts with matches get high score
        if (nameLower.startsWith(queryLower)) score += 100;
        if (contentLower.startsWith(queryLower)) score += 50;
        
        // Contains matches get lower score
        if (nameLower.includes(queryLower)) score += 10;
        if (contentLower.includes(queryLower)) score += 5;
        
        // Word boundary matches get bonus
        const nameWords = nameLower.split(/\s+/);
        const contentWords = contentLower.split(/\s+/);
        
        if (nameWords.some(word => word.startsWith(queryLower))) score += 25;
        if (contentWords.some(word => word.startsWith(queryLower))) score += 15;
        
        return { prompt, score };
      }).filter(item => item.score > 0);

      // Sort by score (highest first) and extract prompts
      this.filteredPrompts = scoredPrompts
        .sort((a, b) => b.score - a.score)
        .map(item => item.prompt);
    }

    // Only create dropdown if it doesn't exist yet
    if (!this.dropdown || !this.isDropdownVisible) {
      this.createDropdown();
      this.positionDropdown();
      this.isDropdownVisible = true;
    }
    
    // Always re-render content, but don't recreate/reposition
    this.renderDropdown();
    
    // Auto-select first item
    if (this.filteredPrompts.length > 0) {
      this.selectedIndex = 0;
      this.updateSelection();
    }
  }

  createDropdown() {
    if (this.dropdown) {
      this.dropdown.remove();
    }

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'ai-prompt-dropdown';
    this.dropdown.setAttribute('role', 'listbox');
    
    // Pre-position off-screen to prevent jitter
    this.dropdown.style.position = 'absolute';
    this.dropdown.style.top = '-9999px';
    this.dropdown.style.left = '-9999px';
    this.dropdown.style.opacity = '0';
    
    // Ensure mouse wheel scrolling works properly
    this.dropdown.addEventListener('wheel', (e) => {
      e.stopPropagation();
      // Let the scroll container handle the wheel event
      const scrollContainer = this.dropdown.querySelector('.ai-scroll');
      if (scrollContainer) {
        scrollContainer.scrollTop += e.deltaY;
      }
    }, { passive: true });
    
    document.body.appendChild(this.dropdown);
  }

  renderDropdown() {
    this.dropdown.innerHTML = '';
    // Create inner scroll container to preserve rounded corners on scrollbar
    const scroll = document.createElement('div');
    scroll.className = 'ai-scroll';
    
    if (this.filteredPrompts.length === 0) {
      this.selectedIndex = -1;
      const noResults = document.createElement('div');
      noResults.className = 'ai-prompt-no-results';
      noResults.textContent = 'No prompts found';
      scroll.appendChild(noResults);
      this.dropdown.appendChild(scroll);
      return;
    }

    // Auto-select first item
    this.selectedIndex = 0;

    this.filteredPrompts.forEach((prompt, index) => {
      const item = document.createElement('div');
      item.className = 'ai-prompt-item';
      item.setAttribute('role', 'option');
      item.setAttribute('data-index', index);

      const name = document.createElement('div');
      name.className = 'ai-prompt-name';
      name.textContent = prompt.name;

      const preview = document.createElement('div');
      preview.className = 'ai-prompt-preview';

      // Clean up the content: trim, remove empty lines, and normalize whitespace
      const cleanContent = prompt.content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const maxLength = 100;
      const truncated = cleanContent.length > maxLength 
        ? cleanContent.substring(0, maxLength).trim() + '...'
        : cleanContent;

      preview.textContent = truncated;

      item.appendChild(name);
      item.appendChild(preview);

      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectedIndex = index;
        this.insertSelectedPrompt();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });

      scroll.appendChild(item);
    });
    
    // Apply visual selection to the first item
    this.updateSelection();
    this.dropdown.appendChild(scroll);
  }

  positionDropdown() {
    if (!this.dropdown) return;

    // Use single requestAnimationFrame for smoother positioning
    requestAnimationFrame(() => {
      let top, left, width;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const documentHeight = document.documentElement.scrollHeight;
      const currentScrollY = window.scrollY;

      // Get dropdown dimensions early for better collision detection
      const dropdownHeight = this.dropdown.offsetHeight || 300; // fallback estimate
      
      // For contenteditable elements, try to use caret position for better UX
      // For input/textarea, use element bounds
      let targetRect;
      
      if (this.activeInput && (this.activeInput.isContentEditable || this.activeInput.contentEditable === 'true')) {
        // Try to get caret position for contenteditable elements
        targetRect = this.getCaretClientRect(this.activeInput);
        // Fallback to input rect if caret rect fails
        if (!targetRect) {
          try {
            targetRect = this.activeInput.getBoundingClientRect();
          } catch (e) {
            targetRect = null;
          }
        }
      } else {
        // For input/textarea, always use element rect
        try {
          targetRect = this.activeInput ? this.activeInput.getBoundingClientRect() : null;
        } catch (e) {
          targetRect = null;
        }
      }

      if (targetRect) {
        const spaceBelow = viewportHeight - targetRect.bottom;
        const spaceAbove = targetRect.top;
        const dropdownWidth = this.dropdown.offsetWidth || Math.max(300, targetRect.width);
        
        // Check if dropdown would cause page scrolling or extend beyond viewport
        const wouldCauseScroll = (targetRect.bottom + dropdownHeight + 20 + currentScrollY) > documentHeight;
        const insufficientSpaceBelow = spaceBelow < (dropdownHeight + 20);
        const sufficientSpaceAbove = spaceAbove > (dropdownHeight + 20);
        
        if ((wouldCauseScroll || insufficientSpaceBelow) && sufficientSpaceAbove) {
          // Position above target with extra margin to avoid interference
          top = targetRect.top + window.scrollY - dropdownHeight - 8;
        } else {
          // Position below target (default)
          top = targetRect.bottom + window.scrollY + 4;
        }
        
        left = targetRect.left + window.scrollX;
        width = Math.max(300, targetRect.width);

        // Adjust horizontal position if it would overflow viewport
        if (left + dropdownWidth > viewportWidth) {
          left = targetRect.right + window.scrollX - dropdownWidth;
        }
      } else {
        // Ultimate fallback - center in viewport
        left = Math.max(10, (viewportWidth - 300) / 2);
        top = window.scrollY + Math.max(10, (viewportHeight - dropdownHeight) / 2);
        width = 300;
      }

      // Clamp within viewport bounds to prevent any scrollbar creation
      left = Math.max(10, Math.min(left, viewportWidth - 10));
      top = Math.max(currentScrollY + 10, Math.min(top, currentScrollY + viewportHeight - dropdownHeight - 10));

      // Apply positioning and make visible in one go
      this.dropdown.style.top = `${top}px`;
      this.dropdown.style.left = `${left}px`;
      this.dropdown.style.width = `${width}px`;
      this.dropdown.style.zIndex = '10000';
      this.dropdown.style.opacity = '1';
    });
  }

  getCaretClientRect(root) {
    if (!root) return null;

    // Inputs and textareas: no caret rect API; fall back to element rect
    if (root.tagName === 'INPUT' || root.tagName === 'TEXTAREA') {
      try {
        const r = root.getBoundingClientRect();
        return r.width || r.height ? r : null;
      } catch { return null; }
    }

    // Contenteditable: use selection
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return null;

    // Try direct rect
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) return rect;

    // If collapsed in empty line, use a temporary marker element
    if (range.collapsed) {
      const marker = document.createElement('span');
      marker.textContent = '\u200b'; // zero-width space
      marker.style.display = 'inline-block';
      marker.style.width = '0px';
      marker.style.height = '1em';
      marker.style.padding = '0';
      marker.style.margin = '0';
      marker.style.lineHeight = '1';

      const tempRange = range.cloneRange();
      try {
        tempRange.insertNode(marker);
        const markerRect = marker.getBoundingClientRect();
        marker.parentNode && marker.parentNode.removeChild(marker);
        return markerRect && (markerRect.width || markerRect.height) ? markerRect : null;
      } catch {
        try { marker.parentNode && marker.parentNode.removeChild(marker); } catch {}
        return null;
      }
    }

    // Fallback: first client rect
    const rects = range.getClientRects();
    return rects && rects.length ? rects[0] : null;
  }

  // Map character offsets within a contenteditable root to a DOM Range
  setSelectionByOffsets(root, startOffset, endOffset) {
    const selection = window.getSelection();
    if (!selection) return;

    const [startNode, startPos] = this.findNodeAtCharacterOffset(root, startOffset);
    const [endNode, endPos] = this.findNodeAtCharacterOffset(root, endOffset);

    if (!startNode || !endNode) return;

    const range = document.createRange();
    range.setStart(startNode, startPos);
    range.setEnd(endNode, endPos);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  findNodeAtCharacterOffset(root, targetOffset) {
    let remaining = Math.max(0, targetOffset);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      const len = node.nodeValue ? node.nodeValue.length : 0;
      if (remaining <= len) {
        return [node, remaining];
      }
      remaining -= len;
      node = walker.nextNode();
    }
    // If beyond end, return last valid position by walking backward
    let lastNode = null;
    const walker2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker2.nextNode()) {
      lastNode = walker2.currentNode;
    }
    return lastNode ? [lastNode, (lastNode.nodeValue || '').length] : [null, 0];
  }

  selectNext() {
    if (this.selectedIndex < this.filteredPrompts.length - 1) {
      this.selectedIndex++;
      this.updateSelection();
    }
  }

  selectPrevious() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.updateSelection();
    } else if (this.selectedIndex === -1 && this.filteredPrompts.length > 0) {
      this.selectedIndex = this.filteredPrompts.length - 1;
      this.updateSelection();
    }
  }

  updateSelection() {
    const items = this.dropdown.querySelectorAll('.ai-prompt-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });

    // Scroll selected item into view
    if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
      items[this.selectedIndex].scrollIntoView({ 
        block: 'nearest', 
        behavior: 'smooth' 
      });
    }
  }

  insertSelectedPrompt() {
    if (this.selectedIndex >= 0 && this.filteredPrompts[this.selectedIndex]) {
      const prompt = this.filteredPrompts[this.selectedIndex];
      const placeholders = this.extractPlaceholders(prompt.content);
      

      
      if (placeholders.length > 0) {
        // Switch to placeholder collection phase
        this.showPlaceholderForm(prompt.content, placeholders);
      } else {
        // No placeholders - insert immediately
        this.insertPrompt(prompt.content);
      }
    }
  }

  extractPlaceholders(content) {
    const placeholders = [];
    const seen = new Set();
    
    // Match both [name] and [name:default] syntax
    const bracketRegex = /\[([^:\]]+)(?::([^\]]*))?\]/g;
    let match;
    
    while ((match = bracketRegex.exec(content)) !== null) {
      const name = match[1].trim();
      const defaultValue = match[2] || '';
      const fullMatch = match[0];
      
      if (!seen.has(name)) {
        placeholders.push({ name, defaultValue, syntax: 'bracket', fullMatch });
        seen.add(name);
      }
    }
    
    // Match both {name} and {name:default} syntax
    const braceRegex = /\{([^:\}]+)(?::([^\}]*))?\}/g;
    
    while ((match = braceRegex.exec(content)) !== null) {
      const name = match[1].trim();
      const defaultValue = match[2] || '';
      const fullMatch = match[0];
      
      if (!seen.has(name)) {
        placeholders.push({ name, defaultValue, syntax: 'brace', fullMatch });
        seen.add(name);
      }
    }
    
    return placeholders;
  }

  navigateToNextPlaceholder() {
    if (this.currentPlaceholderIndex < this.placeholders.length - 1) {
      this.currentPlaceholderIndex++;
      this.updateActiveField();
      this.focusCurrentPlaceholder();
      this.updatePreview();
    }
  }

  navigateToPreviousPlaceholder() {
    if (this.currentPlaceholderIndex > 0) {
      this.currentPlaceholderIndex--;
      this.updateActiveField();
      this.focusCurrentPlaceholder();
      this.updatePreview();
    }
  }

  exitPlaceholderMode() {
    this.resetPlaceholderMode();
    // Reset dropdown class from placeholder-mode
    if (this.dropdown) {
      this.dropdown.className = 'ai-prompt-dropdown';
    }
    // Go back to prompt selection
    this.filterAndShowPromptsWithBestMatch('');
  }

  insertPromptWithPlaceholders() {
    let finalContent = this.currentPromptContent;
    
    // Replace all placeholders with their values
    this.placeholders.forEach(placeholder => {
      const value = this.placeholderValues[placeholder.name] || placeholder.defaultValue || '';
      const regex = placeholder.syntax === 'bracket' 
        ? new RegExp(`\\[${this.escapeRegex(placeholder.name)}(?::[^\\]]*)?\\]`, 'g')
        : new RegExp(`\\{${this.escapeRegex(placeholder.name)}(?::[^\\}]*)?\\}`, 'g');
      finalContent = finalContent.replace(regex, value);
    });
    
    // Store original dropdown mode state before resetting placeholder mode
    const originalDropdownMode = this.isInDropdownMode;
    const originalDropdownModeType = this.dropdownModeType;
    const originalDropdownModeStartPosition = this.dropdownModeStartPosition;
    const originalDropdownModeLastCursorPos = this.dropdownModeLastCursorPos;
    
    // Reset placeholder mode first
    this.resetPlaceholderMode();
    
    // Restore dropdown mode state for proper text trigger handling
    this.isInDropdownMode = originalDropdownMode;
    this.dropdownModeType = originalDropdownModeType;
    this.dropdownModeStartPosition = originalDropdownModeStartPosition;
    this.dropdownModeLastCursorPos = originalDropdownModeLastCursorPos;
    
    this.insertPrompt(finalContent);
  }

  /**
   * Insert prompt content into the active input, handling different editor types
   * @param {string} content - The prompt content to insert
   */
  insertPrompt(content) {
    if (!this.activeInput) return;



    // For single-line inputs, convert newlines to spaces
    let processedContent = content;
    if (this.activeInput.tagName === 'INPUT') {
      processedContent = content.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // If contenteditable and likely controlled by an editor (e.g., ProseMirror),
    // operate via selection + execCommand to let the editor handle DOM/state.
    if (this.activeInput.isContentEditable || this.activeInput.contentEditable === 'true') {
      // Focus to ensure selection operations apply
      try {
        this.activeInput.focus();
      } catch (e) {
        // Input may have been removed from DOM
        return;
      }

      // When in dropdown mode, remove the filter region first
      if (this.isInDropdownMode && this.dropdownModeStartPosition >= 0) {
        const currentText = this.getInputValue(this.activeInput);
        const cursorPos = this.isInDropdownMode && this.dropdownModeLastCursorPos >= 0
          ? this.dropdownModeLastCursorPos
          : currentText.length;
        
        let start = this.dropdownModeStartPosition;
        let end = cursorPos;
        
        // For text trigger mode, also remove the trigger text itself
        if (this.dropdownModeType === 'textTrigger' && this.settings.textTrigger) {
          start = this.dropdownModeStartPosition - this.settings.textTrigger.length;
        }
        
        start = Math.max(0, Math.min(start, currentText.length));
        end = Math.max(start, Math.min(end, currentText.length));
        
        this.setSelectionByOffsets(this.activeInput, start, end);
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0);
          try { r.deleteContents(); } catch {}
        }
      }

      // Insert text via execCommand (widely supported by editors)
      try {
        document.execCommand('insertText', false, processedContent);
      } catch (e) {
        // Fallback: use beforeinput/input events
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(processedContent));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      // Dispatch input event to notify frameworks
      const inputEvent = new Event('input', { bubbles: true });
      this.activeInput.dispatchEvent(inputEvent);

      // Reset dropdown mode and flags
      this.justInsertedPrompt = true;
      this.resetDropdownMode();
      setTimeout(() => { this.justInsertedPrompt = false; }, 500);
      // Stop tracking this input immediately to prevent focusout interference
      this.activeInput = null;
      // Don't force focus after insertion - let the page handle focus naturally
      return;
    }

    // Fallback: value-based replace for INPUT/TEXTAREA
    const currentValue = this.getInputValue(this.activeInput);
    let cursorPos = this.isInDropdownMode && this.dropdownModeLastCursorPos >= 0
      ? this.dropdownModeLastCursorPos
      : this.getCursorPosition(this.activeInput);
    cursorPos = Math.max(0, Math.min(cursorPos, currentValue.length));

    let newValue, newCursorPos;

    if (this.isInDropdownMode && this.dropdownModeStartPosition >= 0) {
      const beforeStart = currentValue.substring(0, this.dropdownModeStartPosition);
      const afterCursor = currentValue.substring(cursorPos);
      if (this.dropdownModeType === 'textTrigger') {
        const triggerStart = this.dropdownModeStartPosition - this.settings.textTrigger.length;
        newValue = currentValue.substring(0, triggerStart) + processedContent + afterCursor;
        newCursorPos = triggerStart + processedContent.length;
      } else {
        newValue = beforeStart + processedContent + afterCursor;
        newCursorPos = beforeStart.length + processedContent.length;
      }
    } else {
      const beforeCursor = currentValue.substring(0, cursorPos);
      const afterCursor = currentValue.substring(cursorPos);
      newValue = beforeCursor + processedContent + afterCursor;
      newCursorPos = cursorPos + processedContent.length;
    }

    this.setInputValue(this.activeInput, newValue);
    this.setCursorPosition(this.activeInput, newCursorPos);

    this.justInsertedPrompt = true;
    
    // Dispatch input event to notify frameworks  
    const currentActiveInput = this.activeInput;
    setTimeout(() => {
      if (currentActiveInput) {
        const inputEvent = new Event('input', { bubbles: true });
        currentActiveInput.dispatchEvent(inputEvent);
      }
    }, 50);

    this.resetDropdownMode();
    setTimeout(() => { this.justInsertedPrompt = false; }, 500);
    // Stop tracking this input immediately to prevent focusout interference
    this.activeInput = null;
    // Don't force focus after insertion - let the page handle focus naturally
  }

  getInputValue(input) {
    if (!input) return '';
    
    // Standard form inputs
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      return input.value;
    }
    
    // Universal contenteditable handling
    if (input.isContentEditable || input.contentEditable === 'true') {
      let value = '';
      
      // Enhanced text extraction for rich text editors like Lexical
      if (input.getAttribute && input.getAttribute('data-lexical-editor') === 'true') {
        // Method 1: Try innerText (usually most reliable)
        value = input.innerText || '';
        
        // Method 2: If innerText is empty, try textContent
        if (!value) {
          value = input.textContent || '';
        }
        
        // Method 3: If still empty, try extracting from paragraphs
        if (!value) {
          const paragraphs = input.querySelectorAll('p');
          if (paragraphs.length > 0) {
            value = Array.from(paragraphs)
              .map(p => p.textContent || '')
              .filter(text => text.trim() !== '')
              .join('\n');
          }
        }
      } else {
        // Standard contenteditable handling
        value = input.innerText !== undefined ? input.innerText : input.textContent || '';
      }
      
      return value;
    }
    
    return '';
  }

  setInputValue(input, value) {
    if (!input) return;
    
    // Standard form inputs - use native value property
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      input.value = value;
      const event = new Event('input', { bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      return;
    }
    
    // Universal contenteditable handling - use browser's native text replacement
    if (input.isContentEditable || input.contentEditable === 'true') {
      // Focus and select all content, then use execCommand to replace
      input.focus();
      
      // Select all content
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Use browser's native insertText which works with all editors
      if (document.execCommand) {
        document.execCommand('insertText', false, value);
      } else {
        // Fallback for browsers without execCommand support
        input.textContent = value;
        const event = new Event('input', { bubbles: true, cancelable: true });
        input.dispatchEvent(event);
      }
    }
  }

  getCursorPosition(input) {
    if (!input) return 0;
    
    // Standard form inputs
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      return typeof input.selectionStart === 'number' ? input.selectionStart : 0;
    }
    
    // Universal contenteditable handling using Selection API
    if (input.isContentEditable || input.contentEditable === 'true') {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return 0;
      }
      
      const range = selection.getRangeAt(0);
      const preRange = range.cloneRange();
      try {
        preRange.selectNodeContents(input);
        preRange.setEnd(range.startContainer, range.startOffset);
        return preRange.toString().length;
      } catch (e) {
        return 0;
      }
    }
    
    return 0;
  }

  setCursorPosition(input, position) {
    if (!input) return;
    
    // Standard form inputs
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(position, position);
      }
      return;
    }
    
    // Universal contenteditable handling using Selection API
    if (input.isContentEditable || input.contentEditable === 'true') {
      const selection = window.getSelection();
      if (!selection) return;
      
      const range = document.createRange();
      const targetPos = Math.max(0, Math.min(position, (input.textContent || '').length));

      // Walk text nodes to find the correct offset
      let remaining = targetPos;
      let found = false;
      const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null);
      let node = walker.nextNode();
      
      while (node) {
        const len = node.nodeValue ? node.nodeValue.length : 0;
        if (remaining <= len) {
          range.setStart(node, remaining);
          found = true;
          break;
        }
        remaining -= len;
        node = walker.nextNode();
      }
      
      if (!found) {
        range.selectNodeContents(input);
        range.collapse(false);
      }
      
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }



  hideDropdown() {
    if (this.dropdown) {
      // Fade out smoothly before removing
      this.dropdown.style.opacity = '0';
      setTimeout(() => {
        if (this.dropdown) {
          this.dropdown.remove();
          this.dropdown = null;
        }
      }, 150); // Match CSS transition duration
    }
    this.isDropdownVisible = false;
    this.selectedIndex = -1;
    this.filteredPrompts = [];
    
    // Restore focus to the active input when closing dropdown
    // BUT NOT if we just inserted a prompt - let the user navigate freely
    const inputToFocus = this.activeInput;
    if (inputToFocus && !this.justInsertedPrompt) {
      setTimeout(() => {
        try {
          inputToFocus.focus();
        } catch (e) {
          // Input may have been removed from DOM
        }
      }, 10);
    }
  }

  isPlaceholderInput(element) {
    return element && element.classList && element.classList.contains('placeholder-input');
  }

  shouldKeepDropdownOpen() {
    if (!this.dropdown) return false;
    
    // Always keep open if we're in placeholder mode
    if (this.isInPlaceholderMode) {
      return true;
    }
    
    const activeElement = document.activeElement;
    
    // Keep open if dropdown or its contents are focused
    if (this.dropdown.contains(activeElement)) {
      return true;
    }
    
    return false;
  }

  showNoPromptsMessage() {
    this.createDropdown();
    this.dropdown.innerHTML = `
      <div class="ai-prompt-no-results">
        No prompts saved. <a href="${browser.runtime.getURL('options.html')}" target="_blank">Add prompts in settings</a>
      </div>
    `;
    this.positionDropdown();
    this.isDropdownVisible = true;

    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.hideDropdown();
    }, 3000);
  }
}

// Initialize the autocomplete system
const aiPromptAutocomplete = new AIPromptAutocomplete();