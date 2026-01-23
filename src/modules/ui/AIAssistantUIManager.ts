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
  private totalTokensUsed: number = 0;

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
    this.dom.thinkingCheckbox.addEventListener('change', () => this.handleThinkingToggle());
    this.dom.sendBtn.addEventListener('click', () => this.handleSend());
    
    const historyClose = this.dom.container.querySelector('.ai-history-close');
    historyClose?.addEventListener('click', () => this.toggleHistory(false));

    this.dom.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      } else if (e.key === 'ArrowUp' && this.dom.input.value === '') {
        this.navigateHistory(1);
      } else if (e.key === 'ArrowDown' && this.dom.input.value === '') {
        this.navigateHistory(-1);
      }
    });

    // Auto-resize textarea as user types
    this.dom.input.addEventListener('input', () => {
      this.autoResizeInput();
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
    this.autoResizeInput();
  }

  private autoResizeInput(): void {
    const textarea = this.dom.input;
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height based on content, with min and max constraints
    const minHeight = 40;
    const maxHeight = 120;
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
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
    this.autoResizeInput(); // Reset textarea height after clearing
    this.toggleHistory(false);

    // Show thinking indicator IMMEDIATELY
    const thinkingId = this.chat.addThinkingIndicator();
    
    // Check if WebLLM is enabled
    const webllmStatus = this.aiModule.getWebLLMStatus();

    // CRITICAL: Force browser to paint the thinking dots before starting heavy LLM work
    // We use double-yield: setTimeout to flush the macrotask queue, then rAF to wait for paint
    // This ensures the DOM updates are visible to the user before we block on prefill
    await new Promise<void>(resolve => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          // Second rAF to ensure the first frame with dots is committed
          requestAnimationFrame(() => resolve());
        });
      }, 0);
    });

    try {
      let streamingId: string | null = null;
      let fullResponse = '';
      let isAction = false;
      
      const response = await this.aiModule.processCommand(command, webllmStatus.enabled ? (token: string) => {
        // On first token, replace thinking indicator with streaming message
        if (!streamingId && !isAction) {
          this.chat.removeThinkingIndicator(thinkingId);
          streamingId = this.chat.addStreamingMessage('ai');
        }
        // Append token and update display
        fullResponse += token;
        if (streamingId) {
          this.chat.updateStreamingMessage(streamingId, fullResponse);
        }
      } : undefined);
      
      // Check if this was an action or batch (response already handled)
      isAction = !!response.actionExecuted || !!response.batchActions;
      
      // If batch actions were executed, clean up and show batch message
      if (response.batchActions && response.batchActions.length > 0) {
        // Remove any partial streaming message
        if (streamingId) {
          this.chat.removeStreamingMessage(streamingId);
          streamingId = null;
        }
        // Remove thinking indicator
        this.chat.removeThinkingIndicator(thinkingId);
        
        // Show batch actions message with confidence
        this.chat.addBatchActionsMessage(response.batchActions, response.confidence);
      }
      // If single action was executed, clean up any streaming and show action message
      else if (response.actionExecuted) {
        // Remove any partial streaming message that might have shown [ACTION...
        if (streamingId) {
          this.chat.removeStreamingMessage(streamingId);
          streamingId = null;
        }
        // Remove thinking indicator if still showing
        this.chat.removeThinkingIndicator(thinkingId);
        
        // Show professional action message with confidence
        this.chat.addActionMessage(response.actionExecuted, response.text, response.confidence);
      } else if (streamingId) {
        // If we used streaming, finalize it
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
      } else {
        // Update stats display when WebLLM is enabled
        this.updateStatsDisplay();
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
      // Show in-chat confirmation instead of browser confirm()
      const modelInfo = AIAssistantModule.getWebLLMModelInfo();
      this.showDownloadConfirmation(modelInfo);
    }
  }

  private showDownloadConfirmation(modelInfo: { name: string; size: string; description: string }): void {
    // Create ultra-compact confirmation message in chat
    const confirmContainer = document.createElement('div');
    confirmContainer.className = 'ai-message ai-confirm-download';
    confirmContainer.innerHTML = 
      `<div class="confirm-header"><i class="fas fa-brain"></i> <strong>Enable Advanced AI?</strong></div>` +
      `<div class="confirm-model">${modelInfo.name} • ${modelInfo.size}</div>` +
      `<div class="confirm-note"><i class="fas fa-info-circle"></i> One-time download, cached for future use</div>` +
      `<div class="confirm-local"><i class="fas fa-laptop"></i> Local AI runs on your web browser</div>` +
      `<div class="confirm-disclaimer"><i class="fas fa-exclamation-triangle"></i> <strong>Disclaimer:</strong> By downloading, you accept responsibility for the AI model's use. AI responses are generated automatically and may contain errors. We provide no warranties and accept no liability for any decisions or actions based on AI outputs.</div>` +
      `<div class="confirm-buttons"><button class="confirm-btn confirm-yes"><i class="fas fa-download"></i> Accept & Download</button><button class="confirm-btn confirm-no">Cancel</button></div>`;

    this.dom.responseArea.appendChild(confirmContainer);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;

    // Handle button clicks
    const yesBtn = confirmContainer.querySelector('.confirm-yes') as HTMLButtonElement;
    const noBtn = confirmContainer.querySelector('.confirm-no') as HTMLButtonElement;

    yesBtn.addEventListener('click', async () => {
      confirmContainer.remove();
      await this.startWebLLMDownload();
    });

    noBtn.addEventListener('click', () => {
      confirmContainer.remove();
      this.chat.addMessage("No problem! Click the brain icon anytime to enable.", 'ai');
    });
  }

  private async startWebLLMDownload(): Promise<void> {
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
      this.updateThinkingToggle();
      
      // Initialize stats display with GPU info
      this.initializeStatsDisplay();
    } catch (error) {
      this.chat.removeLoadingProgress();
      this.chat.addMessage("❌ Failed to load Advanced AI.", 'ai');
      console.error("WebLLM init failed:", error);
    }
  }

  /**
   * Handle thinking mode toggle
   */
  private handleThinkingToggle(): void {
    const newState = this.dom.thinkingCheckbox.checked;
    this.aiModule.setThinkingEnabled(newState);
    this.updateThinkingToggle();
    
    // Show a subtle notification
    const modeText = newState ? 'ON (deeper reasoning)' : 'OFF (faster responses)';
    this.chat.addMessage(`💡 Thinking mode ${modeText}`, 'ai');
  }

  /**
   * Update thinking toggle appearance
   */
  private updateThinkingToggle(): void {
    const isEnabled = this.aiModule.isThinkingEnabled();
    
    // Sync checkbox state
    this.dom.thinkingCheckbox.checked = isEnabled;
    
    // Update wrapper class for styling
    if (isEnabled) {
      this.dom.thinkingToggle.classList.add('active');
      this.dom.thinkingToggle.title = 'Thinking: ON (deeper reasoning, slower)';
    } else {
      this.dom.thinkingToggle.classList.remove('active');
      this.dom.thinkingToggle.title = 'Thinking: OFF (faster responses)';
    }
  }

  private updateWebLLMButton(): void {
    const status = this.aiModule.getWebLLMStatus();
    
    if (status.loading) {
      this.dom.webllmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      this.dom.webllmBtn.style.color = '#74c0fc';
      this.dom.thinkingToggle.style.display = 'none';
    } else if (status.enabled) {
      this.dom.webllmBtn.innerHTML = '<i class="fas fa-brain"></i>';
      this.dom.webllmBtn.style.color = '#69db7c';
      this.dom.webllmBtn.title = 'Advanced AI On';
      // Show thinking toggle when WebLLM is active
      this.dom.thinkingToggle.style.display = 'flex';
    } else if (status.ready) {
      this.dom.webllmBtn.innerHTML = '<i class="fas fa-brain"></i>';
      this.dom.webllmBtn.style.color = 'rgba(255, 255, 255, 0.5)';
      this.dom.webllmBtn.title = 'Advanced AI Off';
      this.dom.thinkingToggle.style.display = 'none';
    }
  }

  /**
   * Update the stats display in the footer with latest WebLLM metrics
   */
  private async updateStatsDisplay(): Promise<void> {
    try {
      const stats = await this.aiModule.getWebLLMStats();
      
      // Accumulate total tokens used in this session
      if (stats.usage?.totalTokens) {
        this.totalTokensUsed += stats.usage.totalTokens;
      }
      
      // Format GPU name (shorten if needed)
      let gpuName = stats.gpu || '--';
      if (gpuName.length > 15) {
        gpuName = gpuName.substring(0, 12) + '...';
      }
      
      this.dom.updateStats({
        gpu: gpuName,
        decodeSpeed: stats.usage?.decodeSpeed || '-- tok/s',
        latency: stats.usage?.latency || '--',
        totalTokens: this.totalTokensUsed,
      });
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  }

  /**
   * Initialize stats display when WebLLM is first loaded (show GPU, waiting for first query)
   */
  private async initializeStatsDisplay(): Promise<void> {
    try {
      const stats = await this.aiModule.getWebLLMStats();
      
      // Format GPU name (shorten if needed)
      let gpuName = stats.gpu || '--';
      if (gpuName.length > 15) {
        gpuName = gpuName.substring(0, 12) + '...';
      }
      
      this.dom.updateStats({
        gpu: gpuName,
        decodeSpeed: '-- tok/s',
        latency: 'Ready',
      });
    } catch (error) {
      console.error('Failed to initialize stats:', error);
    }
  }

  public addStyles(): void {
    AIStyleManager.addStyles();
  }
}
