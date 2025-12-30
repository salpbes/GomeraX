export class AIDomManager {
  public container: HTMLDivElement;
  public input: HTMLInputElement;
  public responseArea: HTMLDivElement;
  public sendBtn: HTMLButtonElement;
  public closeBtn: HTMLButtonElement;
  public minimizeBtn: HTMLButtonElement;
  public historyBtn: HTMLButtonElement;
  public webllmBtn: HTMLButtonElement;
  public header: HTMLDivElement;
  public headerTitle: HTMLElement;
  public historyPanel: HTMLDivElement;
  public modelInfo: HTMLSpanElement;
  public resizeHandle: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'ai-assistant-panel';
    this.container.className = 'ai-assistant-panel hidden';
    this.container.innerHTML = `
      <div class="ai-header">
        <div class="ai-header-left">
          <h3><i class="fas fa-robot"></i> AI Assistant</h3>
          <span class="ai-model-info"><i class="fas fa-microchip"></i> DistilBERT</span>
        </div>
        <div class="ai-header-actions">
          <button class="ai-webllm-btn" title="Enable Advanced AI" style="display:none;"><i class="fas fa-brain"></i></button>
          <button class="ai-history-btn" title="Command History"><i class="fas fa-history"></i></button>
          <button class="ai-minimize-btn" title="Minimize"><i class="fas fa-minus"></i></button>
          <button class="ai-close-btn" title="Close"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="ai-content">
        <div class="ai-history-panel hidden" id="ai-history-panel">
          <div class="ai-history-header">
            <span>Recent Commands</span>
            <button class="ai-history-close"><i class="fas fa-times"></i></button>
          </div>
          <div class="ai-history-list"></div>
        </div>
        <div class="ai-response-area" id="ai-response-area"></div>
        <div class="ai-input-wrapper">
          <input type="text" id="ai-input" placeholder="Ask me anything..." />
          <button id="ai-send-btn"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>
      <div class="ai-footer">
        <i class="fas fa-shield-alt"></i> 
        <span>100% Local AI - No data leaves your browser</span>
      </div>
      <div class="ai-resize-handle"></div>
    `;

    this.input = this.container.querySelector('#ai-input') as HTMLInputElement;
    this.responseArea = this.container.querySelector('#ai-response-area') as HTMLDivElement;
    this.sendBtn = this.container.querySelector('#ai-send-btn') as HTMLButtonElement;
    this.closeBtn = this.container.querySelector('.ai-close-btn') as HTMLButtonElement;
    this.minimizeBtn = this.container.querySelector('.ai-minimize-btn') as HTMLButtonElement;
    this.webllmBtn = this.container.querySelector('.ai-webllm-btn') as HTMLButtonElement;
    this.historyBtn = this.container.querySelector('.ai-history-btn') as HTMLButtonElement;
    this.header = this.container.querySelector('.ai-header') as HTMLDivElement;
    this.headerTitle = this.container.querySelector('.ai-header h3') as HTMLElement;
    this.historyPanel = this.container.querySelector('#ai-history-panel') as HTMLDivElement;
    this.modelInfo = this.container.querySelector('.ai-model-info') as HTMLSpanElement;
    this.resizeHandle = this.container.querySelector('.ai-resize-handle') as HTMLDivElement;
  }

  public appendToBody(): void {
    document.body.appendChild(this.container);
  }

  public toggle(visible: boolean): void {
    if (visible) {
      this.container.classList.remove('hidden');
      this.input.focus();
    } else {
      this.container.classList.add('hidden');
    }
  }

  public updateStatus(text: string | null): void {
    if (text) {
      let statusSpan = this.headerTitle.querySelector('.ai-status') as HTMLElement;
      if (!statusSpan) {
        statusSpan = document.createElement('span');
        statusSpan.className = 'ai-status';
        statusSpan.style.cssText = 'font-size: 10px; color: #69db7c; margin-left: 8px; font-weight: normal;';
        this.headerTitle.appendChild(statusSpan);
      }
      statusSpan.textContent = `(${text})`;
    } else {
      this.headerTitle.querySelector('.ai-status')?.remove();
    }
  }

  public updateModelInfo(modelName: string, isAdvanced: boolean = false): void {
    this.modelInfo.innerHTML = `<i class="fas fa-${isAdvanced ? 'brain' : 'microchip'}"></i> ${modelName}`;
    if (isAdvanced) {
      this.modelInfo.style.color = '#69db7c';
    } else {
      this.modelInfo.style.color = 'rgba(255, 255, 255, 0.5)';
    }
  }

  private brainTooltip: HTMLDivElement | null = null;
  private attentionTimeout: ReturnType<typeof setTimeout> | null = null;

  public showBrainAttention(): void {
    // Only show if brain button is visible and not already enabled
    if (this.webllmBtn.style.display === 'none') return;
    if (this.webllmBtn.classList.contains('active')) return;

    // Add pulsing animation
    this.webllmBtn.classList.add('attention');

    // Create tooltip
    if (!this.brainTooltip) {
      this.brainTooltip = document.createElement('div');
      this.brainTooltip.className = 'ai-brain-tooltip';
      this.brainTooltip.innerHTML = `
        <div class="tooltip-title"><i class="fas fa-sparkles"></i> Enable AI Brain</div>
        <div class="tooltip-desc">Click to unlock smarter, context-aware responses</div>
      `;
      
      // Append to body for fixed positioning
      document.body.appendChild(this.brainTooltip);
      
      // Position above the brain button
      this.updateTooltipPosition();
    }

    // Auto-hide after 8 seconds
    this.attentionTimeout = setTimeout(() => {
      this.hideBrainAttention();
    }, 8000);
  }

  public hideBrainAttention(): void {
    this.webllmBtn.classList.remove('attention');
    
    if (this.brainTooltip) {
      this.brainTooltip.remove();
      this.brainTooltip = null;
    }

    if (this.attentionTimeout) {
      clearTimeout(this.attentionTimeout);
      this.attentionTimeout = null;
    }
  }

  private updateTooltipPosition(): void {
    if (!this.brainTooltip) return;
    
    const btnRect = this.webllmBtn.getBoundingClientRect();
    const tooltipRect = this.brainTooltip.getBoundingClientRect();
    
    // Position above the button, aligned to the right
    const top = btnRect.top - tooltipRect.height - 10;
    const right = window.innerWidth - btnRect.right;
    
    this.brainTooltip.style.top = `${top}px`;
    this.brainTooltip.style.right = `${right}px`;
  }
}
