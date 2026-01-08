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
        position: relative;
      }

      .ai-webllm-btn:hover {
        background: rgba(105, 219, 124, 0.1);
        color: #69db7c;
      }

      /* Brain button attention animation */
      .ai-webllm-btn.attention {
        animation: brain-pulse 2s ease-in-out infinite;
        color: #69db7c;
      }

      .ai-webllm-btn.attention::before {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 8px;
        background: rgba(105, 219, 124, 0.3);
        animation: brain-glow 2s ease-in-out infinite;
        z-index: -1;
      }

      @keyframes brain-pulse {
        0%, 100% { 
          transform: scale(1);
          color: #69db7c;
        }
        50% { 
          transform: scale(1.15);
          color: #8ce99a;
        }
      }

      @keyframes brain-glow {
        0%, 100% { 
          opacity: 0.4;
          box-shadow: 0 0 8px rgba(105, 219, 124, 0.4);
        }
        50% { 
          opacity: 0.8;
          box-shadow: 0 0 16px rgba(105, 219, 124, 0.6), 0 0 24px rgba(105, 219, 124, 0.3);
        }
      }

      /* Brain tooltip hint - fixed positioning above button */
      .ai-brain-tooltip {
        position: fixed;
        background: rgba(30, 35, 30, 0.98);
        border: 1px solid rgba(105, 219, 124, 0.5);
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 12px;
        color: #c1c2c5;
        white-space: nowrap;
        animation: tooltip-appear 0.4s ease-out;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        z-index: 1001;
        backdrop-filter: blur(10px);
      }

      .ai-brain-tooltip::before {
        content: '';
        position: absolute;
        bottom: -6px;
        right: 12px;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid rgba(105, 219, 124, 0.5);
      }

      .ai-brain-tooltip .tooltip-title {
        font-weight: 600;
        color: #69db7c;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .ai-brain-tooltip .tooltip-title i {
        font-size: 11px;
      }

      .ai-brain-tooltip .tooltip-desc {
        color: rgba(255, 255, 255, 0.7);
        font-size: 11px;
        line-height: 1.4;
      }

      @keyframes tooltip-appear {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
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

      /* Markdown Styles */
      .message-content .md-h1 {
        font-size: 15px;
        font-weight: 700;
        color: #fff;
        margin: 8px 0 4px 0;
        padding-bottom: 2px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .message-content .md-h2 {
        font-size: 14px;
        font-weight: 700;
        color: #fff;
        margin: 6px 0 3px 0;
      }

      .message-content .md-h3 {
        font-size: 13px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.95);
        margin: 5px 0 2px 0;
      }

      .message-content .md-h4 {
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        margin: 4px 0 2px 0;
      }

      .message-content .md-bold {
        font-weight: 600;
        color: #fff;
      }

      .message-content .md-italic {
        font-style: italic;
        color: rgba(255, 255, 255, 0.85);
      }

      .message-content .md-inline-code {
        background: rgba(116, 192, 252, 0.15);
        color: #74c0fc;
        padding: 1px 5px;
        border-radius: 3px;
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        font-size: 11px;
      }

      .message-content .md-code-block {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 8px 10px;
        margin: 4px 0;
        overflow-x: auto;
      }

      .message-content .md-code-block code {
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        font-size: 11px;
        color: #e599f7;
      }

      .message-content .md-ul,
      .message-content .md-ol {
        margin: 3px 0;
        padding-left: 18px;
      }

      .message-content .md-ul {
        list-style-type: disc;
      }

      .message-content .md-ol {
        list-style-type: decimal;
      }

      .message-content .md-bullet,
      .message-content .md-numbered {
        margin: 1px 0;
        color: rgba(255, 255, 255, 0.9);
        line-height: 1.4;
      }

      .message-content .md-hr {
        border: none;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        margin: 8px 0;
      }

      .message-content .md-para {
        margin: 0 0 6px 0;
      }

      .message-content .md-para:last-child {
        margin-bottom: 0;
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

      /* Action message styling */
      .action-message {
        background: linear-gradient(135deg, rgba(40, 167, 69, 0.15) 0%, rgba(40, 167, 69, 0.05) 100%) !important;
        border-left: 3px solid #28a745 !important;
        padding: 8px 10px !important;
      }

      .action-badge {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #28a745;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 700;
      }

      .action-content {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .action-icon {
        width: 20px;
        height: 20px;
        background: rgba(40, 167, 69, 0.2);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #28a745;
        font-size: 10px;
        flex-shrink: 0;
      }

      .action-text {
        font-size: 13px;
        line-height: 1.3;
        color: rgba(255, 255, 255, 0.9);
      }

      /* Confidence badges */
      .confidence-badge {
        font-size: 8px;
        padding: 2px 6px;
        border-radius: 3px;
        margin-left: 6px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .confidence-high {
        background: rgba(40, 167, 69, 0.3);
        color: #69db7c;
      }

      .confidence-medium {
        background: rgba(255, 193, 7, 0.3);
        color: #ffc107;
      }

      .confidence-low {
        background: rgba(220, 53, 69, 0.3);
        color: #ff6b6b;
      }

      /* Batch actions message styling */
      .batch-message {
        background: linear-gradient(135deg, rgba(0, 123, 255, 0.15) 0%, rgba(0, 123, 255, 0.05) 100%) !important;
        border-left: 3px solid #007bff !important;
        padding: 8px 10px !important;
      }

      .batch-message .action-badge {
        color: #007bff;
      }

      .batch-actions-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 6px;
      }

      .batch-action-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        padding: 4px 6px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
      }

      .batch-number {
        font-weight: 700;
        color: #007bff;
        font-size: 10px;
        min-width: 32px;
        text-align: center;
        background: rgba(0, 123, 255, 0.2);
        padding: 2px 6px;
        border-radius: 3px;
      }

      .batch-result {
        flex: 1;
        color: rgba(255, 255, 255, 0.85);
        line-height: 1.3;
      }

      .ai-thinking {
        background: rgba(255, 255, 255, 0.02) !important;
        padding: 12px !important;
        width: fit-content;
        display: flex;
        align-items: center;
        gap: 8px;
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
      
      .thinking-timer {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
        min-width: 20px;
      }

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
        justify-content: space-between;
        gap: 8px;
        border-radius: 0 0 12px 12px;
      }

      .ai-footer-privacy {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .ai-footer-privacy i {
        color: #69db7c;
      }

      .ai-stats-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .ai-stats-bar.visible {
        opacity: 1;
      }

      .ai-stat {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 9px;
        color: rgba(255, 255, 255, 0.5);
        cursor: default;
      }

      .ai-stat i {
        font-size: 8px;
      }

      #ai-stat-tokens i { color: #e599f7; }
      #ai-stat-gpu i { color: #69db7c; }
      #ai-stat-speed i { color: #74c0fc; }
      #ai-stat-latency i { color: #ffd43b; }

      #ai-stat-tokens span { color: #e599f7; }
      #ai-stat-gpu span { color: #69db7c; }
      #ai-stat-speed span { color: #74c0fc; }
      #ai-stat-latency span { color: #ffd43b; }

      .ai-stat-gpu {
        border-left: 1px solid rgba(255, 255, 255, 0.1);
        padding-left: 10px;
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
        padding: 6px 10px;
        background: rgba(105, 219, 124, 0.08);
        border: 1px solid rgba(105, 219, 124, 0.2);
        border-radius: 6px;
        margin-bottom: 6px;
        white-space: normal !important;
        line-height: 1.3 !important;
      }

      .ai-loading-progress .loading-header {
        font-size: 11px;
        color: #69db7c;
        margin: 0 0 4px 0;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .ai-loading-progress .loading-header i {
        font-size: 10px;
      }

      .ai-loading-progress .loading-header strong {
        flex: 1;
      }

      .ai-loading-progress .loading-percent {
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.7);
      }

      .loading-bar {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 3px;
      }

      .loading-fill {
        height: 100%;
        background: linear-gradient(90deg, #69db7c, #51cf66);
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .loading-text {
        font-size: 9px;
        color: rgba(255, 255, 255, 0.5);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Download Confirmation Card - Ultra Compact */
      .ai-confirm-download {
        background: linear-gradient(135deg, rgba(116, 192, 252, 0.1), rgba(147, 112, 219, 0.1)) !important;
        border: 1px solid rgba(116, 192, 252, 0.3);
        padding: 6px 10px !important;
        margin-bottom: 6px !important;
        line-height: 1.3 !important;
        white-space: normal !important;
      }

      .ai-confirm-download .confirm-header {
        font-size: 11px;
        color: #74c0fc;
        margin: 0 0 3px 0;
      }

      .ai-confirm-download .confirm-header i {
        margin-right: 4px;
      }

      .ai-confirm-download .confirm-header strong {
        color: #74c0fc;
      }

      .ai-confirm-download .confirm-model {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.7);
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        margin: 0 0 3px 0;
      }

      .ai-confirm-download .confirm-note {
        font-size: 9px;
        color: rgba(255, 255, 255, 0.5);
        margin: 0 0 2px 0;
      }

      .ai-confirm-download .confirm-note i {
        color: rgba(255, 255, 255, 0.4);
        margin-right: 3px;
        font-size: 8px;
      }

      .ai-confirm-download .confirm-local {
        font-size: 9px;
        color: rgba(105, 219, 124, 0.8);
        margin: 0 0 6px 0;
      }

      .ai-confirm-download .confirm-local i {
        color: rgba(105, 219, 124, 0.6);
        margin-right: 3px;
        font-size: 8px;
      }

      .ai-confirm-download .confirm-buttons {
        display: flex;
        gap: 6px;
        margin: 0;
        padding: 0;
      }

      .ai-confirm-download .confirm-btn {
        flex: 1;
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.15s ease;
      }

      .ai-confirm-download .confirm-btn.confirm-yes {
        background: linear-gradient(135deg, #69db7c, #51cf66);
        color: #1a1b1e;
      }

      .ai-confirm-download .confirm-btn.confirm-yes:hover {
        filter: brightness(1.1);
      }

      .ai-confirm-download .confirm-btn.confirm-no {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.7);
      }

      .ai-confirm-download .confirm-btn.confirm-no:hover {
        background: rgba(255, 255, 255, 0.15);
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
