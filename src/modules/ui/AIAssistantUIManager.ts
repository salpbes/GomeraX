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
    
    // Add transitioning class by default for smooth show/hide
    this.dom.container.classList.add('transitioning');
    
    // Add welcome message
    this.chat.addMessage("Hello! I'm your BIM Assistant. I can help you manage the model. Try asking me to:\n- \"Select walls and windows\"\n- \"Hide all doors\"\n- \"Zoom to columns\"\n- \"How many slabs are there?\"\n- \"Color by type\"\n- \"Reset view\" (clears everything)", 'ai');

    return this.dom.container;
  }

  private setupEventListeners(): void {
    this.dom.closeBtn.addEventListener('click', () => this.toggle());
    this.dom.minimizeBtn.addEventListener('click', () => this.toggleMinimize());
    this.dom.historyBtn.addEventListener('click', () => this.toggleHistory());
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
      const response = await this.aiModule.processCommand(command);
      this.chat.removeThinkingIndicator(thinkingId);
      this.chat.addMessage(response.text, 'ai', response.isAI);
    } catch (error) {
      this.chat.removeThinkingIndicator(thinkingId);
      this.chat.addMessage("Sorry, I encountered an error processing that.", 'ai');
    }
  }

  public addStyles(): void {
    AIStyleManager.addStyles();
  }
}
