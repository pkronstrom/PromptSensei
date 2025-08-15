// Setup Preact renderer - Preact is preloaded via manifest
const createSecureRenderer = () => {
  
  // Preact should be available since it's loaded via manifest before content.js
  const preactLib = window.preact || self.preact;
  
  if (preactLib) {
    
    // Setup global references for convenience
    window.preact = preactLib;
    window.h = preactLib.h;
    window.render = preactLib.render;
    
    // Register components
    setupPreactComponents();
    
    return Promise.resolve();
  } else {
    return Promise.reject(new Error('Preact not available'));
  }
};

// Setup Preact components after Preact is loaded
const setupPreactComponents = () => {
  if (!window.preact || !window.h) {
    return;
  }

  const { h } = window.preact;

  // Define PlaceholderForm component
  window.PlaceholderForm = ({ 
    placeholders = [], 
    placeholderValues = {}, 
    currentPlaceholderIndex = 0, 
    onPlaceholderChange, 
    onPlaceholderNavigate, 
    onInsertPrompt, 
    onExitPlaceholder, 
    selectedPrompt = {},
    settings = {}
  }) => {
    // Safety checks
    if (!h || !onPlaceholderChange || !onPlaceholderNavigate || !onInsertPrompt || !onExitPlaceholder) {
      return null;
    }
    
    return h('div', { className: 'ai-prompt-dropdown placeholder-mode' },
      h('div', { className: 'ai-scroll' },
        // Header
        h('div', { className: 'placeholder-prompt-name' },
          settings?.showMouseButtons !== false && h('button', {
            className: 'placeholder-back-btn',
            onClick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              onExitPlaceholder();
            },
            title: 'Back to prompts'
          }, '‹'),
          h('span', { className: 'placeholder-prompt-title' }, selectedPrompt?.name || 'Prompt')
        ),
        
        // Preview
        h('div', { className: 'placeholder-preview' },
          h('div', { className: 'placeholder-preview-content', id: 'placeholder-preview-text' },
            // Preview content will be updated by parent component
          )
        ),
        
        // Form
        h('div', { className: 'placeholder-form' },
          placeholders.map((placeholder, index) =>
            h('div', {
              key: placeholder.name,
              className: `placeholder-field ${index === currentPlaceholderIndex ? 'active' : ''}`
            },
              h('div', { className: 'placeholder-label' }, placeholder.name),
              h('input', {
                type: 'text',
                className: 'placeholder-input',
                value: placeholderValues[placeholder.name] || '',
                placeholder: placeholder.defaultValue || 'Enter value...',
                'data-placeholder-name': placeholder.name,
                'data-placeholder-index': index,
                onInput: (e) => onPlaceholderChange(placeholder.name, e.target.value),
                onFocus: () => onPlaceholderNavigate(index)
              })
            )
          )
        ),
        
        // Actions
        settings?.showMouseButtons !== false && h('div', { className: 'placeholder-actions' },
          h('button', {
            className: 'placeholder-insert-btn',
            onClick: onInsertPrompt
          }, 'Insert')
        ),
        
        // Instructions
        settings?.showInfoBar !== false && h('div', { className: 'placeholder-instructions' },
          'Tab/Shift+Tab or ↑/↓ to navigate • Enter to insert • Esc to go back'
        )
      )
    );
  };

  // Define PromptDropdown component  
  window.PromptDropdown = ({ 
    prompts = [], 
    selectedIndex = -1, 
    onSelectPrompt, 
    onSelectIndex, 
    isPlaceholderMode = false, 
    placeholders = [], 
    placeholderValues = {}, 
    currentPlaceholderIndex = 0,
    onPlaceholderChange,
    onPlaceholderNavigate,
    onInsertPrompt,
    onExitPlaceholder,
    onFilterChange,
    filterValue = '',
    settings = {} 
  }) => {
    // Safety checks
    if (!h || !onSelectPrompt || !onSelectIndex) {
      return null;
    }
    
    if (isPlaceholderMode) {
      return h(window.PlaceholderForm, {
        placeholders,
        placeholderValues,
        currentPlaceholderIndex,
        onPlaceholderChange,
        onPlaceholderNavigate,
        onInsertPrompt,
        onExitPlaceholder,
        selectedPrompt: prompts[selectedIndex],
        settings
      });
    }

    return h('div', { className: 'ai-prompt-dropdown' },
      h('div', { className: 'ai-scroll' },
        prompts.length === 0 
          ? null // Don't show "No prompts found" during transitions - use showNoPromptsMessage() instead
          : prompts.map((prompt, index) => 
              h('div', {
                key: prompt.name + index,
                className: `ai-prompt-item ${index === selectedIndex ? 'selected' : ''}`,
                tabIndex: 0,
                onClick: () => onSelectPrompt(index),
                onMouseEnter: () => onSelectIndex(index)
              },
                h('div', { className: 'ai-prompt-name' }, prompt?.name || 'Unnamed'),
                h('div', { className: 'ai-prompt-preview' }, 
                  (prompt?.content || '').split('\n').map(line => line.trim()).filter(line => line.length > 0)
                    .join(' ').replace(/\s+/g, ' ').trim().substring(0, 100) + 
                    ((prompt?.content || '').length > 100 ? '...' : '')
                )
              )
            )
      ),
      // Filter display at bottom right - only show if there's a filter value
      filterValue && h('div', { className: 'ai-prompt-filter' },
        h('div', {
          className: 'ai-filter-display'
        }, filterValue)
      )
    );
  };
  
};

// Performance monitoring for optimization and debugging
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
    this.enabled = true; // Can be disabled in production
  }

  startTimer(operation) {
    if (!this.enabled) return null;
    
    const startTime = performance.now();
    const timerId = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    this.timers.set(timerId, {
      operation,
      startTime,
      startMemory: this.getMemoryUsage()
    });
    
    return timerId;
  }

  endTimer(timerId) {
    if (!this.enabled || !timerId || !this.timers.has(timerId)) {
      return null;
    }
    
    const timer = this.timers.get(timerId);
    const endTime = performance.now();
    const duration = endTime - timer.startTime;
    const endMemory = this.getMemoryUsage();
    
    const result = {
      operation: timer.operation,
      duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
      startMemory: timer.startMemory,
      endMemory,
      memoryDelta: endMemory - timer.startMemory
    };
    
    this.recordMetric(timer.operation, result);
    this.timers.delete(timerId);
    
    // Log slow operations
    if (duration > 100) {
    }
    
    return result;
  }

  recordMetric(operation, data) {
    if (!this.enabled) return;
    
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        maxDuration: 0,
        minDuration: Infinity,
        recentDurations: [],
        errors: 0
      });
    }
    
    const metric = this.metrics.get(operation);
    metric.count++;
    metric.totalDuration += data.duration;
    metric.averageDuration = metric.totalDuration / metric.count;
    metric.maxDuration = Math.max(metric.maxDuration, data.duration);
    metric.minDuration = Math.min(metric.minDuration, data.duration);
    
    // Keep recent durations for trend analysis (last 10)
    metric.recentDurations.push(data.duration);
    if (metric.recentDurations.length > 10) {
      metric.recentDurations.shift();
    }
  }

  recordError(operation) {
    if (!this.enabled) return;
    
    if (!this.metrics.has(operation)) {
      this.recordMetric(operation, { duration: 0 });
    }
    
    this.metrics.get(operation).errors++;
  }

  getMemoryUsage() {
    try {
      if (performance.memory) {
        return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100; // MB
      }
    } catch (e) {
      // Memory API not available
    }
    return 0;
  }

  getMetrics() {
    const result = {};
    this.metrics.forEach((metric, operation) => {
      result[operation] = { ...metric };
    });
    return result;
  }

  getReport() {
    const report = {
      timestamp: new Date().toISOString(),
      memoryUsage: this.getMemoryUsage(),
      operations: this.getMetrics()
    };
    
    // Identify performance issues
    const issues = [];
    this.metrics.forEach((metric, operation) => {
      if (metric.averageDuration > 50) {
        issues.push(`${operation}: avg ${metric.averageDuration}ms (slow)`);
      }
      if (metric.errors > 0) {
        issues.push(`${operation}: ${metric.errors} errors`);
      }
    });
    
    if (issues.length > 0) {
      report.issues = issues;
    }
    
    return report;
  }

  reset() {
    this.metrics.clear();
    this.timers.clear();
  }

  disable() {
    this.enabled = false;
    this.reset();
  }
}

// Resource cleanup manager for preventing memory leaks
class ResourceManager {
  constructor() {
    this.timeouts = new Set();
    this.intervals = new Set();
    this.listeners = new Map();
    this.isDestroyed = false;
  }

  setTimeout(callback, delay) {
    if (this.isDestroyed) return null;
    
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      if (!this.isDestroyed) {
        callback();
      }
    }, delay);
    
    this.timeouts.add(id);
    return id;
  }

  setInterval(callback, delay) {
    if (this.isDestroyed) return null;
    
    const id = setInterval(() => {
      if (!this.isDestroyed) {
        callback();
      }
    }, delay);
    
    this.intervals.add(id);
    return id;
  }

  addEventListener(target, event, handler, options) {
    if (this.isDestroyed) return;
    
    // Create unique key for target+event combination
    const key = `${this.getTargetId(target)}:${event}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    this.listeners.get(key).add({ handler, options, target });
    target.addEventListener(event, handler, options);
  }
  
  getTargetId(target) {
    if (target === document) return 'document';
    if (target === window) return 'window';
    if (target && target.nodeType === 1) {
      // DOM Element - create unique identifier
      if (!target._taltioId) {
        target._taltioId = `element_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
      return target._taltioId;
    }
    return String(target);
  }

  removeEventListener(target, event, handler, options) {
    const key = `${this.getTargetId(target)}:${event}`;
    const handlers = this.listeners.get(key);
    if (handlers) {
      handlers.forEach(item => {
        if (item.handler === handler && item.target === target) {
          handlers.delete(item);
          target.removeEventListener(event, handler, options);
        }
      });
    }
  }

  destroy() {
    this.isDestroyed = true;
    
    // Clear all timeouts
    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts.clear();
    
    // Clear all intervals
    this.intervals.forEach(id => clearInterval(id));
    this.intervals.clear();
    
    // Remove all event listeners
    this.listeners.forEach((handlers, key) => {
      const [targetId, event] = key.split(':');
      handlers.forEach(({ handler, options, target }) => {
        try {
          if (target && target.removeEventListener) {
            target.removeEventListener(event, handler, options);
          }
        } catch (e) {
          // Element may have been removed
        }
      });
    });
    this.listeners.clear();
  }
}

// Input/Output Management Module
class InputManager {
  constructor(resources, constants) {
    this.resources = resources;
    this.CONSTANTS = constants;
  }

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
}

// Event Management Module  
class EventManager {
  constructor(resources, constants) {
    this.resources = resources;
    this.CONSTANTS = constants;
    this.eventCallbacks = new Map();
  }

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

  registerCallback(name, callback) {
    if (!this.eventCallbacks.has(name)) {
      this.eventCallbacks.set(name, new Set());
    }
    this.eventCallbacks.get(name).add(callback);
  }

  executeCallbacks(name, ...args) {
    const callbacks = this.eventCallbacks.get(name);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
        }
      });
    }
  }
}

// Content script for input monitoring and dropdown display
class AIPromptAutocomplete {
  constructor() {
    // Resource management
    this.resources = new ResourceManager();
    
    // Constants
    this.CONSTANTS = {
      TIMEOUTS: {
        ACTIVATION_DELAY: 10,
        FOCUS_DELAY: 50,
        RENDER_DELAY: 10,
        AUTO_HIDE_DELAY: 3000,
        RETRY_DELAY: 200,
        INIT_RETRY_DELAY: 1000
      },
      DIMENSIONS: {
        MIN_TEXTAREA_SIZE: 2,
        DROPDOWN_HEIGHT: 300,
        PREVIEW_MAX_LENGTH: 100
      }
    };
    
    // Initialize modular components
    this.performanceMonitor = new PerformanceMonitor();
    this.inputManager = new InputManager(this.resources, this.CONSTANTS);
    this.eventManager = new EventManager(this.resources, this.CONSTANTS);
    this.settings = {
      hotkey: 'Ctrl+Shift+P',
      textTrigger: 'AI:',
      prompts: []
    };
    this.activeInput = null;
    this.dropdown = null;
    this.selectedIndex = -1;
    this.filteredPrompts = [];
    this.filterValue = ''; // Internal filter value
    this.isDropdownVisible = false;
    this.isHiding = false; // Flag to prevent re-rendering during dropdown hide
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
        const messageHandler = (message) => this.handleMessage(message);
        browser.runtime.onMessage.addListener(messageHandler);
        this._messageRegistered = true;
      } catch (_) {}
    }

    // Register DOM/input listeners immediately
    if (!this._eventsRegistered) {
      this.setupEventListeners();
      this._eventsRegistered = true;
    }

    // Cleanup on page unload
    this.resources.addEventListener(window, 'beforeunload', () => this.destroy(), { once: true });

    // Ensure DOM is ready before any DOM-dependent operations, but don't block overall init
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      // DOM already loaded, init immediately
      this.init();
    }
  }

  async init() {
    const perfTimer = this.performanceMonitor.startTimer('extension_init');
    
    try {
      if (this.resources?.isDestroyed) {
        return;
      }

      // Proceed as soon as the DOM is at least interactive to avoid long delays on SPA pages
      await this.waitForDOM();

      // Load secure component renderer with error boundary
      try {
        await createSecureRenderer();
      } catch (rendererError) {
        // Continue without component rendering - use fallback
      }

      // Load settings from background (non-blocking defaults already set)
      let retries = 5;
      while (retries > 0 && !this.resources?.isDestroyed) {
        try {
          const s = await this.sendMessage({ action: 'getSettings' });
          if (s && typeof s === 'object') {
            // Validate critical settings structure
            this.settings = {
              hotkey: s.hotkey || 'Ctrl+Shift+P',
              textTrigger: s.textTrigger || 'AI:',
              prompts: Array.isArray(s.prompts) ? s.prompts : [],
              ...s
            };
            break;
          }
        } catch (settingsError) {
        }
        
        retries--;
        if (retries > 0 && !this.resources?.isDestroyed) {
          await new Promise(r => this.resources.setTimeout(r, this.CONSTANTS.TIMEOUTS.RETRY_DELAY));
        }
      }

      // Small delay to ensure page is fully rendered
      if (!this.resources?.isDestroyed) {
        await new Promise(resolve => this.resources.setTimeout(resolve, this.CONSTANTS.TIMEOUTS.FOCUS_DELAY));
      }

      this.performanceMonitor.endTimer(perfTimer);
      
    } catch (error) {
      this.performanceMonitor.recordError('extension_init');
      this.performanceMonitor.endTimer(perfTimer);
      
      // Only retry if not destroyed and not in an infinite loop
      if (!this.resources?.isDestroyed && error?.message !== 'Extension context invalidated') {
        this.resources.setTimeout(() => this.init(), this.CONSTANTS.TIMEOUTS.INIT_RETRY_DELAY);
      }
    }
  }

  // CRITICAL: Destroy method for cleanup
  destroy() {
    try {
      // Hide dropdown if visible
      if (this.isDropdownVisible) {
        this.hideDropdown();
      }
      
      // Log final performance report before destruction
      if (this.performanceMonitor) {
        const report = this.performanceMonitor.getReport();
        if (Object.keys(report.operations).length > 0) {
        }
        this.performanceMonitor.disable();
        this.performanceMonitor = null;
      }
      
      // Clear all resources
      this.resources.destroy();
      
      // Clean up DOM references
      this.dropdown = null;
      this.activeInput = null;
      
      // Reset state
      this.isDropdownVisible = false;
      this.isInDropdownMode = false;
      this.isInPlaceholderMode = false;
      
    } catch (error) {
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
            // Use basic setTimeout for DOM readiness check (before ResourceManager is fully initialized)
            setTimeout(checkReady, 25);
          }
        };
        checkReady();
      }
    });
  }

  async sendMessage(message) {
    try {
      if (!message || typeof message !== 'object') {
        throw new Error('Invalid message format');
      }
      
      if (!browser?.runtime?.sendMessage) {
        throw new Error('Browser runtime not available');
      }
      
      const response = await browser.runtime.sendMessage(message);
      
      // Handle extension context invalidation
      if (browser.runtime.lastError) {
        throw new Error(browser.runtime.lastError.message);
      }
      
      return response;
    } catch (error) {
      
      // Handle specific error scenarios
      if (error?.message?.includes('Extension context invalidated')) {
        this.destroy();
        return null;
      }
      
      return null;
    }
  }


  /**
   * Find the currently active editable element using focus and selection fallback
   * @returns {Element|null} The active editable element or null
   */
  findActiveEditableElement() {
    // Prefer the currently focused element
    let target = document.activeElement;
    let editable = this.isInputElement(target) ? this.inputManager.getEditableRoot(target) : null;

    // Fallback: use current selection's editable root if focus isn't on an input/editor
    if (!editable) {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.anchorNode) {
        const anchorEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
        editable = this.inputManager.getEditableRoot(anchorEl);
      }
    }

    return editable;
  }

  handleMessage(message) {
    try {
      if (!message || typeof message !== 'object') {
        return;
      }
      
      if (this.resources?.isDestroyed) {
        return;
      }

      switch (message.action) {
        case 'showPromptDropdown':
          try {
            // Toggle dropdown: hide if visible, show if hidden
            if (this.isDropdownVisible) {
              this.resetDropdownMode();
            } else {
              const editable = this.findActiveEditableElement();
              if (editable && !this.resources?.isDestroyed) {
                this.activeInput = editable;
                this.resources.setTimeout(() => { 
                  if (!this.resources?.isDestroyed) {
                    this.activateDropdownMode('hotkey'); 
                  }
                }, this.CONSTANTS.TIMEOUTS.ACTIVATION_DELAY);
              }
            }
          } catch (error) {
          }
          break;

        case 'settingsUpdated':
          try {
            if (message.settings && typeof message.settings === 'object') {
              // Validate and merge settings safely
              this.settings = {
                ...this.settings,
                ...message.settings,
                prompts: Array.isArray(message.settings.prompts) ? message.settings.prompts : this.settings.prompts || []
              };
            }
          } catch (error) {
          }
          break;
          
        case 'getPerformanceReport':
          try {
            return this.performanceMonitor ? this.performanceMonitor.getReport() : null;
          } catch (error) {
            return null;
          }
          
        default:
      }
    } catch (error) {
      if (this.performanceMonitor) {
        this.performanceMonitor.recordError('message_handling');
      }
    }
  }

  setupEventListeners() {
    // Monitor all input fields
    this.resources.addEventListener(document, 'focusin', (e) => {
      const editableRoot = this.inputManager.getEditableRoot(e.target);
      
      if (editableRoot && !this.isPlaceholderInput(e.target)) {
        // Only track the active input if we're not already in dropdown mode for another element
        // and if the target isn't part of another dropdown/modal
        if (!this.isPartOfOtherDropdown(e.target)) {
          this.activeInput = editableRoot;
        }
      }
    });

    this.resources.addEventListener(document, 'focusout', (e) => {
      // Don't handle focusout when in placeholder mode at all
      if (this.isInPlaceholderMode) {
        return;
      }
      
      // Only handle focusout for the main input
      if (e.target === this.activeInput) {
        this.resources.setTimeout(() => {
          if (!this.shouldKeepDropdownOpen()) {
            this.resetDropdownMode();
            this.activeInput = null;
          } else {
          }
        }, 100);
      }
    });

    // Handle keyboard events - use capture phase for more control over event flow
    this.resources.addEventListener(document, 'keydown', (e) => {
      this.handleKeydown(e);
    }, { capture: true });

    this.resources.addEventListener(document, 'input', (e) => {
      if (this.isInputElement(e.target) && !this.isPlaceholderInput(e.target)) {
        this.handleInput(e);
      }
    });

    // Listen for keyup events as a fallback for editors that don't fire input events reliably
    this.resources.addEventListener(document, 'keyup', (e) => {
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
    this.resources.addEventListener(document, 'click', (e) => {
      // Check if click is truly outside the dropdown
      const isInsideDropdown = this.dropdown && this.dropdown.contains(e.target);
      const isOnActiveInput = e.target === this.activeInput;
      const isOnPromptItem = e.target.closest && e.target.closest('.ai-prompt-item');
      
      if (this.dropdown && !isInsideDropdown && !isOnActiveInput && !isOnPromptItem) {
        // Don't close dropdown if click is on another dropdown/modal that should take precedence
        if (!this.isPartOfOtherDropdown(e.target)) {
          // Close dropdown completely when clicking outside
          if (this.isInPlaceholderMode) {
            this.resetPlaceholderMode();
          }
          this.hideDropdown();
        }
      }
    });
  }

  isInputElement(element) {
    const editableRoot = this.inputManager.getEditableRoot(element);
    return Boolean(editableRoot);
  }


  handleKeydown(e) {
    // GLOBAL EVENT FIREWALL: Aggressively block keyboard events when dropdown is active
    // but only for events that should be exclusively ours
    if (this.isDropdownVisible || this.isInPlaceholderMode) {
      const isFromOurDropdown = this.dropdown && this.dropdown.contains(e.target);
      const isFromOurInput = this.activeInput && (e.target === this.activeInput || this.activeInput.contains(e.target));
      const isFromPlaceholderInput = this.isPlaceholderInput(e.target);
      
      // If this is a key we handle AND it's from our controlled elements, block everything else
      const keysWeHandle = ['Enter', 'ArrowDown', 'ArrowUp', 'Escape', 'Tab'];
      const isOurKey = keysWeHandle.includes(e.key);
      const isFromOurElements = isFromOurDropdown || isFromOurInput || isFromPlaceholderInput;
      
      if (isOurKey && isFromOurElements) {
        // Block the event immediately at capture phase
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Continue with our handling and return
        this.handleOurKeydownEvents(e);
        return;
      } else if (isOurKey && !isFromOurElements && this.isDropdownVisible) {
        // Key we handle but from external element while dropdown is open - let it pass through
        // This allows other dropdowns to work normally
        return;
      }

      // Handle keystroke filtering when dropdown is visible and not in placeholder mode
      if (this.isDropdownVisible && !this.isInPlaceholderMode) {
        if (e.key.length === 1) {
          // Printable character - add to filter
          this.filterValue = (this.filterValue || '') + e.key;
          this.applyInternalFilter();
          this.renderDropdown();
          e.preventDefault();
          e.stopPropagation();
          return;
        } else if (e.key === 'Backspace') {
          // Remove last character from filter
          if (this.filterValue && this.filterValue.length > 0) {
            this.filterValue = this.filterValue.slice(0, -1);
            this.applyInternalFilter();
            this.renderDropdown();
          }
          e.preventDefault();
          e.stopPropagation();
          return;
        } else if (e.key === 'Escape') {
          // Clear filter
          if (this.filterValue) {
            this.filterValue = '';
            this.applyInternalFilter();
            this.renderDropdown();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
    }
    
    // Only handle non-conflicting cases or when dropdown is not active
    if (!this.isDropdownVisible && !this.isInPlaceholderMode) {
      this.handleOurKeydownEvents(e);
    }
  }
  
  handleOurKeydownEvents(e) {
    // Handle placeholder mode first
    if (this.isInPlaceholderMode) {
      // Only handle events from our placeholder inputs or dropdown
      const isFromPlaceholderInput = this.isPlaceholderInput(e.target);
      const isFromOurDropdown = this.dropdown && this.dropdown.contains(e.target);
      
      if (isFromPlaceholderInput || isFromOurDropdown) {
        switch (e.key) {
          case 'Enter':
            this.insertPromptWithPlaceholders();
            return;

          case 'Tab':
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
              this.navigateToPreviousPlaceholder();
            } else {
              this.navigateToNextPlaceholder();
            }
            return;

          case 'ArrowDown':
            this.navigateToNextPlaceholder();
            return;

          case 'ArrowUp':
            this.navigateToPreviousPlaceholder();
            return;

          case 'Escape':
            this.exitPlaceholderMode();
            return;
        }
      }
      // If not from our elements in placeholder mode, let the event proceed normally
      return;
    }

    // Handle custom hotkey - only when focused on an editable element
    if (this.eventManager.matchesHotkey(e, this.settings?.hotkey)) {
      const editable = this.findActiveEditableElement();
      if (editable) {
        // Only avoid activation if the target itself is part of another dropdown
        // But still allow activation if just other dropdowns exist on the page
        if (!this.isPartOfOtherDropdown(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          
          // Toggle dropdown: hide if visible, show if hidden
          if (this.isDropdownVisible) {
            this.resetDropdownMode();
          } else {
            this.activeInput = editable;
            this.resources.setTimeout(() => { this.activateDropdownMode('hotkey'); }, this.CONSTANTS.TIMEOUTS.ACTIVATION_DELAY);
          }
          return false;
        }
      }
      // If not focused on an editable element, let the event proceed normally
      return;
    }

    // When dropdown is visible, only intercept Enter events from relevant elements
    if (this.isDropdownVisible && e.key === 'Enter') {
      // Only intercept if the event is from our dropdown items or when we're actively filtering
      const isFromOurDropdown = this.dropdown && this.dropdown.contains(e.target);
      const isFromActiveInputInDropdownMode = this.isInDropdownMode && 
        (e.target === this.activeInput || (this.activeInput && this.activeInput.contains(e.target)));
      
      if (isFromOurDropdown || isFromActiveInputInDropdownMode) {
        e.preventDefault();
        e.stopPropagation();
        // Use stopImmediatePropagation only for our controlled elements
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
    }



    // Handle dropdown navigation
    if (this.isDropdownVisible) {
      // Only handle navigation if we're in dropdown mode and the event is from our elements
      const isFromOurDropdown = this.dropdown && this.dropdown.contains(e.target);
      const isFromActiveInputInDropdownMode = this.isInDropdownMode && 
        (e.target === this.activeInput || (this.activeInput && this.activeInput.contains(e.target)));
      
      if (isFromOurDropdown || isFromActiveInputInDropdownMode) {
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
              return false; // Exit immediately after handling placeholder mode
            } else {
              // Store activeInput before reset for focus restoration
              const inputToRestoreFocus = this.activeInput;
              
              // Reset dropdown mode completely
              this.resetDropdownMode();
              
              // Restore focus to original input
              if (inputToRestoreFocus && document.body.contains(inputToRestoreFocus)) {
                this.resources.setTimeout(() => {
                  try {
                    inputToRestoreFocus.focus({ preventScroll: true });
                  } catch (e) {
                    // Input may have been removed from DOM
                  }
                }, 10);
              }
            }
            return false;
        }
      }
    }
  }

  handleInput(e) {
    if (!this.settings) return;

    // Ignore input events immediately after prompt insertion to prevent
    // the inserted prompt text from being treated as filter input
    if (this.justInsertedPrompt) return;

    const input = e.target;
    const value = this.inputManager.getInputValue(input);
    const cursorPos = this.inputManager.getCursorPosition(input);



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
      const cursorPos = this.inputManager.getCursorPosition(this.activeInput);
      this.dropdownModeLastCursorPos = cursorPos;
      const value = this.inputManager.getInputValue(this.activeInput);
      const beforeCursor = value.substring(0, cursorPos);
      
      // For hotkey, start filtering from the last word
      const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
      this.dropdownModeStartPosition = lastSpaceIndex + 1;
      
      // Always show all prompts initially when triggered by hotkey
      this.filterAndShowPromptsWithBestMatch('');
    } else if (type === 'textTrigger') {
      this.dropdownModeStartPosition = startPosition + this.settings.textTrigger.length;
      
      // Get text after trigger for filtering
      const value = this.inputManager.getInputValue(this.activeInput);
      const cursorPos = this.inputManager.getCursorPosition(this.activeInput);
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
    // Set hiding flag immediately to prevent renders during reset
    this.isHiding = true;
    this.isInDropdownMode = false;
    this.dropdownModeType = null;
    this.dropdownModeStartPosition = -1;
    this.dropdownModeLastCursorPos = -1;
    this.filteredPrompts = []; // Clear immediately to prevent blinking
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
    
    this.renderPlaceholderForm();
    
    // Position after content is fully rendered
    this.resources.setTimeout(() => {
      this.positionDropdown();
      // Focus after positioning is complete
      this.resources.setTimeout(() => {
        this.focusCurrentPlaceholder();
      }, 10);
    }, 10);
  }

  renderPlaceholderForm() {
    // Use Preact component rendering instead
    this.renderDropdown(true); // Skip positioning since it's handled in showPlaceholderForm
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
      this.resources.setTimeout(() => {
        currentHighlight.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }, 10);
    }
  }


  focusCurrentPlaceholder() {
    // Only focus if we're still in placeholder mode
    if (!this.isInPlaceholderMode) {
      return;
    }
    
    // Use double requestAnimationFrame for more stable focus
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const activeInput = this.dropdown.querySelector(`.placeholder-input[data-placeholder-index="${this.currentPlaceholderIndex}"]`);
        if (activeInput && this.isInPlaceholderMode) {
          // Ensure the input is ready for focus and we're still in the right mode
          if (activeInput.offsetParent !== null) {
            activeInput.focus({ preventScroll: true });
            activeInput.select();
          } else if (this.isInPlaceholderMode) {
            // Retry if element isn't rendered yet, but only if still in placeholder mode
            this.resources.setTimeout(() => this.focusCurrentPlaceholder(), 10);
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





  // Internal filter handling for dropdown-based filtering
  handleInternalFilterChange(value) {
    this.filterValue = value;
    this.applyInternalFilter();
  }

  // Apply internal filter based on filterValue
  applyInternalFilter() {
    const perfTimer = this.performanceMonitor.startTimer('internal_filtering');
    
    if (!this.settings?.prompts?.length) {
      this.performanceMonitor.endTimer(perfTimer);
      return;
    }

    const queryLower = this.filterValue.toLowerCase().trim();

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

    // Reset selection to first item
    this.selectedIndex = this.filteredPrompts.length > 0 ? 0 : -1;
    
    // Re-render dropdown with new filtered results
    this.renderDropdown();
    
    this.performanceMonitor.endTimer(perfTimer);
  }

  filterAndShowPromptsWithBestMatch(query) {
    const perfTimer = this.performanceMonitor.startTimer('prompt_filtering');
    
    // Don't filter if not in dropdown mode (prevents blinking during reset)
    if (!this.isInDropdownMode) {
      this.performanceMonitor.endTimer(perfTimer);
      return;
    }
    
    if (!this.settings?.prompts?.length) {
      this.performanceMonitor.endTimer(perfTimer);
      this.showNoPromptsMessage();
      return;
    }

    // For external filtering (hotkey/text trigger), clear internal filter
    this.filterValue = '';
    
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

    // Check if filtering resulted in no matches
    if (this.filteredPrompts.length === 0 && queryLower) {
      // Show "no matches" message for filtered results
      this.showNoMatchesMessage(queryLower);
      this.performanceMonitor.endTimer(perfTimer);
      return;
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
    
    this.performanceMonitor.endTimer(perfTimer);
  }

  createDropdown() {
    if (this.dropdown) {
      this.dropdown.remove();
    }

    // Create container for Preact component
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'ai-prompt-container';
    this.dropdown.setAttribute('role', 'listbox');
    this.dropdown.setAttribute('tabindex', '-1'); // Make focusable but not tabbable
    
    // Pre-position off-screen to prevent jitter
    this.dropdown.style.position = 'absolute';
    this.dropdown.style.top = '-9999px';
    this.dropdown.style.left = '-9999px';
    this.dropdown.style.opacity = '0';
    
    // Ensure mouse wheel scrolling works properly
    const wheelHandler = (e) => {
      e.stopPropagation();
      // Let the scroll container handle the wheel event
      const scrollContainer = this.dropdown?.querySelector('.ai-scroll');
      if (scrollContainer) {
        scrollContainer.scrollTop += e.deltaY;
      }
    };
    
    this.resources.addEventListener(this.dropdown, 'wheel', wheelHandler, { passive: true });
    
    document.body.appendChild(this.dropdown);
  }

  renderDropdown(skipPositioning = false) {
    const perfTimer = this.performanceMonitor.startTimer('dropdown_render');
    
    try {
      if (!this.dropdown) {
        return;
      }
      
      if (this.resources?.isDestroyed) {
        return;
      }
      
      // Skip rendering if dropdown is in the process of being hidden
      if (this.isHiding) {
        this.performanceMonitor.endTimer(perfTimer);
        return;
      }

      if (!window.preact || !window.render || !window.h || !window.PromptDropdown) {
        
        // Try to re-setup components if Preact is available but components aren't
        if (window.preact && !window.PromptDropdown) {
          try {
            window.h = window.preact.h;
            window.render = window.preact.render;
            setupPreactComponents();
          } catch (setupError) {
          }
        }
        
        // Check again after re-setup attempt
        if (!window.preact || !window.render || !window.h || !window.PromptDropdown) {
          return this.renderDropdownFallback();
        }
      }

      // Auto-select first item if none selected
      if (this.filteredPrompts?.length > 0 && this.selectedIndex === -1) {
        this.selectedIndex = 0;
      }

      // Render component with error boundary
      try {
        const component = window.h(window.PromptDropdown, {
            prompts: this.filteredPrompts || [],
            selectedIndex: this.selectedIndex,
            onSelectPrompt: (index) => {
              try {
                if (typeof index === 'number' && index >= 0 && this.filteredPrompts?.[index]) {
                  this.selectedIndex = index;
                  this.insertSelectedPrompt();
                }
              } catch (error) {
              }
            },
            onSelectIndex: (index) => {
              try {
                if (typeof index === 'number' && index >= 0) {
                  this.selectedIndex = index;
                  // Safe async scroll with error handling
                  this.resources.setTimeout(() => {
                    try {
                      const items = this.dropdown?.querySelectorAll('.ai-prompt-item');
                      if (this.selectedIndex >= 0 && items?.[this.selectedIndex]) {
                        items[this.selectedIndex].scrollIntoView({ 
                          block: 'nearest', 
                          behavior: 'smooth' 
                        });
                      }
                    } catch (scrollError) {
                    }
                  }, 10);
                }
              } catch (error) {
              }
            },
            isPlaceholderMode: this.isInPlaceholderMode,
            placeholders: this.placeholders || [],
            placeholderValues: this.placeholderValues || {},
            currentPlaceholderIndex: this.currentPlaceholderIndex,
            onPlaceholderChange: (name, value) => {
              try {
                if (name && this.placeholderValues) {
                  this.placeholderValues[name] = String(value || '');
                  this.updatePreview();
                }
              } catch (error) {
              }
            },
            onPlaceholderNavigate: (index) => {
              try {
                if (typeof index === 'number' && index >= 0 && index < (this.placeholders?.length || 0)) {
                  this.currentPlaceholderIndex = index;
                  this.updatePreview();
                }
              } catch (error) {
              }
            },
            onInsertPrompt: () => {
              try {
                this.insertPromptWithPlaceholders();
              } catch (error) {
              }
            },
            onExitPlaceholder: () => {
              try {
                this.exitPlaceholderMode();
              } catch (error) {
              }
            },
            onFilterChange: (value) => {
              try {
                this.handleInternalFilterChange(value);
              } catch (error) {
              }
            },
            filterValue: this.filterValue || '',
            settings: this.settings || {}
          });
        
        
        // Update container class for placeholder mode
        if (this.isInPlaceholderMode) {
          this.dropdown.className = 'ai-prompt-container placeholder-mode';
        } else {
          this.dropdown.className = 'ai-prompt-container';
        }
        
        window.render(component, this.dropdown);
        
        // Position and show the dropdown (skip if just updating content)
        if (!skipPositioning) {
          this.positionDropdown();
        }
      } catch (renderError) {
        this.renderDropdownFallback();
        return;
      }

      // Update preview if in placeholder mode
      if (this.isInPlaceholderMode && !this.resources?.isDestroyed) {
        this.resources.setTimeout(() => {
          try {
            this.updatePreview();
          } catch (previewError) {
          }
        }, 10);
      }
      
      this.performanceMonitor.endTimer(perfTimer);
      
    } catch (error) {
      this.performanceMonitor.recordError('dropdown_render');
      this.performanceMonitor.endTimer(perfTimer);
      this.renderDropdownFallback();
    }
  }

  // Simplified fallback - just show a basic message
  renderDropdownFallback() {
    if (this.dropdown) {
      this.dropdown.innerHTML = '<div class="ai-prompt-no-results">Component loading failed</div>';
    }
  }

  positionDropdown() {
    try {
      if (!this.dropdown) {
        return;
      }
      
      if (this.resources?.isDestroyed) {
        return;
      }

      // Use single requestAnimationFrame for smoother positioning
      requestAnimationFrame(() => {
        try {
          let top, left, width;
          const viewportHeight = window.innerHeight || 600;
          const viewportWidth = window.innerWidth || 800;
          const documentHeight = document.documentElement?.scrollHeight || viewportHeight;
          const currentScrollY = window.scrollY || 0;

          // Get dropdown dimensions early for better collision detection
          const dropdownHeight = this.dropdown?.offsetHeight || 300; // fallback estimate
          
          // For contenteditable elements, try to use caret position for better UX
          // For input/textarea, use element bounds
          let targetRect;
          
          if (this.activeInput && (this.activeInput.isContentEditable || this.activeInput.contentEditable === 'true')) {
            // Try to get caret position for contenteditable elements
            try {
              targetRect = this.getCaretClientRect(this.activeInput);
            } catch (caretError) {
              targetRect = null;
            }
            
            // Fallback to input rect if caret rect fails
            if (!targetRect) {
              try {
                targetRect = this.activeInput?.getBoundingClientRect();
              } catch (rectError) {
                targetRect = null;
              }
            }
          } else {
            // For input/textarea, always use element rect
            try {
              targetRect = this.activeInput ? this.activeInput.getBoundingClientRect() : null;
            } catch (rectError) {
              targetRect = null;
            }
          }

          if (targetRect && targetRect.width >= 0 && targetRect.height >= 0) {
            const spaceBelow = viewportHeight - targetRect.bottom;
            const spaceAbove = targetRect.top;
            const dropdownWidth = this.dropdown?.offsetWidth || Math.max(300, targetRect.width);
            
            // Check if dropdown would cause page scrolling or extend beyond viewport
            const wouldCauseScroll = (targetRect.bottom + dropdownHeight + 20 + currentScrollY) > documentHeight;
            const insufficientSpaceBelow = spaceBelow < (dropdownHeight + 20);
            const sufficientSpaceAbove = spaceAbove > (dropdownHeight + 20);
            
            if ((wouldCauseScroll || insufficientSpaceBelow) && sufficientSpaceAbove) {
              // Position above target with extra margin to avoid interference
              top = targetRect.top + currentScrollY - dropdownHeight - 8;
            } else {
              // Position below target (default)
              top = targetRect.bottom + currentScrollY + 4;
            }
            
            left = targetRect.left + (window.scrollX || 0);
            width = 500; // Fixed width matching CSS
            
            // Adjust horizontal position if it would overflow viewport  
            const dropdownFixedWidth = 500;
            if (left + dropdownFixedWidth > viewportWidth) {
              left = targetRect.right + (window.scrollX || 0) - dropdownFixedWidth;
            }
          } else {
            // Ultimate fallback - center in viewport
            left = Math.max(10, (viewportWidth - 500) / 2);
            top = currentScrollY + Math.max(10, (viewportHeight - dropdownHeight) / 2);
            width = 500;
          }

          // Clamp within viewport bounds to prevent any scrollbar creation
          left = Math.max(10, Math.min(left, viewportWidth - 10));
          top = Math.max(currentScrollY + 10, Math.min(top, currentScrollY + viewportHeight - dropdownHeight - 10));

          // Apply positioning and make visible in one go
          if (this.dropdown && !this.resources?.isDestroyed) {
            this.dropdown.style.top = `${Math.round(top)}px`;
            this.dropdown.style.left = `${Math.round(left)}px`;
            // Don't override width - let CSS handle it (500px)
            this.dropdown.style.height = 'auto';
            this.dropdown.style.zIndex = '10000';
            this.dropdown.style.opacity = '1';
            if (this.dropdown.firstElementChild) {
            }
          } else {
          }
        } catch (positionError) {
          
          // Emergency fallback positioning
          if (this.dropdown && !this.resources?.isDestroyed) {
            this.dropdown.style.top = '100px';
            this.dropdown.style.left = '100px';
            this.dropdown.style.width = '300px';
            this.dropdown.style.zIndex = '10000';
            this.dropdown.style.opacity = '1';
          }
        }
      });
      
    } catch (error) {
    }
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
    // Re-render component to update selection
    if (window.preact && this.isDropdownVisible) {
      this.renderDropdown();
    }
    
    // Scroll selected item into view (works for both Preact and fallback)
    setTimeout(() => {
      const items = this.dropdown.querySelectorAll('.ai-prompt-item');
      if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
        items[this.selectedIndex].scrollIntoView({ 
          block: 'nearest', 
          behavior: 'smooth' 
        });
      }
    }, 10); // Small delay to let Preact render
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
      this.renderDropdown(true); // Re-render to update active state, skip positioning
      // Update preview and focus after render is complete
      this.resources.setTimeout(() => {
        this.updatePreview();
        this.focusCurrentPlaceholder();
      }, 10);
    }
  }

  navigateToPreviousPlaceholder() {
    if (this.currentPlaceholderIndex > 0) {
      this.currentPlaceholderIndex--;
      this.renderDropdown(true); // Re-render to update active state, skip positioning
      // Update preview and focus after render is complete
      this.resources.setTimeout(() => {
        this.updatePreview();
        this.focusCurrentPlaceholder();
      }, 10);
    }
  }

  exitPlaceholderMode() {
    this.resetPlaceholderMode();
    // Go back to prompt selection - Preact will handle the class changes
    this.filterAndShowPromptsWithBestMatch('');
    
    // Ensure dropdown stays focused and visible
    // Use a small delay to let the click event fully process before allowing click-outside detection
    this.resources.setTimeout(() => {
      if (this.dropdown && !this.resources?.isDestroyed) {
        // Focus the dropdown container to prevent focus from going back to activeInput
        this.dropdown.focus();
      }
    }, 10);
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
    const perfTimer = this.performanceMonitor.startTimer('prompt_insertion');
    
    try {
      if (!this.activeInput) {
        return;
      }
      
      if (this.resources?.isDestroyed) {
        return;
      }
      
      if (!content || typeof content !== 'string') {
        return;
      }

      // Verify input still exists in DOM
      try {
        if (!document.body.contains(this.activeInput)) {
          this.activeInput = null;
          return;
        }
      } catch (domError) {
        return;
      }

      // For single-line inputs, convert newlines to spaces
      let processedContent = content;
      if (this.activeInput.tagName === 'INPUT') {
        processedContent = content.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      }

      // If contenteditable and likely controlled by an editor (e.g., ProseMirror),
      // operate via selection + execCommand to let the editor handle DOM/state.
      if (this.activeInput.isContentEditable || this.activeInput.contentEditable === 'true') {
        // Set flag BEFORE any DOM manipulation to prevent input events from triggering filtering
        this.justInsertedPrompt = true;

        // Focus to ensure selection operations apply
        try {
          this.activeInput.focus();
        } catch (focusError) {
          this.activeInput = null;
          return;
        }

        // When in dropdown mode, remove the filter region first
        if (this.isInDropdownMode && this.dropdownModeStartPosition >= 0) {
          try {
            const currentText = this.inputManager.getInputValue(this.activeInput);
            if (typeof currentText === 'string') {
              const cursorPos = this.isInDropdownMode && this.dropdownModeLastCursorPos >= 0
                ? this.dropdownModeLastCursorPos
                : currentText.length;
              
              let start = this.dropdownModeStartPosition;
              let end = cursorPos;
              
              // For text trigger mode, also remove the trigger text itself
              if (this.dropdownModeType === 'textTrigger' && this.settings?.textTrigger) {
                start = this.dropdownModeStartPosition - this.settings.textTrigger.length;
              }
              
              start = Math.max(0, Math.min(start, currentText.length));
              end = Math.max(start, Math.min(end, currentText.length));
              
              this.setSelectionByOffsets(this.activeInput, start, end);
              const sel = window.getSelection();
              if (sel?.rangeCount) {
                const r = sel.getRangeAt(0);
                try { 
                  r.deleteContents(); 
                } catch (deleteError) {
                }
              }
            }
          } catch (selectionError) {
          }
        }

        // Insert text via execCommand (widely supported by editors)
        try {
          const success = document.execCommand('insertText', false, processedContent);
          if (!success) {
            throw new Error('execCommand failed');
          }
        } catch (execError) {
          // Fallback: use selection API
          try {
            const sel = window.getSelection();
            if (sel?.rangeCount) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              const textNode = document.createTextNode(processedContent);
              range.insertNode(textNode);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } catch (fallbackError) {
            return;
          }
        }

        // Dispatch input event to notify frameworks
        try {
          const inputEvent = new Event('input', { bubbles: true });
          this.activeInput.dispatchEvent(inputEvent);
        } catch (eventError) {
        }
        
        // Store activeInput for focus restoration before resetting
        const inputToRestoreFocus = this.activeInput;
        
        this.resetDropdownMode();
        this.resources.setTimeout(() => { this.justInsertedPrompt = false; }, 500);
        
        // Restore focus to original input after a brief delay
        this.resources.setTimeout(() => {
          if (inputToRestoreFocus && document.body.contains(inputToRestoreFocus)) {
            try {
              inputToRestoreFocus.focus({ preventScroll: true });
            } catch (e) {
              // Input may have been removed from DOM
            }
          }
        }, 50);
        
        // Stop tracking this input to prevent focusout interference
        this.activeInput = null;
        return;
      }

      // Fallback: value-based replace for INPUT/TEXTAREA
      try {
        // Set flag BEFORE any value manipulation to prevent input events from triggering filtering
        this.justInsertedPrompt = true;

        const currentValue = this.inputManager.getInputValue(this.activeInput);
        if (typeof currentValue !== 'string') {
          return;
        }
        
        let cursorPos = this.isInDropdownMode && this.dropdownModeLastCursorPos >= 0
          ? this.dropdownModeLastCursorPos
          : this.inputManager.getCursorPosition(this.activeInput);
        cursorPos = Math.max(0, Math.min(cursorPos, currentValue.length));

        let newValue, newCursorPos;

        if (this.isInDropdownMode && this.dropdownModeStartPosition >= 0) {
          const beforeStart = currentValue.substring(0, this.dropdownModeStartPosition);
          const afterCursor = currentValue.substring(cursorPos);
          if (this.dropdownModeType === 'textTrigger' && this.settings?.textTrigger) {
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

        this.inputManager.setInputValue(this.activeInput, newValue);
        this.inputManager.setCursorPosition(this.activeInput, newCursorPos);
      } catch (valueError) {
        return;
      }
      
      // Store activeInput for focus restoration before resetting
      const inputToRestoreFocus = this.activeInput;
      
      // Dispatch input event to notify frameworks  
      this.resources.setTimeout(() => {
        try {
          if (inputToRestoreFocus && document.body.contains(inputToRestoreFocus)) {
            const inputEvent = new Event('input', { bubbles: true });
            inputToRestoreFocus.dispatchEvent(inputEvent);
          }
        } catch (eventError) {
        }
      }, 50);

      this.resetDropdownMode();
      this.resources.setTimeout(() => { this.justInsertedPrompt = false; }, 500);
      
      // Restore focus to original input after a brief delay
      this.resources.setTimeout(() => {
        if (inputToRestoreFocus && document.body.contains(inputToRestoreFocus)) {
          try {
            inputToRestoreFocus.focus({ preventScroll: true });
          } catch (e) {
            // Input may have been removed from DOM
          }
        }
      }, 100);
      
      // Stop tracking this input to prevent focusout interference
      this.activeInput = null;
      
      this.performanceMonitor.endTimer(perfTimer);
      
    } catch (error) {
      this.performanceMonitor.recordError('prompt_insertion');
      this.performanceMonitor.endTimer(perfTimer);
      // Clean up state on critical error
      this.justInsertedPrompt = false;
      this.resetDropdownMode();
      this.activeInput = null;
    }
  }


  hideDropdown() {
    // Set hiding flag to prevent re-rendering during hide process
    this.isHiding = true;
    
    if (this.dropdown) {
      // Fade out smoothly before removing
      this.dropdown.style.opacity = '0';
      this.resources.setTimeout(() => {
        if (this.dropdown) {
          this.dropdown.remove();
          this.dropdown = null;
        }
        // Clear filtered prompts after DOM removal to prevent flashing
        this.filteredPrompts = [];
        this.isHiding = false; // Reset hiding flag
      }, 150); // Match CSS transition duration
    } else {
      // No dropdown element, just clean up immediately
      this.filteredPrompts = [];
      this.isHiding = false;
    }
    this.isDropdownVisible = false;
    this.selectedIndex = -1;
    
    // Only restore focus if it's appropriate and won't interfere with other elements
    // Focus restoration after insertion is handled separately in insertion methods
    const inputToFocus = this.activeInput;
    if (inputToFocus && !this.justInsertedPrompt && this.shouldRestoreFocus()) {
      this.resources.setTimeout(() => {
        try {
          // Double check that focus restoration is still appropriate
          if (this.shouldRestoreFocus() && document.body.contains(inputToFocus)) {
            inputToFocus.focus({ preventScroll: true });
          }
        } catch (e) {
          // Input may have been removed from DOM
        }
      }, 10);
    }
  }

  isPlaceholderInput(element) {
    return element && element.classList && element.classList.contains('placeholder-input');
  }

  /**
   * Check if the element is part of another dropdown or modal that should not be interfered with
   * @param {Element} element - The element to check
   * @returns {boolean} True if the element is part of another dropdown/modal
   */
  isPartOfOtherDropdown(element) {
    if (!element) return false;
    
    // Check if element is part of our own dropdown
    if (this.dropdown && this.dropdown.contains(element)) {
      return false; // This is our dropdown, not another one
    }
    
    // Common dropdown/modal selectors to avoid interfering with
    const dropdownSelectors = [
      '[role="listbox"]', '[role="menu"]', '[role="combobox"]', '[role="dialog"]',
      '.dropdown', '.menu', '.popover', '.modal', '.autocomplete', '.suggestions',
      '[data-dropdown]', '[data-menu]', '[data-modal]', '[data-popover]',
      '.MuiAutocomplete-popper', '.ant-select-dropdown', '.select2-dropdown',
      // ChatGPT/Perplexity specific selectors
      '[data-testid*="dropdown"]', '[data-testid*="menu"]', '[data-testid*="suggestion"]',
      '.search-suggestions', '.command-palette', '.autocomplete-suggestions'
    ];
    
    // Check if element or any parent matches dropdown selectors
    let current = element;
    while (current && current !== document.body) {
      for (const selector of dropdownSelectors) {
        try {
          if (current.matches && current.matches(selector)) {
            return true;
          }
        } catch (e) {
          // Ignore invalid selector errors
        }
      }
      current = current.parentElement;
    }
    
    return false;
  }

  shouldKeepDropdownOpen() {
    if (!this.dropdown || !this.isDropdownVisible) return false;
    
    // Always keep open if we're in placeholder mode
    if (this.isInPlaceholderMode) {
      return true;
    }
    
    // Keep open if we're actively in dropdown mode (user is typing/navigating)
    if (this.isInDropdownMode) {
      return true;
    }
    
    const activeElement = document.activeElement;
    
    // Keep open if dropdown or its contents are focused
    if (this.dropdown.contains(activeElement)) {
      return true;
    }
    
    // Keep open if activeInput is still focused
    if (activeElement === this.activeInput) {
      return true;
    }
    
    
    return false;
  }

  /**
   * Check if it's appropriate to restore focus to the active input
   * @returns {boolean} True if focus restoration is safe and appropriate
   */
  shouldRestoreFocus() {
    const currentFocus = document.activeElement;
    
    // Don't restore focus if user is interacting with our dropdown
    if (this.dropdown && currentFocus && this.dropdown.contains(currentFocus)) {
      return false;
    }
    
    // Don't restore focus if user has already focused on something else that's clearly interactive
    if (currentFocus && currentFocus !== document.body && currentFocus !== this.activeInput) {
      // Check if the currently focused element is part of another dropdown/modal
      if (this.isPartOfOtherDropdown(currentFocus)) {
        return false; // Don't interfere with other UI elements
      }
    }
    
    // Don't restore focus if our input is part of another dropdown that might be open
    if (this.activeInput && this.isPartOfOtherDropdown(this.activeInput)) {
      return false;
    }
    
    // Only check for conflicting dropdowns that are actually visible and expanded
    const conflictingDropdowns = document.querySelectorAll(
      '[role="listbox"]:not(.ai-prompt-dropdown)[aria-expanded="true"], ' +
      '[role="menu"]:not(.ai-prompt-dropdown)[aria-expanded="true"], ' +
      '[role="combobox"][aria-expanded="true"], ' +
      '.dropdown.show:not(.ai-prompt-dropdown), ' +
      '.menu.open:not(.ai-prompt-dropdown)'
    );
    
    if (conflictingDropdowns.length > 0) {
      return false; // Other dropdowns are actually open and expanded
    }
    
    return true;
  }

  showNoPromptsMessage() {
    // Don't show message if not in dropdown mode (prevents blinking during reset)
    if (!this.isInDropdownMode) {
      return;
    }
    
    this.createDropdown();
    
    // Use Preact to render the message
    if (window.preact && window.render && window.h) {
      window.render(
        window.h('div', { className: 'ai-prompt-no-results' },
          'No prompts saved. ',
          window.h('a', { 
            href: browser.runtime.getURL('options.html'), 
            target: '_blank' 
          }, 'Add prompts in settings')
        ),
        this.dropdown
      );
    } else {
      // Fallback
      this.dropdown.innerHTML = `
        <div class="ai-prompt-no-results">
          No prompts saved. <a href="${browser.runtime.getURL('options.html')}" target="_blank">Add prompts in settings</a>
        </div>
      `;
    }
    
    this.positionDropdown();
    this.isDropdownVisible = true;

    // Auto-hide after 3 seconds
    this.resources.setTimeout(() => {
      this.hideDropdown();
    }, 3000);
  }

  showNoMatchesMessage(query) {
    // Don't show message if not in dropdown mode (prevents blinking during reset)
    if (!this.isInDropdownMode) {
      return;
    }
    
    this.createDropdown();
    
    // Use Preact to render the message
    if (window.preact && window.render && window.h) {
      window.render(
        window.h('div', { className: 'ai-prompt-no-results' },
          `No prompts match "${query}"`
        ),
        this.dropdown
      );
    } else {
      // Fallback
      this.dropdown.innerHTML = `
        <div class="ai-prompt-no-results">
          No prompts match "${this.escapeHtml(query)}"
        </div>
      `;
    }
    
    this.positionDropdown();
    this.isDropdownVisible = true;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the autocomplete system
const aiPromptAutocomplete = new AIPromptAutocomplete();
