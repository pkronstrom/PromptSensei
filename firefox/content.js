// Content script for input monitoring and dropdown display
class AIPromptAutocomplete {
  constructor() {
    this.settings = null;
    this.activeInput = null;
    this.dropdown = null;
    this.selectedIndex = -1;
    this.filteredPrompts = [];
    this.isDropdownVisible = false;
    this.isInDropdownMode = false; // Unified mode for both hotkey and text trigger
    this.dropdownModeStartPosition = -1;
    this.dropdownModeType = null; // 'hotkey' or 'textTrigger'
    this.justInsertedPrompt = false;
    
    // Placeholder form state
    this.isInPlaceholderMode = false;
    this.currentPromptContent = '';
    this.placeholders = [];
    this.placeholderValues = {};
    this.currentPlaceholderIndex = 0;

    // Ensure DOM is ready before initializing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      // DOM already loaded, init immediately
      this.init();
    }
  }

  async init() {
    try {
      // Wait for DOM to be fully ready
      await this.waitForDOM();
      
      // Load settings from background with retry logic
      let retries = 5;
      while (retries > 0 && !this.settings) {
        this.settings = await this.sendMessage({ action: 'getSettings' });
        if (!this.settings) {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      // Small delay to ensure page is fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Set up event listeners
      this.setupEventListeners();

      // Listen for messages from background script
      browser.runtime.onMessage.addListener((message) => {
        this.handleMessage(message);
      });

      console.log('AI Prompt Extension initialized successfully');
    } catch (error) {
      console.error('Error initializing AI Prompt Extension:', error);
      // Retry initialization after a delay
      setTimeout(() => this.init(), 1000);
    }
  }

  async waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        const checkReady = () => {
          if (document.readyState === 'complete') {
            resolve();
          } else {
            setTimeout(checkReady, 50);
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

  handleMessage(message) {
    switch (message.action) {
      case 'showPromptDropdown':
        console.log('Received showPromptDropdown message');
        if (this.activeInput) {
          console.log('Active input found, activating dropdown mode');
          this.activateDropdownMode('hotkey');
        } else {
          console.log('No active input for browser hotkey');
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
      if (this.isInputElement(e.target)) {
        console.log('Input focused:', e.target.tagName, e.target.contentEditable, e.target);
        // If switching to a different input, reset dropdown mode
        if (this.activeInput !== e.target && !this.isPlaceholderInput(e.target)) {
          this.resetDropdownMode();
        }
        
        // Only set activeInput if it's not a placeholder input
        if (!this.isPlaceholderInput(e.target)) {
          this.activeInput = e.target;
        }
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

    // Handle keyboard events with capture to intercept before any other handlers
    document.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    }, true); // Use capture phase

    document.addEventListener('input', (e) => {
      if (this.isInputElement(e.target) && !this.isPlaceholderInput(e.target)) {
        this.handleInput(e);
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
    if (!element) return false;

    // Check for standard input elements
    if (element.tagName === 'INPUT' && 
        ['text', 'search', 'url', 'email', 'password'].includes(element.type)) {
      return true;
    }

    // Check for textarea
    if (element.tagName === 'TEXTAREA') {
      return true;
    }

    // Check for contentEditable elements (any truthy value, not just 'true')
    if (element.contentEditable && element.contentEditable !== 'false' && element.contentEditable !== 'inherit') {
      return true;
    }

    // Also check for elements with role="textbox" (common pattern for custom inputs)
    if (element.getAttribute('role') === 'textbox') {
      return true;
    }

    return false;
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

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.exitPlaceholderMode();
          return false;
      }
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

    // When text trigger is active, intercept Enter to prevent form submission
    if (this.textTriggerActive && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }

    // Handle custom hotkey
    if (this.matchesHotkey(e, this.settings?.hotkey)) {
      console.log('Hotkey matched, activating dropdown mode');
      e.preventDefault();
      e.stopPropagation();
      if (this.activeInput) {
        this.activateDropdownMode('hotkey');
      } else {
        console.log('No active input for hotkey');
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
      const value = this.getInputValue(this.activeInput);
      const beforeCursor = value.substring(0, cursorPos);
      
      // For hotkey, start filtering from the last word
      const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
      this.dropdownModeStartPosition = lastSpaceIndex + 1;
      
      // Get existing text to filter with
      const filterText = beforeCursor.substring(this.dropdownModeStartPosition);
      this.filterAndShowPromptsWithBestMatch(filterText);
    } else if (type === 'textTrigger') {
      this.dropdownModeStartPosition = startPosition + this.settings.textTrigger.length;
      
      // Get text after trigger for filtering
      const value = this.getInputValue(this.activeInput);
      const cursorPos = this.getCursorPosition(this.activeInput);
      const afterTrigger = value.substring(this.dropdownModeStartPosition, cursorPos);
      this.filterAndShowPromptsWithBestMatch(afterTrigger);
    }
  }

  handleDropdownModeInput(value, cursorPos) {
    console.log('Handle dropdown input:', { value, cursorPos, startPos: this.dropdownModeStartPosition, type: this.dropdownModeType });
    
    // If cursor moved before start position, exit dropdown mode
    if (cursorPos < this.dropdownModeStartPosition) {
      console.log('Cursor before start position, resetting');
      this.resetDropdownMode();
      return;
    }
    
    // For text trigger, validate the trigger is still present
    if (this.dropdownModeType === 'textTrigger') {
      const trigger = this.settings.textTrigger;
      const triggerStart = this.dropdownModeStartPosition - trigger.length;
      const triggerText = value.substring(triggerStart, this.dropdownModeStartPosition);
      
      if (triggerText !== trigger) {
        console.log('Text trigger removed, resetting');
        this.resetDropdownMode();
        return;
      }
    }
    
    // Extract the filter text from the start position to cursor
    const filterText = value.substring(this.dropdownModeStartPosition, cursorPos);
    console.log('Filter text extracted:', `"${filterText}"`);
    
    // Filter prompts based on current text (including empty text to show all)
    this.filterAndShowPromptsWithBestMatch(filterText);
  }

  resetDropdownMode() {
    this.isInDropdownMode = false;
    this.dropdownModeType = null;
    this.dropdownModeStartPosition = -1;
    this.resetPlaceholderMode();
    this.hideDropdown();
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
    
    // Create preview section
    const previewSection = document.createElement('div');
    previewSection.className = 'placeholder-preview';
    
    const previewLabel = document.createElement('div');
    previewLabel.className = 'placeholder-preview-label';
    previewLabel.textContent = 'Preview:';
    
    const previewContent = document.createElement('div');
    previewContent.className = 'placeholder-preview-content';
    previewContent.id = 'placeholder-preview-text';
    
    previewSection.appendChild(previewLabel);
    previewSection.appendChild(previewContent);
    this.dropdown.appendChild(previewSection);
    
    // Create form section
    const formSection = document.createElement('div');
    formSection.className = 'placeholder-form';
    
    this.placeholders.forEach((placeholder, index) => {
      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'placeholder-field';
      if (index === this.currentPlaceholderIndex) {
        fieldDiv.classList.add('active');
      }
      
      const label = document.createElement('label');
      label.textContent = placeholder.name;
      label.className = 'placeholder-label';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'placeholder-input';
      input.value = this.placeholderValues[placeholder.name] || '';
      input.placeholder = placeholder.defaultValue ? `Default: ${placeholder.defaultValue}` : 'Enter value...';
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
      });
    });
    
    // Add instructions
    const instructions = document.createElement('div');
    instructions.className = 'placeholder-instructions';
    instructions.innerHTML = 'Tab/Shift+Tab to navigate • Enter to insert • Esc to go back';
    
    this.dropdown.appendChild(formSection);
    this.dropdown.appendChild(instructions);
    
    this.updatePreview();
  }

  updatePreview() {
    const previewElement = document.getElementById('placeholder-preview-text');
    if (!previewElement) return;
    
    let preview = this.currentPromptContent;
    
    // Replace placeholders with current values
    this.placeholders.forEach(placeholder => {
      const value = this.placeholderValues[placeholder.name] || placeholder.defaultValue || `[${placeholder.name}]`;
      const regex = placeholder.syntax === 'bracket' 
        ? new RegExp(`\\[${this.escapeRegex(placeholder.name)}(?::[^\\]]*)?\\]`, 'g')
        : new RegExp(`\\{${this.escapeRegex(placeholder.name)}(?::[^\\}]*)?\\}`, 'g');
      preview = preview.replace(regex, value);
    });
    
    // Highlight the current placeholder being edited
    if (this.placeholders[this.currentPlaceholderIndex]) {
      const currentPlaceholder = this.placeholders[this.currentPlaceholderIndex];
      const currentValue = this.placeholderValues[currentPlaceholder.name] || currentPlaceholder.defaultValue || `[${currentPlaceholder.name}]`;
      
      // Wrap current placeholder value in a highlight span
      preview = preview.replace(currentValue, `<span class="current-placeholder">${currentValue}</span>`);
    }
    
    previewElement.innerHTML = preview;
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

  matchesHotkey(event, hotkey) {
    if (!hotkey) return false;

    const keys = hotkey.split('+').map(k => k.trim());
    const modifiers = keys.slice(0, -1).map(k => k.toLowerCase());
    const mainKey = keys[keys.length - 1].toLowerCase();

    const eventKey = event.key.toLowerCase();
    
    // Check if all required modifiers are pressed and no extra ones
    const hasCtrl = modifiers.includes('ctrl') === event.ctrlKey;
    const hasShift = modifiers.includes('shift') === event.shiftKey;
    const hasAlt = modifiers.includes('alt') === event.altKey;
    const hasMeta = modifiers.includes('meta') === event.metaKey;

    return eventKey === mainKey && hasCtrl && hasShift && hasAlt && hasMeta;
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

    this.createDropdown();
    this.renderDropdown();
    this.positionDropdown();
    this.isDropdownVisible = true;
  }

  filterAndShowPromptsWithBestMatch(query) {
    if (!this.settings?.prompts?.length) {
      this.showNoPromptsMessage();
      return;
    }

    const queryLower = query.toLowerCase().trim();
    console.log('Filtering with query:', `"${query}"`, 'trimmed:', `"${queryLower}"`, 'total prompts:', this.settings.prompts.length);

    if (!queryLower) {
      // No query - show all prompts
      console.log('Empty query, showing all prompts');
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

    console.log('Final filtered prompts count:', this.filteredPrompts.length);

    this.createDropdown();
    this.renderDropdown();
    this.positionDropdown();
    this.isDropdownVisible = true;
    
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
    document.body.appendChild(this.dropdown);
  }

  renderDropdown() {
    this.dropdown.innerHTML = '';
    
    if (this.filteredPrompts.length === 0) {
      this.selectedIndex = -1;
      const noResults = document.createElement('div');
      noResults.className = 'ai-prompt-no-results';
      noResults.textContent = 'No prompts found';
      this.dropdown.appendChild(noResults);
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

      item.addEventListener('click', () => {
        this.selectedIndex = index;
        this.insertSelectedPrompt();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });

      this.dropdown.appendChild(item);
    });
    
    // Apply visual selection to the first item
    this.updateSelection();
  }

  positionDropdown() {
    if (!this.activeInput || !this.dropdown) return;

    // Use double requestAnimationFrame for better stability
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Force dropdown to be visible for measurement
        this.dropdown.style.visibility = 'hidden';
        this.dropdown.style.display = 'block';
        this.dropdown.style.position = 'absolute';

        const inputRect = this.activeInput.getBoundingClientRect();
        
        // Ensure we have valid input dimensions with retry mechanism
        if (inputRect.width === 0 && inputRect.height === 0) {
          console.warn('Input element has no dimensions, retrying positioning');
          setTimeout(() => this.positionDropdown(), 50);
          return;
        }

        // Get dropdown dimensions after it's rendered
        const dropdownHeight = this.dropdown.offsetHeight;
        const dropdownWidth = this.dropdown.offsetWidth;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        // Calculate optimal position
        let top = inputRect.bottom + window.scrollY + 4;
        let left = inputRect.left + window.scrollX;

        // If dropdown would be cut off at bottom, position above
        if (inputRect.bottom + dropdownHeight + 10 > viewportHeight) {
          top = inputRect.top + window.scrollY - dropdownHeight - 4;
        }

        // If dropdown would be cut off at right, align to right edge of input
        if (left + dropdownWidth > viewportWidth) {
          left = inputRect.right + window.scrollX - dropdownWidth;
        }

        // Ensure minimum left position
        left = Math.max(10, left);

        this.dropdown.style.top = `${top}px`;
        this.dropdown.style.left = `${left}px`;
        this.dropdown.style.width = `${Math.max(300, inputRect.width)}px`;
        this.dropdown.style.zIndex = '10000';
        
        // Make dropdown visible again
        this.dropdown.style.visibility = 'visible';
      });
    });
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
    
    this.insertPrompt(finalContent);
  }

  insertPrompt(content) {
    if (!this.activeInput) return;

    // For single-line inputs, convert newlines to spaces
    // For multi-line inputs (textarea, contentEditable), preserve newlines
    let processedContent = content;
    if (this.activeInput.tagName === 'INPUT') {
      // Single-line input field - convert newlines to spaces
      processedContent = content.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // For textarea and contentEditable, keep original content with newlines

    const currentValue = this.getInputValue(this.activeInput);
    const cursorPos = this.getCursorPosition(this.activeInput);

    let newValue, newCursorPos;

    if (this.isInDropdownMode && this.dropdownModeStartPosition >= 0) {
      // Replace from start position to cursor with the prompt content
      const beforeStart = currentValue.substring(0, this.dropdownModeStartPosition);
      const afterCursor = currentValue.substring(cursorPos);
      
      // For text trigger mode, we need to remove the trigger itself
      if (this.dropdownModeType === 'textTrigger') {
        const triggerStart = this.dropdownModeStartPosition - this.settings.textTrigger.length;
        newValue = currentValue.substring(0, triggerStart) + processedContent + afterCursor;
        newCursorPos = triggerStart + processedContent.length;
      } else {
        // For hotkey mode, just replace the filter text
        newValue = beforeStart + processedContent + afterCursor;
        newCursorPos = beforeStart.length + processedContent.length;
      }
    } else {
      // Fallback: insert at current cursor position
      const beforeCursor = currentValue.substring(0, cursorPos);
      const afterCursor = currentValue.substring(cursorPos);
      newValue = beforeCursor + processedContent + afterCursor;
      newCursorPos = cursorPos + processedContent.length;
    }

    this.setInputValue(this.activeInput, newValue);
    this.setCursorPosition(this.activeInput, newCursorPos);

    // Set flag to prevent form submission immediately after insertion
    this.justInsertedPrompt = true;

    // Trigger input event for frameworks that rely on it (after a small delay)
    setTimeout(() => {
      const inputEvent = new Event('input', { bubbles: true });
      this.activeInput.dispatchEvent(inputEvent);
    }, 50);

    // Reset dropdown mode after insertion
    this.resetDropdownMode();

    // Clear the insertion flag after a longer delay to prevent accidental submissions
    setTimeout(() => {
      this.justInsertedPrompt = false;
    }, 500);

    // Add small delay to ensure form submission is prevented
    setTimeout(() => {
      this.activeInput.focus();
    }, 10);
  }

  getInputValue(input) {
    return input.contentEditable === 'true' ? input.textContent : input.value;
  }

  setInputValue(input, value) {
    if (input.contentEditable === 'true') {
      input.textContent = value;
    } else {
      input.value = value;
    }
  }

  getCursorPosition(input) {
    if (input.contentEditable === 'true') {
      const selection = window.getSelection();
      return selection.rangeCount > 0 ? selection.getRangeAt(0).startOffset : 0;
    } else {
      return input.selectionStart || 0;
    }
  }

  setCursorPosition(input, position) {
    if (input.contentEditable === 'true') {
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(input.firstChild || input, Math.min(position, input.textContent.length));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      input.setSelectionRange(position, position);
    }
  }

  hideDropdown() {
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
    }
    this.isDropdownVisible = false;
    this.selectedIndex = -1;
    this.filteredPrompts = [];
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