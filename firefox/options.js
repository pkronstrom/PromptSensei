// Options page script for managing prompts and settings
class OptionsManager {
  constructor() {
    this.settings = null;
    this.editingPromptId = null;
    this.deletingPromptId = null;
    this.isRecordingHotkey = false;
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.renderUI();
    this.setupEventListeners();
    await this.checkForPendingPrompt();
  }

  async checkForPendingPrompt() {
    try {
      const pendingPrompt = await browser.runtime.sendMessage({ action: 'getPendingPrompt' });
      if (pendingPrompt && pendingPrompt.content) {
        // Clear the pending prompt
        await browser.runtime.sendMessage({ action: 'clearPendingPrompt' });
        
        // Show the prompt modal with the pending content
        this.showPromptModalWithContent(pendingPrompt.content);
      }
    } catch (error) {
      console.error('Error checking for pending prompt:', error);
    }
  }

  showPromptModalWithContent(content) {
    this.editingPromptId = null;
    
    const modal = document.getElementById('prompt-modal');
    const title = document.getElementById('modal-title');
    const nameInput = document.getElementById('prompt-name');
    const contentInput = document.getElementById('prompt-content');

    title.textContent = 'Save Selected Text as Prompt';
    title.setAttribute('data-context', 'selection');
    nameInput.value = '';
    contentInput.value = content;

    this.updateCharacterCount(contentInput.value.length);
    modal.style.display = 'flex';
    nameInput.focus();
  }

  async loadSettings() {
    try {
      this.settings = await browser.runtime.sendMessage({ action: 'getSettings' });
      if (!this.settings) {
        this.settings = {
          hotkey: 'Ctrl+Shift+P',
          textTrigger: 'AI:',
          prompts: []
        };
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      this.showError('Failed to load settings');
    }
  }

  renderUI() {
    this.renderSettings();
    this.renderPrompts();
  }

  renderSettings() {
    document.getElementById('hotkey-input').value = this.settings.hotkey || 'Ctrl+Shift+P';
    document.getElementById('text-trigger-input').value = this.settings.textTrigger || 'AI:';
  }

  renderPrompts() {
    const promptsList = document.getElementById('prompts-list');
    const emptyState = document.getElementById('empty-state');
    
    if (!this.settings.prompts || this.settings.prompts.length === 0) {
      promptsList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    promptsList.innerHTML = '';

    this.settings.prompts.forEach(prompt => {
      const promptCard = this.createPromptCard(prompt);
      promptsList.appendChild(promptCard);
    });
  }

  createPromptCard(prompt) {
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.innerHTML = `
      <div class="prompt-header">
        <h4 class="prompt-name">${this.escapeHtml(prompt.name)}</h4>
        <div class="prompt-actions">
          <button class="btn btn-small btn-secondary edit-btn" data-id="${prompt.id}">Edit</button>
          <button class="btn btn-small btn-danger delete-btn" data-id="${prompt.id}">Delete</button>
        </div>
      </div>
      <div class="prompt-content">
        ${this.escapeHtml(this.truncateToLines(prompt.content, 4))}
      </div>
      <div class="prompt-meta">
        Created: ${new Date(prompt.created).toLocaleDateString()}
      </div>
    `;

    // Add event listeners
    card.querySelector('.edit-btn').addEventListener('click', () => {
      this.editPrompt(prompt.id);
    });

    card.querySelector('.delete-btn').addEventListener('click', () => {
      this.showDeleteConfirmation(prompt.id);
    });

    return card;
  }

  setupEventListeners() {
    // Settings
    document.getElementById('save-settings-btn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Hotkey recording
    const hotkeyInput = document.getElementById('hotkey-input');
    hotkeyInput.addEventListener('click', () => {
      this.startHotkeyRecording();
    });

    // Add prompt
    document.getElementById('add-prompt-btn').addEventListener('click', () => {
      this.showPromptModal();
    });

    // Export/Import prompts
    document.getElementById('export-prompts-btn').addEventListener('click', () => {
      this.exportPrompts();
    });

    document.getElementById('import-prompts-btn').addEventListener('click', () => {
      document.getElementById('import-file-input').click();
    });

    document.getElementById('import-file-input').addEventListener('change', (e) => {
      this.importPrompts(e.target.files[0]);
    });

    // Prompt modal
    document.getElementById('close-modal').addEventListener('click', () => {
      this.hidePromptModal();
    });

    document.getElementById('cancel-btn').addEventListener('click', () => {
      this.hidePromptModal();
    });

    document.getElementById('prompt-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePrompt();
    });

    // Character counter
    document.getElementById('prompt-content').addEventListener('input', (e) => {
      this.updateCharacterCount(e.target.value.length);
    });

    // Delete modal
    document.getElementById('close-delete-modal').addEventListener('click', () => {
      this.hideDeleteModal();
    });

    document.getElementById('cancel-delete-btn').addEventListener('click', () => {
      this.hideDeleteModal();
    });

    document.getElementById('confirm-delete-btn').addEventListener('click', () => {
      this.deletePrompt();
    });

    // Modal backdrop clicks
    document.getElementById('prompt-modal').addEventListener('click', (e) => {
      if (e.target.id === 'prompt-modal') {
        this.hidePromptModal();
      }
    });

    document.getElementById('delete-modal').addEventListener('click', (e) => {
      if (e.target.id === 'delete-modal') {
        this.hideDeleteModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.isRecordingHotkey) {
        this.recordHotkey(e);
      } else if (e.key === 'Escape') {
        this.hidePromptModal();
        this.hideDeleteModal();
      }
    });
  }

  async saveSettings() {
    try {
      const hotkey = document.getElementById('hotkey-input').value.trim();
      const textTrigger = document.getElementById('text-trigger-input').value.trim();

      if (!hotkey) {
        this.showError('Hotkey cannot be empty');
        return;
      }

      this.settings.hotkey = hotkey;
      this.settings.textTrigger = textTrigger;

      await browser.runtime.sendMessage({ 
        action: 'saveSettings', 
        settings: this.settings 
      });

      this.showSuccess('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showError('Failed to save settings');
    }
  }

  startHotkeyRecording() {
    this.isRecordingHotkey = true;
    const input = document.getElementById('hotkey-input');
    input.value = 'Press key combination...';
    input.style.backgroundColor = '#fff3cd';
  }

  recordHotkey(e) {
    e.preventDefault();
    
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return; // Wait for non-modifier key
    }

    const modifiers = [];
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.metaKey) modifiers.push('Meta');

    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    const hotkey = [...modifiers, key].join('+');

    const input = document.getElementById('hotkey-input');
    input.value = hotkey;
    input.style.backgroundColor = '';
    this.isRecordingHotkey = false;
  }

  showPromptModal(prompt = null) {
    this.editingPromptId = prompt ? prompt.id : null;
    
    const modal = document.getElementById('prompt-modal');
    const title = document.getElementById('modal-title');
    const nameInput = document.getElementById('prompt-name');
    const contentInput = document.getElementById('prompt-content');

    if (prompt) {
      title.textContent = 'Edit Prompt';
      nameInput.value = prompt.name;
      contentInput.value = prompt.content;
    } else {
      title.textContent = 'Add New Prompt';
      nameInput.value = '';
      contentInput.value = '';
    }

    title.removeAttribute('data-context');
    this.updateCharacterCount(contentInput.value.length);
    modal.style.display = 'flex';
    nameInput.focus();
  }

  hidePromptModal() {
    document.getElementById('prompt-modal').style.display = 'none';
    this.editingPromptId = null;
  }

  async savePrompt() {
    try {
      const name = document.getElementById('prompt-name').value.trim();
      const content = document.getElementById('prompt-content').value.trim();

      if (!name || !content) {
        this.showError('Please fill in all fields');
        return;
      }

      // Check for duplicates (skip if editing existing prompt)
      if (!this.editingPromptId) {
        const existingPrompt = this.settings.prompts.find(prompt => 
          prompt.name.toLowerCase() === name.toLowerCase() || 
          prompt.content === content
        );
        
        if (existingPrompt) {
          if (existingPrompt.name.toLowerCase() === name.toLowerCase()) {
            this.showError('A prompt with this name already exists');
          } else {
            this.showError('A prompt with this content already exists');
          }
          return;
        }
      }

      const promptData = { name, content };

      if (this.editingPromptId) {
        // Update existing prompt
        await browser.runtime.sendMessage({
          action: 'updatePrompt',
          id: this.editingPromptId,
          prompt: promptData
        });
        this.showSuccess('Prompt updated successfully');
      } else {
        // Add new prompt
        await browser.runtime.sendMessage({
          action: 'addPrompt',
          prompt: promptData
        });
        this.showSuccess('Prompt added successfully');
      }

      await this.loadSettings();
      this.renderPrompts();
      this.hidePromptModal();
    } catch (error) {
      console.error('Error saving prompt:', error);
      this.showError('Failed to save prompt');
    }
  }

  editPrompt(id) {
    const prompt = this.settings.prompts.find(p => p.id === id);
    if (prompt) {
      this.showPromptModal(prompt);
    }
  }

  showDeleteConfirmation(id) {
    const prompt = this.settings.prompts.find(p => p.id === id);
    if (!prompt) return;

    this.deletingPromptId = id;
    
    document.getElementById('delete-prompt-name').textContent = prompt.name;
    document.getElementById('delete-prompt-content').textContent = 
      prompt.content.length > 150 ? prompt.content.substring(0, 150) + '...' : prompt.content;
    
    document.getElementById('delete-modal').style.display = 'flex';
  }

  hideDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    this.deletingPromptId = null;
  }

  async deletePrompt() {
    try {
      if (!this.deletingPromptId) return;

      await browser.runtime.sendMessage({
        action: 'deletePrompt',
        id: this.deletingPromptId
      });

      await this.loadSettings();
      this.renderPrompts();
      this.hideDeleteModal();
      this.showSuccess('Prompt deleted successfully');
    } catch (error) {
      console.error('Error deleting prompt:', error);
      this.showError('Failed to delete prompt');
    }
  }

  updateCharacterCount(count) {
    const counter = document.getElementById('char-count');
    counter.textContent = `${count} / 5000 characters`;
    counter.style.color = count > 4500 ? '#ef4444' : '#6b7280';
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type) {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  exportPrompts() {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        prompts: this.settings.prompts || []
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `ai-prompts-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.showSuccess(`Exported ${exportData.prompts.length} prompts successfully`);
    } catch (error) {
      console.error('Export error:', error);
      this.showError('Failed to export prompts');
    }
  }

  async importPrompts(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      // Validate import data structure
      if (!importData.prompts || !Array.isArray(importData.prompts)) {
        throw new Error('Invalid file format: prompts array not found');
      }

      // Validate prompt structure
      const validPrompts = importData.prompts.filter(prompt => 
        prompt && typeof prompt.name === 'string' && typeof prompt.content === 'string'
      );

      if (validPrompts.length === 0) {
        throw new Error('No valid prompts found in file');
      }

      // Assign new IDs and timestamps to imported prompts
      const newPrompts = validPrompts.map(prompt => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: prompt.name,
        content: prompt.content,
        created: new Date().toISOString()
      }));

      // Add to existing prompts
      this.settings.prompts = [...(this.settings.prompts || []), ...newPrompts];
      
      await browser.runtime.sendMessage({ 
        action: 'saveSettings', 
        settings: this.settings 
      });

      await this.loadSettings();
      this.renderPrompts();
      
      this.showSuccess(`Imported ${newPrompts.length} prompts successfully`);
      
      // Clear the file input
      document.getElementById('import-file-input').value = '';
    } catch (error) {
      console.error('Import error:', error);
      this.showError(`Failed to import prompts: ${error.message}`);
      document.getElementById('import-file-input').value = '';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  truncateToLines(text, maxLines) {
    const lines = text.split('\n');
    if (lines.length <= maxLines) {
      return text;
    }
    return lines.slice(0, maxLines).join('\n') + '\n...';
  }
}

// Initialize the options manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});
