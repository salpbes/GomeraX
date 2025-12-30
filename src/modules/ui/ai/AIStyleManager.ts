export class AIStyleManager {
  public static addStyles(): void {
    if (document.getElementById('ai-assistant-styles')) return;

    const style = document.createElement('style');
    style.id = 'ai-assistant-styles';
    style.textContent = `
      .ai-assistant-panel {
        position: fixed;
        bottom: 80px;
        right: 20px;
        width: 420px;
        min-width: 300px;
        max-width: 800px;
        background: rgba(25, 25, 25, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        backdrop-filter: blur(10px);
        color: white;
        font-family: 'Inter', sans-serif;
        resize: horizontal;
        overflow: auto;
      }

      .ai-assistant-panel.transitioning {
        transition: all 0.3s ease;
      }
      
      .ai-assistant-panel.hidden {
        opacity: 0;
        transform: translateY(20px);
        pointer-events: none;
        transition: all 0.3s ease;
      }

      .ai-assistant-panel.minimized {
        height: 45px !important;
        overflow: hidden;
      }

      .ai-assistant-panel.minimized .ai-content {
        display: none;
      }
      
      .ai-header {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      }

      .ai-header-left {
        display: flex;
        flex-direction: column;
        gap: 4px;
        pointer-events: none;
      }
      
      .ai-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .ai-model-info {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 500;
        letter-spacing: 0.3px;
      }

      .ai-header-actions {
        display: flex;
        gap: 4px;
      }
      
      .ai-close-btn, .ai-minimize-btn, .ai-history-btn, .ai-webllm-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        padding: 6px 8px;
        transition: all 0.2s;
        font-size: 13px;
        border-radius: 4px;
      }
      
      .ai-close-btn:hover, .ai-minimize-btn:hover, .ai-history-btn:hover {
        color: white;
        background: rgba(255, 255, 255, 0.05);
      }

      .ai-webllm-btn {
        font-size: 14px;
      }

      .ai-webllm-btn:hover {
        background: rgba(105, 219, 124, 0.1);
        color: #69db7c;
      }
      
      .ai-content {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        position: relative;
      }

      .ai-history-panel {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(30, 30, 30, 0.98);
        z-index: 10;
        display: flex;
        flex-direction: column;
        padding: 12px;
        border-radius: 0 0 12px 12px;
      }

      .ai-history-panel.hidden {
        display: none;
      }

      .ai-history-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.6);
      }

      .ai-history-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 12px;
      }

      .ai-history-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .ai-history-item {
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.2s;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ai-history-item:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      
      .ai-resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 0%, transparent 50%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.1) 100%);
        border-radius: 0 0 12px 0;
      }

      .ai-resize-handle:hover {
        background: linear-gradient(135deg, transparent 0%, transparent 50%, rgba(255, 255, 255, 0.2) 50%, rgba(255, 255, 255, 0.2) 100%);
      }

      .ai-response-area {
        height: 280px;
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.8);
        padding-right: 8px;
        white-space: pre-wrap;
      }

      /* Custom scrollbar for dark theme */
      .ai-response-area::-webkit-scrollbar {
        width: 8px;
      }

      .ai-response-area::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
      }

      .ai-response-area::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
      }

      .ai-response-area::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .ai-history-list::-webkit-scrollbar {
        width: 6px;
      }

      .ai-history-list::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 3px;
      }

      .ai-history-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 3px;
      }

      .ai-history-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.25);
      }
      
      .ai-message {
        margin-bottom: 8px;
        padding: 8px 12px;
        border-radius: 8px;
        max-width: 90%;
      }
      
      .user-message {
        background: rgba(0, 120, 215, 0.3);
        align-self: flex-end;
        margin-left: auto;
      }
      
      .ai-message:not(.user-message) {
        background: rgba(255, 255, 255, 0.05);
      }

      .ai-message.streaming .message-content::after {
        content: '▋';
        color: #69db7c;
        animation: blink 1s infinite;
        margin-left: 2px;
      }

      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }

      .thinking-section {
        margin-bottom: 8px;
        border-left: 2px solid rgba(147, 112, 219, 0.4);
        padding-left: 8px;
      }

      .thinking-header {
        font-size: 11px;
        color: rgba(147, 112, 219, 0.8);
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        user-select: none;
        padding: 4px 0;
        transition: color 0.2s;
      }

      .thinking-header:hover {
        color: rgba(147, 112, 219, 1);
      }

      .thinking-header i {
        font-size: 10px;
      }

      .thinking-content {
        font-size: 11px;
        color: rgba(147, 112, 219, 0.6);
        font-style: italic;
        margin-top: 4px;
        padding: 6px 8px;
        background: rgba(147, 112, 219, 0.05);
        border-radius: 4px;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transition: max-height 0.3s ease, opacity 0.3s ease, margin-top 0.3s ease;
      }

      .thinking-section.expanded .thinking-content {
        max-height: 200px;
        opacity: 1;
        overflow-y: auto;
      }

      .thinking-section.expanded .thinking-header::before {
        content: '▼ ';
        font-size: 8px;
        margin-right: -2px;
      }

      .thinking-section:not(.expanded) .thinking-header::before {
        content: '▶ ';
        font-size: 8px;
        margin-right: -2px;
      }

      .response-text {
        margin-top: 4px;
      }

      .ai-badge {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #69db7c;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 700;
      }

      .ai-thinking {
        background: rgba(255, 255, 255, 0.02) !important;
        padding: 12px !important;
        width: fit-content;
      }

      .typing-indicator {
        display: flex;
        gap: 4px;
      }

      .typing-indicator span {
        width: 4px;
        height: 4px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        animation: typing 1s infinite ease-in-out;
      }

      .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
      .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

      @keyframes typing {
        0%, 100% { transform: translateY(0); opacity: 0.4; }
        50% { transform: translateY(-4px); opacity: 1; }
      }
      
      .ai-input-wrapper {
        display: flex;
        gap: 8px;
      }
      
      .ai-input-wrapper input {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 8px 12px;
        color: white;
        font-size: 13px;
      }
      
      .ai-input-wrapper input:focus {
        outline: none;
        border-color: rgba(0, 120, 215, 0.5);
      }
      
      #ai-send-btn {
        background: #0078d7;
        border: none;
        border-radius: 6px;
        color: white;
        padding: 0 12px;
        cursor: pointer;
        transition: background 0.2s;
      }
      
      #ai-send-btn:hover {
        background: #0086f0;
      }

      .ai-footer {
        padding: 8px 16px;
        background: rgba(0, 0, 0, 0.2);
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 9px;
        color: rgba(255, 255, 255, 0.4);
        display: flex;
        align-items: center;
        gap: 6px;
        border-radius: 0 0 12px 12px;
      }

      .ai-footer i {
        color: #69db7c;
      }

      .ai-context-info {
        margin-bottom: 6px;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        font-style: italic;
      }

      .context-info-content {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .context-info-content i {
        color: #74c0fc;
      }

      .ai-suggestions {
        margin-top: 8px;
        padding: 10px;
        background: rgba(116, 192, 252, 0.08);
        border: 1px solid rgba(116, 192, 252, 0.2);
        border-radius: 8px;
      }

      .suggestions-title {
        font-size: 11px;
        color: #74c0fc;
        margin-bottom: 8px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .suggestions-buttons {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .suggestion-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.9);
        padding: 6px 10px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
      }

      .suggestion-btn:hover {
        background: rgba(116, 192, 252, 0.15);
        border-color: rgba(116, 192, 252, 0.4);
        transform: translateX(2px);
      }

      .ai-loading-progress {
        padding: 12px;
        background: rgba(105, 219, 124, 0.08);
        border: 1px solid rgba(105, 219, 124, 0.2);
        border-radius: 8px;
        margin-bottom: 8px;
      }

      .loading-title {
        font-size: 12px;
        color: #69db7c;
        margin-bottom: 8px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .loading-bar {
        width: 100%;
        height: 6px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 6px;
      }

      .loading-fill {
        height: 100%;
        background: linear-gradient(90deg, #69db7c, #51cf66);
        border-radius: 3px;
        transition: width 0.3s ease;
      }

      .loading-text {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.6);
        text-align: center;
      }

      .ai-message.streaming .message-content::after {
        content: '▋';
        animation: blink 1s infinite;
        margin-left: 2px;
      }

      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}
