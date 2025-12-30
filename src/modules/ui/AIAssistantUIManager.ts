import { AIAssistantModule } from '../core/AIAssistantModule';
import { AIDomManager } from './ai/AIDomManager';
import { AIChatManager } from './ai/AIChatManager';
import { AIStyleManager } from './ai/AIStyleManager';

export class AIAssistantUIManager {
  private dom: AIDomManager;
  private chat: AIChatManager;
  private isVisible: boolean = false;
  private isMinimized: boolean = false;
  private commandHistory: string[] = [];
  private historyIndex: number = -1;

  constructor(private aiModule: AIAssistantModule) {
    this.dom = new AIDomManager();
    this.chat = new AIChatManager(this.dom);
  }

  public createUI(): HTMLElement {
    this.dom.appendToBody();
    this.setupEventListeners();
    this.setupDraggable();
    this.setupResizable();
    
    // Add transitioning class by default for smooth show/hide
    this.dom.container.classList.add('transitioning');
    
    // Check WebGPU support and show WebLLM button if available
    this.checkWebGPUSupport();
    
    // Add welcome message
    this.chat.addMessage("👋 Hello! I'm your BIM Assistant. Try:\n- 'Select all walls'\n- 'Hide doors'\n- 'Zoom to columns'\n- 'How many slabs?'\n- 'Reset view'", 'ai');

    return this.dom.container;
  }

  private async checkWebGPUSupport(): Promise<void> {
    const supported = await AIAssistantModule.checkWebGPUSupport();
    if (supported) {
      this.dom.webllmBtn.style.display = 'block';
      this.dom.webllmBtn.title = 'Enable Advanced AI (WebLLM - 945MB)';
    }
  }

  private setupEventListeners(): void {
    this.dom.closeBtn.addEventListener('click', () => this.toggle());
    this.dom.minimizeBtn.addEventListener('click', () => this.toggleMinimize());
    this.dom.historyBtn.addEventListener('click', () => this.toggleHistory());
    this.dom.webllmBtn.addEventListener('click', () => this.handleWebLLMToggle());
    this.dom.sendBtn.addEventListener('click', () => this.handleSend());
    
    const historyClose = this.dom.container.querySelector('.ai-history-close');
    historyClose?.addEventListener('click', () => this.toggleHistory(false));

    this.dom.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleSend();
      } else if (e.key === 'ArrowUp') {
        this.navigateHistory(1);
      } else if (e.key === 'ArrowDown') {
        this.navigateHistory(-1);
      }
    });
  }

  private toggleHistory(show?: boolean): void {
    const shouldShow = show !== undefined ? show : this.dom.historyPanel.classList.contains('hidden');
    if (shouldShow) {
      this.renderHistory();
      this.dom.historyPanel.classList.remove('hidden');
    } else {
      this.dom.historyPanel.classList.add('hidden');
    }
  }

  private renderHistory(): void {
    const list = this.dom.historyPanel.querySelector('.ai-history-list');
    if (!list) return;
    
    list.innerHTML = '';
    if (this.commandHistory.length === 0) {
      list.innerHTML = '<div style="font-size: 11px; color: rgba(255,255,255,0.3); text-align: center; margin-top: 20px;">No recent commands</div>';
      return;
    }

    // Show last 20 commands, newest first
    [...this.commandHistory].reverse().slice(0, 20).forEach(cmd => {
      const item = document.createElement('div');
      item.className = 'ai-history-item';
      item.textContent = cmd;
      item.addEventListener('click', () => {
        this.dom.input.value = cmd;
        this.toggleHistory(false);
        this.dom.input.focus();
      });
      list.appendChild(item);
    });
  }

  private navigateHistory(direction: number): void {
    if (this.commandHistory.length === 0) return;

    if (this.historyIndex === -1 && direction === 1) {
      this.historyIndex = this.commandHistory.length - 1;
    } else {
      this.historyIndex = Math.max(-1, Math.min(this.commandHistory.length - 1, this.historyIndex - direction));
    }

    if (this.historyIndex === -1) {
      this.dom.input.value = '';
    } else {
      this.dom.input.value = this.commandHistory[this.historyIndex];
    }
  }

  private toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    if (this.isMinimized) {
      this.dom.container.classList.add('minimized');
      this.dom.minimizeBtn.innerHTML = '<i class="fas fa-expand-alt"></i>';
    } else {
      this.dom.container.classList.remove('minimized');
      this.dom.minimizeBtn.innerHTML = '<i class="fas fa-minus"></i>';
    }
  }

  private setupResizable(): void {
    const resizeHandle = this.dom.resizeHandle;
    const container = this.dom.container;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      startX = e.clientX;
      startWidth = container.offsetWidth;
      
      const resize = (e: MouseEvent) => {
        const width = startWidth + (startX - e.clientX);
        const minWidth = 300;
        const maxWidth = 800;
        
        if (width >= minWidth && width <= maxWidth) {
          container.style.width = width + 'px';
        }
      };

      const stopResize = () => {
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
      };

      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResize);
    });
  }

  private setupDraggable(): void {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = this.dom.header;
    const container = this.dom.container;

    header.addEventListener('mousedown', (e: MouseEvent) => {
      // Don't drag if clicking on buttons or actions
      if ((e.target as HTMLElement).closest('.ai-header-actions')) return;

      e.preventDefault();
      // Disable transitions during drag
      container.classList.remove('transitioning');
      
      // get the mouse cursor position at startup:
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      const elementDrag = (e: MouseEvent) => {
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Use getBoundingClientRect for accurate fixed positioning
        const rect = container.getBoundingClientRect();
        
        // set the element's new position:
        container.style.top = (rect.top - pos2) + "px";
        container.style.left = (rect.left - pos1) + "px";
        container.style.bottom = 'auto';
        container.style.right = 'auto';
        container.style.margin = '0';
      };

      const closeDragElement = () => {
        // Re-enable transitions after drag
        container.classList.add('transitioning');
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
      };

      document.addEventListener('mouseup', closeDragElement);
      document.addEventListener('mousemove', elementDrag);
    });
  }

  public toggle(): void {
    this.isVisible = !this.isVisible;
    this.dom.toggle(this.isVisible);

    if (this.isVisible) {
      // Show brain button attention animation only if WebLLM not already enabled
      const status = this.aiModule.getWebLLMStatus();
      if (!status.enabled && !status.loading) {
        setTimeout(() => {
          this.dom.showBrainAttention();
        }, 500);
      }

      // Start loading the AI model when the panel is first opened
      this.aiModule.loadModel((progress) => {
        const percent = Math.round(progress);
        if (percent < 100) {
          this.dom.updateStatus(`Downloading AI brain: ${percent}%`);
        } else {
          this.dom.updateStatus(`AI brain ready!`);
          setTimeout(() => this.dom.updateStatus(null), 2000);
        }
      });
    } else {
      // Hide attention when panel closes
      this.dom.hideBrainAttention();
    }
  }

  private async handleSend(): Promise<void> {
    const command = this.dom.input.value.trim();
    if (!command) return;

    // Add to history
    if (this.commandHistory[this.commandHistory.length - 1] !== command) {
      this.commandHistory.push(command);
    }
    this.historyIndex = -1;

    this.chat.addMessage(command, 'user');
    this.dom.input.value = '';
    this.toggleHistory(false);

    const thinkingId = this.chat.addThinkingIndicator();

    try {
      // Check if WebLLM is enabled for streaming
      const webllmStatus = this.aiModule.getWebLLMStatus();
      let streamingId: string | null = null;
      let fullResponse = '';
      
      const response = await this.aiModule.processCommand(command, webllmStatus.enabled ? (token: string) => {
        // On first token, replace thinking indicator with streaming message
        if (!streamingId) {
          this.chat.removeThinkingIndicator(thinkingId);
          streamingId = this.chat.addStreamingMessage('ai');
        }
        // Append token and update display
        fullResponse += token;
        this.chat.updateStreamingMessage(streamingId!, fullResponse);
      } : undefined);
      
      // If we used streaming, finalize it
      if (streamingId) {
        this.chat.finalizeStreamingMessage(streamingId);
      } else {
        // No streaming - remove thinking indicator and show message normally
        this.chat.removeThinkingIndicator(thinkingId);
        
        if (response.contextInfo && response.contextInfo.length > 0) {
          this.chat.addContextInfo(response.contextInfo);
        }
        
        this.chat.addMessage(response.text, 'ai', response.isAI);
      }
      
      // Don't show suggestions when WebLLM is enabled (AI brain mode)
      if (!webllmStatus.enabled) {
        const suggestions = this.aiModule.getSuggestions();
        if (suggestions.length > 0) {
          this.chat.addSuggestions(suggestions, (suggestion: string) => {
            const cmd = suggestion.replace(/\s*\(.*?\)\s*$/, '').trim();
            this.dom.input.value = cmd;
            this.dom.input.focus();
          });
        }
      }
    } catch (error) {
      this.chat.removeThinkingIndicator(thinkingId);
      this.chat.addMessage("Sorry, I encountered an error processing that.", 'ai');
    }
  }

  private async handleWebLLMToggle(): Promise<void> {
    // Hide the attention animation when user clicks
    this.dom.hideBrainAttention();
    
    const status = this.aiModule.getWebLLMStatus();
    
    if (status.ready) {
      this.aiModule.setUseWebLLM(!status.enabled);
      this.updateWebLLMButton();
      
      if (status.enabled) {
        this.chat.addMessage("🧠 Advanced AI disabled.", 'ai');
        this.dom.updateModelInfo('DistilBERT', false);
      } else {
        const modelInfo = AIAssistantModule.getWebLLMModelInfo();
        this.chat.addMessage("✨ Advanced AI enabled!", 'ai', true);
        this.dom.updateModelInfo(modelInfo.name, true);
      }
    } else if (!status.loading) {
      const modelInfo = AIAssistantModule.getWebLLMModelInfo();
      const confirmed = confirm(
        `Enable Advanced AI?\n\n` +
        `Download ${modelInfo.name} (${modelInfo.size})\n\n` +
        `✅ 100% Local\n` +
        `✅ Offline capable\n` +
        `✅ Better conversations\n\n` +
        `One-time download, cached in browser.`
      );
      
      if (confirmed) {
        this.chat.addMessage("🚀 Downloading AI model...", 'ai');
        
        try {
          await this.aiModule.initializeWebLLM((progress) => {
            this.chat.addLoadingProgress(progress);
          });
          
          const modelInfo = AIAssistantModule.getWebLLMModelInfo();
          this.chat.removeLoadingProgress();
          this.chat.addMessage("🎉 Advanced AI ready!", 'ai', true);
          this.dom.updateModelInfo(modelInfo.name, true);
          this.updateWebLLMButton();
        } catch (error) {
          this.chat.removeLoadingProgress();
          this.chat.addMessage("❌ Failed to load Advanced AI.", 'ai');
          console.error("WebLLM init failed:", error);
        }
      }
    }
  }

  private updateWebLLMButton(): void {
    const status = this.aiModule.getWebLLMStatus();
    
    if (status.loading) {
      this.dom.webllmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      this.dom.webllmBtn.style.color = '#74c0fc';
    } else if (status.enabled) {
      this.dom.webllmBtn.innerHTML = '<i class="fas fa-brain"></i>';
      this.dom.webllmBtn.style.color = '#69db7c';
      this.dom.webllmBtn.title = 'Advanced AI On';
    } else if (status.ready) {
      this.dom.webllmBtn.innerHTML = '<i class="fas fa-brain"></i>';
      this.dom.webllmBtn.style.color = 'rgba(255, 255, 255, 0.5)';
      this.dom.webllmBtn.title = 'Advanced AI Off';
    }
  }

  public addStyles(): void {
    AIStyleManager.addStyles();
  }
}
