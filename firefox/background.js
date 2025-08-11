// Background script for data management and storage
class AIPromptManager {
  constructor() {
    this.defaultSettings = {
      hotkey: 'Ctrl+Shift+P',
      textTrigger: 'AI:',
      showInfoBar: true,
      showMouseButtons: true,
      prompts: []
    };
    this.init();
  }

  async init() {
    // Initialize default settings if not exists
    // Try sync storage first, fallback to local storage for temporary addons
    let result;
    try {
      result = await browser.storage.sync.get(['settings']);
      this.storageArea = 'sync';
    } catch (error) {
      console.log('Sync storage not available, using local storage:', error.message);
      result = await browser.storage.local.get(['settings']);
      this.storageArea = 'local';
    }
    
    if (!result.settings) {
      await this.saveSettings(this.defaultSettings);
    }
    
    // Listen for command from hotkey
    browser.commands.onCommand.addListener((command) => {
      if (command === 'trigger-prompt-dropdown') {
        this.triggerPromptDropdown();
      }
    });

    // Create context menu
    this.createContextMenu();
  }

  createContextMenu() {
    browser.contextMenus.create({
      id: 'save-as-prompt',
      title: 'PromptSensei: save as prompt',
      contexts: ['selection']
    });

    // Listen for context menu clicks
    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'save-as-prompt') {
        this.handleSaveAsPrompt(info.selectionText);
      }
    });
  }

  async handleSaveAsPrompt(selectedText) {
    if (!selectedText || selectedText.trim().length === 0) {
      return;
    }

    // Store the selected text temporarily
    const storage = this.storageArea === 'sync' ? browser.storage.sync : browser.storage.local;
    await storage.set({ 
      pendingPrompt: {
        content: selectedText.trim(),
        timestamp: Date.now()
      }
    });

    // If options page is already open, focus it and let options.js storage listener handle the modal
    try {
      const url = browser.runtime.getURL('options.html');
      const tabs = await browser.tabs.query({ url });
      if (tabs && tabs.length > 0) {
        await browser.tabs.update(tabs[0].id, { active: true });
        await browser.windows.update(tabs[0].windowId, { focused: true });
      } else {
        // Open options page if not already open
        browser.runtime.openOptionsPage();
      }
    } catch (e) {
      // Fallback: open options page
      browser.runtime.openOptionsPage();
    }
  }

  async getSettings() {
    const storage = this.storageArea === 'sync' ? browser.storage.sync : browser.storage.local;
    const result = await storage.get(['settings']);
    return result.settings || this.defaultSettings;
  }

  async saveSettings(settings) {
    const storage = this.storageArea === 'sync' ? browser.storage.sync : browser.storage.local;
    await storage.set({ settings });
    // Notify content scripts of settings update
    this.broadcastSettingsUpdate(settings);
  }

  async addPrompt(prompt) {
    const settings = await this.getSettings();
    const newPrompt = {
      id: Date.now().toString(),
      name: prompt.name,
      content: prompt.content,
      created: new Date().toISOString()
    };
    settings.prompts.push(newPrompt);
    await this.saveSettings(settings);
    return newPrompt;
  }

  async updatePrompt(id, updatedPrompt) {
    const settings = await this.getSettings();
    const index = settings.prompts.findIndex(p => p.id === id);
    if (index !== -1) {
      settings.prompts[index] = { ...settings.prompts[index], ...updatedPrompt };
      await this.saveSettings(settings);
      return settings.prompts[index];
    }
    throw new Error('Prompt not found');
  }

  async deletePrompt(id) {
    const settings = await this.getSettings();
    settings.prompts = settings.prompts.filter(p => p.id !== id);
    await this.saveSettings(settings);
  }

  async triggerPromptDropdown() {
    // Send message to active tab to show dropdown
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'showPromptDropdown' });
      }
    } catch (error) {
      console.error('Error triggering prompt dropdown:', error);
    }
  }

  async broadcastSettingsUpdate(settings) {
    // Notify all content scripts of settings update
    try {
      const tabs = await browser.tabs.query({});
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, { 
          action: 'settingsUpdated', 
          settings 
        }).catch(() => {
          // Ignore errors for tabs that don't have content script
        });
      });
    } catch (error) {
      console.error('Error broadcasting settings update:', error);
    }
  }
}

// Initialize the manager
const promptManager = new AIPromptManager();

// Handle messages from content scripts and options page
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  try {
    switch (message.action) {
      case 'getSettings':
        return await promptManager.getSettings();
      
      case 'saveSettings':
        await promptManager.saveSettings(message.settings);
        return { success: true };
      
      case 'addPrompt':
        return await promptManager.addPrompt(message.prompt);
      
      case 'updatePrompt':
        return await promptManager.updatePrompt(message.id, message.prompt);
      
      case 'deletePrompt':
        await promptManager.deletePrompt(message.id);
        return { success: true };
      
      case 'getPrompts':
        const settings = await promptManager.getSettings();
        return settings.prompts;
      
      case 'getPendingPrompt':
        const storage = this.storageArea === 'sync' ? browser.storage.sync : browser.storage.local;
        const result = await storage.get(['pendingPrompt']);
        return result.pendingPrompt || null;
      
      case 'clearPendingPrompt':
        const storageForClear = this.storageArea === 'sync' ? browser.storage.sync : browser.storage.local;
        await storageForClear.remove(['pendingPrompt']);
        return { success: true };
      
      default:
        throw new Error(`Unknown action: ${message.action}`);
    }
  } catch (error) {
    console.error('Background script error:', error);
    return { error: error.message };
  }
});
