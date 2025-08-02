// Background script for data management and storage
class AIPromptManager {
  constructor() {
    this.defaultSettings = {
      hotkey: 'Ctrl+Shift+P',
      textTrigger: 'AI:',
      prompts: []
    };
    this.init();
  }

  async init() {
    // Initialize default settings if not exists
    const result = await browser.storage.local.get(['settings']);
    if (!result.settings) {
      await this.saveSettings(this.defaultSettings);
    }
    
    // Listen for command from hotkey
    browser.commands.onCommand.addListener((command) => {
      if (command === 'trigger-prompt-dropdown') {
        this.triggerPromptDropdown();
      }
    });
  }

  async getSettings() {
    const result = await browser.storage.local.get(['settings']);
    return result.settings || this.defaultSettings;
  }

  async saveSettings(settings) {
    await browser.storage.local.set({ settings });
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
      
      default:
        throw new Error(`Unknown action: ${message.action}`);
    }
  } catch (error) {
    console.error('Background script error:', error);
    return { error: error.message };
  }
});
