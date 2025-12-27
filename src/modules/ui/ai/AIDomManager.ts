export class AIDomManager {
  public container: HTMLDivElement;
  public input: HTMLInputElement;
  public responseArea: HTMLDivElement;
  public sendBtn: HTMLButtonElement;
  public closeBtn: HTMLButtonElement;
  public minimizeBtn: HTMLButtonElement;
  public historyBtn: HTMLButtonElement;
  public header: HTMLDivElement;
  public headerTitle: HTMLElement;
  public historyPanel: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'ai-assistant-panel';
    this.container.className = 'ai-assistant-panel hidden';
    this.container.innerHTML = `
      <div class="ai-header">
        <h3><i class="fas fa-robot"></i> AI Assistant</h3>
        <div class="ai-header-actions">
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
        <span>Local AI: distilbert-base-uncased-mnli. No data leaves your browser.</span>
      </div>
    `;

    this.input = this.container.querySelector('#ai-input') as HTMLInputElement;
    this.responseArea = this.container.querySelector('#ai-response-area') as HTMLDivElement;
    this.sendBtn = this.container.querySelector('#ai-send-btn') as HTMLButtonElement;
    this.closeBtn = this.container.querySelector('.ai-close-btn') as HTMLButtonElement;
    this.minimizeBtn = this.container.querySelector('.ai-minimize-btn') as HTMLButtonElement;
    this.historyBtn = this.container.querySelector('.ai-history-btn') as HTMLButtonElement;
    this.header = this.container.querySelector('.ai-header') as HTMLDivElement;
    this.headerTitle = this.container.querySelector('.ai-header h3') as HTMLElement;
    this.historyPanel = this.container.querySelector('#ai-history-panel') as HTMLDivElement;
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
}
