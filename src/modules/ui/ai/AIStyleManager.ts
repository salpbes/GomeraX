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
        width: 300px;
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
      
      .ai-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }

      .ai-header-actions {
        display: flex;
        gap: 4px;
      }
      
      .ai-close-btn, .ai-minimize-btn, .ai-history-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        padding: 4px;
        transition: color 0.2s;
      }
      
      .ai-close-btn:hover, .ai-minimize-btn:hover, .ai-history-btn:hover {
        color: white;
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
      
      .ai-response-area {
        height: 200px;
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.8);
        padding-right: 8px;
        white-space: pre-wrap;
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
    `;
    document.head.appendChild(style);
  }
}
