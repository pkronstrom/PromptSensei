// Content script for input monitoring and dropdown display
class AIPromptAutocomplete {
  constructor() {
    this.settings = null;
    this.activeInput = null;
    this.dropdown = null;
    this.selectedIndex = -1;
    this.filteredPrompts = [];
    this.isDropdownVisible = false;
    this.textTriggerActive = false;
    this.textTriggerPosition = -1;
    this.justInsertedPrompt = false;

    this.init();
  }

  async init() {
    // Load settings from background
    this.settings = await this.sendMessage({ action: 'getSettings' });

    // Set up event listeners
    this.setupEventListeners();

    // Listen for messages from background script
    browser.runtime.onMessage.addListener((message) => {
      this.handleMessage(message);
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
        if (this.activeInput) {
          this.showDropdown();
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
        this.activeInput = e.target;
      }
    });

    document.addEventListener('focusout', (e) => {
      // Delay to allow dropdown interaction
      setTimeout(() => {
        if (this.activeInput === e.target && !this.isDropdownFocused()) {
          this.hideDropdown();
          this.activeInput = null;
        }
      }, 100);
    });

    // Handle keyboard events with capture to intercept before any other handlers
    document.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    }, true); // Use capture phase

    document.addEventListener('input', (e) => {
      if (this.isInputElement(e.target)) {
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
      e.preventDefault();
      e.stopPropagation();
      if (this.activeInput) {
        this.showDropdownWithFiltering();
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
          this.hideDropdown();
          // Reset text trigger state so dropdown won't show again without full keyword
          this.textTriggerActive = false;
          this.textTriggerPosition = -1;
          return false;
      }
    }
  }

  handleInput(e) {
    if (!this.settings) return;

    const input = e.target;
    const value = this.getInputValue(input);
    const cursorPos = this.getCursorPosition(input);

    // Check for text trigger
    this.checkTextTrigger(value, cursorPos);
  }

  checkTextTrigger(value, cursorPos) {
    const trigger = this.settings.textTrigger;
    if (!trigger) return;

    const beforeCursor = value.substring(0, cursorPos);
    const triggerIndex = beforeCursor.lastIndexOf(trigger);

    if (triggerIndex !== -1) {
      const afterTrigger = beforeCursor.substring(triggerIndex + trigger.length);

      // Check if trigger is at word boundary
      const isValidTrigger = triggerIndex === 0 || /\s/.test(beforeCursor[triggerIndex - 1]);

      if (isValidTrigger) {
        this.textTriggerActive = true;
        this.textTriggerPosition = triggerIndex;
        this.filterAndShowPrompts(afterTrigger.trim());
        return;
      }
    }

    // Hide dropdown if trigger is not found
    if (this.textTriggerActive) {
      this.textTriggerActive = false;
      this.hideDropdown();
    }
  }

  matchesHotkey(event, hotkey) {
    if (!hotkey) return false;

    const keys = hotkey.split('+').map(k => k.trim());
    const modifiers = keys.slice(0, -1).map(k => k.toLowerCase());
    const mainKey = keys[keys.length - 1].toLowerCase();

    const eventKey = event.key.toLowerCase();
    const hasCtrl = modifiers.includes('ctrl') ? event.ctrlKey : !event.ctrlKey;
    const hasShift = modifiers.includes('shift') ? event.shiftKey : !event.shiftKey;
    const hasAlt = modifiers.includes('alt') ? event.altKey : !event.altKey;

    return eventKey === mainKey && hasCtrl && hasShift && hasAlt;
  }

  async showDropdown() {
    if (!this.settings?.prompts?.length) {
      this.showNoPromptsMessage();
      return;
    }

    this.filteredPrompts = [...this.settings.prompts];
    this.createDropdown();
    this.renderDropdown();
    this.positionDropdown();
    this.isDropdownVisible = true;
  }

  async showDropdownWithFiltering() {
    if (!this.settings?.prompts?.length) {
      this.showNoPromptsMessage();
      return;
    }

    if (!this.activeInput) return;

    // Get current input value and cursor position to check for existing content
    const currentValue = this.getInputValue(this.activeInput);
    const cursorPos = this.getCursorPosition(this.activeInput);
    
    // Get text before cursor that could be used for filtering
    const beforeCursor = currentValue.substring(0, cursorPos);
    
    // Look for the last word before cursor (up to first space or beginning)
    const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
    const filterQuery = beforeCursor.substring(lastSpaceIndex + 1);
    
    // If there's text that could be used for filtering, use it
    if (filterQuery.trim()) {
      this.filterAndShowPrompts(filterQuery);
    } else {
      // Otherwise show all prompts
      this.filteredPrompts = [...this.settings.prompts];
      this.createDropdown();
      this.renderDropdown();
      this.positionDropdown();
      this.isDropdownVisible = true;
    }
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
    this.selectedIndex = -1;

    if (this.filteredPrompts.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'ai-prompt-no-results';
      noResults.textContent = 'No prompts found';
      this.dropdown.appendChild(noResults);
      return;
    }

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
  }

  positionDropdown() {
    if (!this.activeInput || !this.dropdown) return;

    const inputRect = this.activeInput.getBoundingClientRect();
    const dropdownHeight = this.dropdown.offsetHeight;
    const viewportHeight = window.innerHeight;

    // Position below input by default
    let top = inputRect.bottom + window.scrollY + 2;

    // If dropdown would be cut off at bottom, position above
    if (inputRect.bottom + dropdownHeight > viewportHeight) {
      top = inputRect.top + window.scrollY - dropdownHeight - 2;
    }

    this.dropdown.style.position = 'absolute';
    this.dropdown.style.top = `${top}px`;
    this.dropdown.style.left = `${inputRect.left + window.scrollX}px`;
    this.dropdown.style.width = `${Math.max(300, inputRect.width)}px`;
    this.dropdown.style.zIndex = '10000';
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
      this.insertPrompt(prompt.content);
    }
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

    if (this.textTriggerActive && this.textTriggerPosition >= 0) {
      // Replace text trigger and any text after it up to cursor
      const beforeTrigger = currentValue.substring(0, this.textTriggerPosition);
      const afterCursor = currentValue.substring(cursorPos);
      newValue = beforeTrigger + processedContent + afterCursor;
      newCursorPos = beforeTrigger.length + processedContent.length;
    } else {
      // Check if we're in hotkey filtering mode (dropdown was triggered by hotkey and has filtered content)
      const beforeCursor = currentValue.substring(0, cursorPos);
      const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
      const possibleFilterText = beforeCursor.substring(lastSpaceIndex + 1);
      
      // If the current filtered prompts don't include all prompts, we're in filtering mode
      // and should replace the filter text
      if (this.filteredPrompts.length < this.settings.prompts.length && possibleFilterText.trim()) {
        const beforeFilter = currentValue.substring(0, lastSpaceIndex + 1);
        const afterCursor = currentValue.substring(cursorPos);
        newValue = beforeFilter + processedContent + afterCursor;
        newCursorPos = beforeFilter.length + processedContent.length;
      } else {
        // Insert at current cursor position (normal hotkey or no filtering)
        const afterCursor = currentValue.substring(cursorPos);
        newValue = beforeCursor + processedContent + afterCursor;
        newCursorPos = cursorPos + processedContent.length;
      }
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

    this.hideDropdown();
    this.textTriggerActive = false;
    this.textTriggerPosition = -1;

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
    // Keep text trigger state until prompt is inserted or focus is lost
  }

  isDropdownFocused() {
    return this.dropdown && this.dropdown.contains(document.activeElement);
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