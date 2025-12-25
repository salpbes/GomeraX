/**
 * NOTIFICATION HELPER (The "Messenger")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This creates the little popup boxes you see in the corner of the screen. 
 * It tells you when something is loading, if a task was successful, or if 
 * something went wrong (errors).
 * 
 * HOW IT CONNECTS:
 * - Used by almost every other module (Loaders, Slicers, Measurements) to 
 *   send quick status updates to the user.
 * --------------------------------------------------------------------------------
 */

export class NotificationHelper {
  private static activeNotification: HTMLDivElement | null = null;

  /**
   * Shows a notification popup
   */
  static show(options: {
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number; // in milliseconds, 0 = manual close only
  }): void {
    const { title, message, type = 'info', duration = 0 } = options;

    // Remove existing notification if any
    this.close();

    // Icon and color based on type
    const icons = {
      info: '📘',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    const colors = {
      info: '#2196F3',
      success: '#4CAF50',
      warning: '#FF9800',
      error: '#F44336'
    };

    const icon = icons[type];
    const color = colors[type];

    // Create notification container
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      max-width: 340px;
      background: white;
      border-radius: 6px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
      padding: 14px 16px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      animation: slideIn 0.3s ease-out;
      border-left: 4px solid ${color};
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

    // Build notification content
    notification.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <div style="font-size: 20px; line-height: 1; margin-top: 2px; flex-shrink: 0;">${icon}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 14px; color: ${color}; margin-bottom: 8px; line-height: 1.2;">
            ${title}
          </div>
          <div style="font-size: 12px; color: #444; line-height: 1.7;">
            ${message.split('\n').length > 1 
              ? message.split('\n').map(line => `<div style="margin-bottom: 3px;">• ${line}</div>`).join('')
              : `<div>${message}</div>`
            }
          </div>
        </div>
        <button style="
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #aaa;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          flex-shrink: 0;
          transition: color 0.2s;
        " onmouseover="this.style.color='#666'" onmouseout="this.style.color='#aaa'" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;

    document.body.appendChild(notification);
    this.activeNotification = notification;

    // Auto-close if duration is set
    if (duration > 0) {
      setTimeout(() => {
        this.close();
      }, duration);
    }
  }

  /**
   * Closes the active notification
   */
  static close(): void {
    if (this.activeNotification) {
      this.activeNotification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        this.activeNotification?.remove();
        this.activeNotification = null;
      }, 300);
    }
  }
}
