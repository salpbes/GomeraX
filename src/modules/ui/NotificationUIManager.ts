import { NotificationHelper } from './NotificationHelper';

/**
 * NotificationUIManager handles specialized notifications like coordinate warnings
 * and error notifications with action buttons.
 */
export class NotificationUIManager {
  constructor(private uiManager: any) {}

  /**
   * Shows a warning label for far-origin models
   */
  public showCoordinateWarning(): void {
    // Remove any existing warning
    this.hideCoordinateWarning();

    const warning = document.createElement('div');
    warning.className = 'coordinate-warning';
    warning.id = 'coordinate-warning';
    warning.innerHTML = `
      <div class="coordinate-warning-icon">⚠️</div>
      <div class="coordinate-warning-content">
        <div class="coordinate-warning-title">Far-Origin Model</div>
        <div class="coordinate-warning-message">Model coordinates >100km adjusted to origin</div>
      </div>
      <button class="coordinate-warning-close" title="Dismiss">×</button>
    `;

    // Add close button handler
    const closeBtn = warning.querySelector('.coordinate-warning-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideCoordinateWarning());
    }

    // Auto-dismiss after 10 seconds
    setTimeout(() => this.hideCoordinateWarning(), 10000);

    document.body.appendChild(warning);
  }

  /**
   * Hides the coordinate warning label
   */
  public hideCoordinateWarning(): void {
    const warning = document.getElementById('coordinate-warning');
    if (warning) {
      warning.remove();
    }
  }

  /**
   * Shows an error notification popup
   */
  public showErrorNotification(
    title: string, 
    message: string, 
    duration: number = 15000,
    actionButton?: { text: string; callback: () => void }
  ): void {
    // Remove any existing error notification
    this.hideErrorNotification();

    const errorNotification = document.createElement('div');
    errorNotification.className = 'error-notification';
    errorNotification.id = 'error-notification';
    
    const actionButtonHtml = actionButton 
      ? `<button class="error-notification-action">${actionButton.text}</button>` 
      : '';
    
    errorNotification.innerHTML = `
      <div class="error-notification-icon">❌</div>
      <div class="error-notification-content">
        <div class="error-notification-title">${title}</div>
        <div class="error-notification-message">${message}</div>
        ${actionButtonHtml}
      </div>
      <button class="error-notification-close" title="Dismiss">×</button>
    `;

    // Add close button handler
    const closeBtn = errorNotification.querySelector('.error-notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideErrorNotification());
    }

    // Add action button handler
    if (actionButton) {
      const actionBtn = errorNotification.querySelector('.error-notification-action');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          actionButton.callback();
          this.hideErrorNotification();
        });
      }
    }

    // Auto-dismiss after specified duration
    setTimeout(() => this.hideErrorNotification(), duration);

    document.body.appendChild(errorNotification);
  }

  /**
   * Hides the error notification
   */
  public hideErrorNotification(): void {
    const notification = document.getElementById('error-notification');
    if (notification) {
      notification.remove();
    }
  }

  /**
   * Shows an alignment needed notification with an action button
   */
  public showAlignmentNeeded(modelId: string): void {
    this.showErrorNotification(
      'Models May Be Overlapping',
      'Multiple far-origin models detected. They may be overlapping at the origin. Would you like to try aligning them?',
      20000, // 20 seconds
      {
        text: 'Try to Align Models',
        callback: () => {
          console.log('🔄 Attempting to align models...');
          this.uiManager.alignModels(modelId); // Wait, secondModelId is not defined here
        }
      }
    );
  }
}
