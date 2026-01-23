import { AIDomManager } from './AIDomManager';

export class AIChatManager {
  constructor(private dom: AIDomManager) {}

  /**
   * Convert markdown text to HTML
   * Supports: headers, bold, italic, code, lists, horizontal rules
   */
  private renderMarkdown(text: string): string {
    // Escape HTML first to prevent XSS
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Normalize multiple newlines to double newlines (paragraph breaks)
    html = html.replace(/\n{3,}/g, '\n\n');

    // CRITICAL: Collapse blank lines between numbered list items so they group together
    // This ensures "1. item\n\n2. item" becomes "1. item\n2. item"
    html = html.replace(/^(\d+\.\s+.*)$\n\n(?=\d+\.\s+)/gm, '$1\n');
    
    // Same for bullet lists (including • character)
    html = html.replace(/^([\-\*•]\s+.*)$\n\n(?=[\-\*•]\s+)/gm, '$1\n');

    // Horizontal rules (---, ***,___)
    html = html.replace(/^[\-\*\_]{3,}$/gm, '<hr class="md-hr">');

    // Headers (### Header) - handle emoji and bold in headers
    html = html.replace(/^#{4,}\s*(.*)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^###\s*(.*)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^##\s*(.*)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^#\s*(.*)$/gm, '<h1 class="md-h1">$1</h1>');

    // Code blocks (```code```)
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="md-code-block"><code>$1</code></pre>');

    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

    // IMPORTANT: Process lists BEFORE bold/italic to preserve number matching
    // Numbered lists (1. item, 2. item) - wrap in <ol>
    html = html.replace(/^(\d+)\.\s+(.*)$/gm, '<li class="md-numbered">$2</li>');
    // Wrap consecutive <li class="md-numbered"> in <ol>
    html = html.replace(/((?:<li class="md-numbered">.*<\/li>\n?)+)/g, '<ol class="md-ol">$1</ol>');

    // Bullet lists (- item, * item, or • item)
    html = html.replace(/^[\-\*•]\s+(.*)$/gm, '<li class="md-bullet">$1</li>');
    // Wrap consecutive <li class="md-bullet"> in <ul>
    html = html.replace(/((?:<li class="md-bullet">.*<\/li>\n?)+)/g, '<ul class="md-ul">$1</ul>');

    // Clean up newlines inside list containers
    html = html.replace(/<\/li>\n<li/g, '</li><li');
    html = html.replace(/<ol class="md-ol">\n/g, '<ol class="md-ol">');
    html = html.replace(/<ul class="md-ul">\n/g, '<ul class="md-ul">');
    html = html.replace(/\n<\/ol>/g, '</ol>');
    html = html.replace(/\n<\/ul>/g, '</ul>');

    // Bold (**text** or __text__) - process AFTER lists
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="md-bold">$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong class="md-bold">$1</strong>');

    // Italic (*text* or _text_) - be careful not to match ** or __
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="md-italic">$1</em>');
    html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em class="md-italic">$1</em>');

    // Convert double newlines to paragraph breaks
    html = html.replace(/\n\n+/g, '</p><p class="md-para">');
    
    // Convert remaining single newlines to <br> only for regular text
    html = html.replace(/\n(?!<)/g, '<br>');
    
    // Clean up <br> around block elements
    html = html.replace(/<\/(h[1-4]|ul|ol|pre|hr)><br>/g, '</$1>');
    html = html.replace(/<br><(h[1-4]|ul|ol|pre)/g, '<$1');
    html = html.replace(/<\/p><p class="md-para"><(h[1-4]|ul|ol|pre)/g, '<$1');
    html = html.replace(/<\/(h[1-4]|ul|ol|pre)><\/p><p class="md-para">/g, '</$1>');
    
    // Clean up empty paragraphs
    html = html.replace(/<p class="md-para"><\/p>/g, '');
    html = html.replace(/<p class="md-para"><br><\/p>/g, '');

    // Wrap in paragraph if it starts with text
    if (!html.startsWith('<')) {
      html = '<p class="md-para">' + html;
    }
    if (!html.endsWith('>')) {
      html = html + '</p>';
    }

    return html;
  }

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
    
    // Render markdown for AI messages, plain text for user
    if (sender === 'ai') {
      content.innerHTML = this.renderMarkdown(text);
    } else {
      content.textContent = text;
    }
    
    msg.appendChild(content);

    this.dom.responseArea.appendChild(msg);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
  }

  private thinkingTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  public addThinkingIndicator(): string {
    const id = 'thinking-' + Date.now();
    const startTime = Date.now();
    const msg = document.createElement('div');
    msg.id = id;
    msg.className = 'ai-message ai-thinking';
    msg.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div><div class="thinking-timer"></div>`;
    this.dom.responseArea.appendChild(msg);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
    
    // Update timer every 500ms after 1 second delay
    const timerInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const timerEl = msg.querySelector('.thinking-timer');
      if (timerEl && elapsed >= 1) {
        timerEl.textContent = `${elapsed}s`;
      }
    }, 500);
    this.thinkingTimers.set(id, timerInterval);
    
    return id;
  }

  public removeThinkingIndicator(id: string): void {
    const interval = this.thinkingTimers.get(id);
    if (interval) {
      clearInterval(interval);
      this.thinkingTimers.delete(id);
    }
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

  /**
   * Add an action confirmation message with icon and optional confidence
   */
  public addActionMessage(actionName: string, description: string, confidence?: number): void {
    const msg = document.createElement('div');
    msg.className = 'ai-message action-message';
    
    // Map action names to icons and categories
    const actionIcons: Record<string, string> = {
      // View actions
      setView: 'fa-video',
      resetView: 'fa-undo',
      fitToView: 'fa-expand',
      zoom: 'fa-search-plus',
      rotateCamera: 'fa-sync',
      toggleFirstPersonMode: 'fa-walking',
      
      // Visibility actions  
      hideElementTypes: 'fa-eye-slash',
      showOnlyElementTypes: 'fa-filter',
      showAllElements: 'fa-eye',
      setElementTransparency: 'fa-tint',
      
      // Clipping actions
      addClippingPlane: 'fa-cut',
      removeAllClippingPlanes: 'fa-trash',
      toggleClipper: 'fa-cut',
      
      // Measurement actions
      enableMeasurement: 'fa-ruler',
      disableMeasurement: 'fa-ruler',
      clearMeasurements: 'fa-eraser',
      
      // Cluster actions
      showClusters: 'fa-cubes',
      exitClusterMode: 'fa-compress',
      toggleClusters: 'fa-cubes',
      
      // Color actions
      colorByStorey: 'fa-palette',
      colorByType: 'fa-palette',
      exitColorSplashMode: 'fa-palette',
      
      // Floor plan actions
      showFloorPlans: 'fa-layer-group',
      showFloorPlan: 'fa-map',
      
      // UI actions
      toggleMinimapCamera: 'fa-map-marker',
      showModelDashboard: 'fa-chart-bar'
    };
    
    const icon = actionIcons[actionName] || 'fa-check-circle';
    
    // Build confidence badge HTML if confidence provided
    let confidenceBadge = '';
    if (confidence !== undefined) {
      const confidenceClass = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';
      const confidenceIcon = confidence >= 80 ? 'fa-check-circle' : confidence >= 50 ? 'fa-info-circle' : 'fa-exclamation-triangle';
      confidenceBadge = '<span class="confidence-badge confidence-' + confidenceClass + '">' +
        '<i class="fas ' + confidenceIcon + '"></i> ' + confidence + '%</span>';
    }
    
    msg.innerHTML = '<div class="action-badge"><i class="fas fa-robot"></i> Action Executed' + confidenceBadge + '</div>' +
      '<div class="action-content"><div class="action-icon"><i class="fas ' + icon + '"></i></div>' +
      '<div class="action-text message-content">' + this.renderMarkdown(description) + '</div></div>';
    
    this.dom.responseArea.appendChild(msg);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
  }

  /**
   * Add batch actions message with progress
   */
  public addBatchActionsMessage(actions: Array<{ name: string; result: string }>, confidence?: number): void {
    const msg = document.createElement('div');
    msg.className = 'ai-message batch-message';
    
    // Build confidence badge
    let confidenceBadge = '';
    if (confidence !== undefined) {
      const confidenceClass = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';
      const confidenceIcon = confidence >= 80 ? 'fa-check-circle' : confidence >= 50 ? 'fa-info-circle' : 'fa-exclamation-triangle';
      confidenceBadge = '<span class="confidence-badge confidence-' + confidenceClass + '">' +
        '<i class="fas ' + confidenceIcon + '"></i> ' + confidence + '%</span>';
    }
    
    // Build actions list with markdown rendering
    const actionsList = actions.map((action, i) => 
      '<div class="batch-action-item">' +
      '<span class="batch-number">' + (i + 1) + '/' + actions.length + '</span>' +
      '<span class="batch-result message-content">' + this.renderMarkdown(action.result) + '</span></div>'
    ).join('');
    
    msg.innerHTML = '<div class="action-badge"><i class="fas fa-tasks"></i> Batch Actions Completed' + confidenceBadge + '</div>' +
      '<div class="batch-actions-list">' + actionsList + '</div>';
    
    this.dom.responseArea.appendChild(msg);
    this.dom.responseArea.scrollTop = this.dom.responseArea.scrollHeight;
  }

  /**
   * Remove any streaming message (used when action is detected mid-stream)
   */
  public removeStreamingMessage(id: string): void {
    const msg = document.getElementById(id);
    msg?.remove();
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
      progressEl.innerHTML = 
        `<div class="loading-header"><i class="fas fa-download"></i> <strong>Downloading AI Model...</strong> <span class="loading-percent">0%</span></div>` +
        `<div class="loading-bar"><div class="loading-fill"></div></div>` +
        `<div class="loading-text"></div>`;
      this.dom.responseArea.appendChild(progressEl);
    }

    const fill = progressEl.querySelector('.loading-fill') as HTMLDivElement;
    const text = progressEl.querySelector('.loading-text') as HTMLDivElement;
    const percent = progressEl.querySelector('.loading-percent') as HTMLSpanElement;
    
    if (fill) fill.style.width = `${progress.progress}%`;
    if (text) text.textContent = progress.text;
    if (percent) percent.textContent = `${progress.progress}%`;
    
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
      // Render markdown for the response
      responseText.innerHTML = this.renderMarkdown(parsed.response);
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
