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

  public addContextInfo(contextInfo: string[]): void {
    const msg = document.createElement('div');
    msg.className = 'ai-context-info';
    msg.innerHTML = `
      <div class="context-info-content">
        <i class="fas fa-link"></i> ${contextInfo.join(' • ')}
      </div>
    `;
    this.dom.responseArea.appendChild(msg);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
  }

  public addSuggestions(suggestions: string[], onClick: (suggestion: string) => void): void {
    // Remove any existing suggestions first
    const existingSuggestions = this.dom.responseArea.querySelector('.ai-suggestions');
    existingSuggestions?.remove();

    if (suggestions.length === 0) return;

    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'ai-suggestions';
    
    const title = document.createElement('div');
    title.className = 'suggestions-title';
    title.innerHTML = '<i class="fas fa-lightbulb"></i> Suggested actions:';
    suggestionsContainer.appendChild(title);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'suggestions-buttons';

    suggestions.slice(0, 3).forEach(suggestion => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-btn';
      btn.textContent = suggestion;
      btn.addEventListener('click', () => {
        onClick(suggestion);
        suggestionsContainer.remove();
      });
      buttonsContainer.appendChild(btn);
    });

    suggestionsContainer.appendChild(buttonsContainer);
    this.dom.responseArea.appendChild(suggestionsContainer);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
  }

  public addLoadingProgress(progress: { text: string; progress: number }): void {
    let progressEl = this.dom.responseArea.querySelector('.ai-loading-progress') as HTMLDivElement;
    
    if (!progressEl) {
      progressEl = document.createElement('div');
      progressEl.className = 'ai-loading-progress';
      progressEl.innerHTML = `
        <div class="loading-title">
          <i class="fas fa-download"></i> Loading AI Model...
        </div>
        <div class="loading-bar">
          <div class="loading-fill"></div>
        </div>
        <div class="loading-text"></div>
      `;
      this.dom.responseArea.appendChild(progressEl);
    }

    const fill = progressEl.querySelector('.loading-fill') as HTMLDivElement;
    const text = progressEl.querySelector('.loading-text') as HTMLDivElement;
    
    if (fill) fill.style.width = `${progress.progress}%`;
    if (text) text.textContent = progress.text;
    
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
  }

  public removeLoadingProgress(): void {
    const progressEl = this.dom.responseArea.querySelector('.ai-loading-progress');
    progressEl?.remove();
  }

  public addStreamingMessage(sender: 'user' | 'ai'): string {
    const id = 'streaming-' + Date.now();
    const msg = document.createElement('div');
    msg.id = id;
    msg.className = `ai-message ${sender}-message streaming`;
    
    if (sender === 'ai') {
      const badge = document.createElement('div');
      badge.className = 'ai-badge';
      badge.innerHTML = '<i class="fas fa-sparkles"></i> AI Powered';
      msg.appendChild(badge);
    }

    const content = document.createElement('div');
    content.className = 'message-content';
    msg.appendChild(content);

    this.dom.responseArea.appendChild(msg);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
    return id;
  }

  public updateStreamingMessage(id: string, text: string): void {
    const msg = document.getElementById(id);
    if (msg) {
      const content = msg.querySelector('.message-content');
      if (content) {
        // Parse thinking tags and display separately
        const parsed = this.parseThinkingTags(text);
        this.renderMessageWithThinking(content as HTMLElement, parsed);
        this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
      }
    }
  }

  public finalizeStreamingMessage(id: string): void {
    const msg = document.getElementById(id);
    if (msg) {
      msg.classList.remove('streaming');
    }
  }

  private parseThinkingTags(text: string): { thinking: string; response: string; hasIncomplete: boolean } {
    // Match complete thinking tags
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    let thinking = '';
    let response = text;

    // Extract all complete thinking content
    let match;
    const matches: string[] = [];
    while ((match = thinkRegex.exec(text)) !== null) {
      thinking += match[1].trim() + '\n';
      matches.push(match[0]);
    }

    // Remove complete thinking tags from response
    response = text.replace(thinkRegex, '').trim();

    // Check for incomplete thinking tag (streaming in progress)
    const hasIncomplete = response.includes('<think>') && !response.includes('</think>');
    
    // If incomplete, extract partial thinking and remove from response
    if (hasIncomplete) {
      const incompleteMatch = response.match(/<think>([\s\S]*?)$/);
      if (incompleteMatch) {
        thinking += incompleteMatch[1].trim();
        response = response.replace(/<think>[\s\S]*?$/, '').trim();
      }
    }

    // If we only have thinking and no response, use thinking as response
    // This handles Qwen3's behavior of stopping after </think>
    if (thinking && !response && !hasIncomplete) {
      response = thinking;
      thinking = '';
    }

    return { thinking: thinking.trim(), response: response.trim(), hasIncomplete };
  }

  private renderMessageWithThinking(container: HTMLElement, parsed: { thinking: string; response: string; hasIncomplete: boolean }): void {
    container.innerHTML = '';

    // Add thinking section if present
    if (parsed.thinking) {
      const thinkingSection = document.createElement('div');
      thinkingSection.className = 'thinking-section';
      
      const thinkingHeader = document.createElement('div');
      thinkingHeader.className = 'thinking-header';
      thinkingHeader.innerHTML = '<i class="fas fa-brain"></i> Thinking Process';
      thinkingHeader.onclick = () => {
        thinkingSection.classList.toggle('expanded');
      };
      
      const thinkingContent = document.createElement('div');
      thinkingContent.className = 'thinking-content';
      thinkingContent.textContent = parsed.thinking;
      
      thinkingSection.appendChild(thinkingHeader);
      thinkingSection.appendChild(thinkingContent);
      container.appendChild(thinkingSection);
    }

    // Add actual response (even if empty during streaming)
    const responseText = document.createElement('div');
    responseText.className = 'response-text';
    
    if (parsed.response) {
      responseText.textContent = parsed.response;
    } else if (parsed.hasIncomplete) {
      // Streaming thinking in progress - show placeholder
      responseText.innerHTML = '<span style="color: rgba(255,255,255,0.3); font-style: italic;">Generating response...</span>';
    } else if (parsed.thinking && !parsed.response) {
      // Only thinking, no response yet (still streaming or completed)
      responseText.innerHTML = '<span style="color: rgba(255,255,255,0.3); font-style: italic;">...</span>';
    }
    
    container.appendChild(responseText);
  }
}
