import { AIDomManager } from './AIDomManager';

export class AIChatManager {
  constructor(private dom: AIDomManager) {}

  public addMessage(text: string, sender: 'user' | 'ai', isAI: boolean = false): void {
    const msg = document.createElement('div');
    msg.className = `ai-message ${sender}-message`;
    
    if (sender === 'ai' && isAI) {
      const badge = document.createElement('div');
      badge.className = 'ai-badge';
      badge.innerHTML = '<i class="fas fa-sparkles"></i> AI Powered';
      msg.appendChild(badge);
    }

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    msg.appendChild(content);

    this.dom.responseArea.appendChild(msg);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
  }

  public addThinkingIndicator(): string {
    const id = 'thinking-' + Date.now();
    const msg = document.createElement('div');
    msg.id = id;
    msg.className = 'ai-message ai-thinking';
    msg.innerHTML = `
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    `;
    this.dom.responseArea.appendChild(msg);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
    return id;
  }

  public removeThinkingIndicator(id: string): void {
    const indicator = document.getElementById(id);
    indicator?.remove();
  }
}
