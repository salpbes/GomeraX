import { IFCLoaderModule } from '../core/IFCLoaderModule';

export class LoadingUIManager {
  private ifcLoader: IFCLoaderModule;
  private loadingRotationInterval: any = null;
  private isAnimating: boolean = false;

  constructor(ifcLoader: IFCLoaderModule) {
    this.ifcLoader = ifcLoader;
  }

  /**
   * Shows the loading indicator
   */
  public async showLoading(): Promise<void> {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
      indicator.style.display = 'flex';
      this.startLoadingRotation();
    }
  }

  /**
   * Hides the loading indicator
   */
  public hideLoading(): void {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
    
    // Clear rotation interval
    if (this.loadingRotationInterval) {
      clearInterval(this.loadingRotationInterval);
      this.loadingRotationInterval = null;
    }
    
    // Reset animation flag
    this.isAnimating = false;
  }

  /**
   * Starts rotating tips and jokes every 3 seconds
   */
  private startLoadingRotation(): void {
    // Clear any existing interval
    if (this.loadingRotationInterval) {
      clearInterval(this.loadingRotationInterval);
    }
    
    // Wait a bit for DOM to be ready
    setTimeout(() => {
      const tipElement = document.getElementById('loadingTip');
      const jokeElement = document.getElementById('loadingJoke');
      
      if (!tipElement || !jokeElement) {
        return;
      }
      
      // Get tips and jokes from data attributes
      const tipsData = tipElement.getAttribute('data-tips');
      const jokesData = jokeElement.getAttribute('data-jokes');
      
      const tips = JSON.parse(tipsData || '[]');
      const jokes = JSON.parse(jokesData || '[]');
      
      let tipIndex = Math.floor(Math.random() * tips.length);
      let jokeIndex = Math.floor(Math.random() * jokes.length);
      
      this.loadingRotationInterval = setInterval(() => {
        const tip = document.getElementById('loadingTip');
        const joke = document.getElementById('loadingJoke');
        
        // Skip if already animating or elements don't exist
        if (!tip || !joke || this.isAnimating) {
          return;
        }
        
        this.isAnimating = true;
        tipIndex = (tipIndex + 1) % tips.length;
        jokeIndex = (jokeIndex + 1) % jokes.length;
        
        // Update content immediately without animation to prevent flickering
        tip.textContent = tips[tipIndex];
        joke.textContent = jokes[jokeIndex];
        
        // Mark animation complete
        this.isAnimating = false;
      }, 5000);
    }, 100);
  }

  /**
   * Updates loading progress with smooth animation
   */
  public updateLoadingProgress(progress: number, message: string): void {
    const progressFill = document.getElementById('loadingProgress');
    const progressText = document.getElementById('loadingProgressText');
    
    if (progressFill) {
      const targetProgress = Math.min(100, Math.max(0, progress));
      // Use transform instead of width for better performance and reliability
      const translateValue = -100 + targetProgress;
      progressFill.style.transform = `translateX(${translateValue}%)`;
    }
    
    if (progressText) {
      // Add more detailed progress messages
      let detailedMessage = message;
      if (progress < 10) {
        detailedMessage = 'Reading IFC file...';
      } else if (progress < 30) {
        detailedMessage = 'Parsing IFC structure...';
      } else if (progress < 50) {
        detailedMessage = 'Processing geometry...';
      } else if (progress < 70) {
        detailedMessage = 'Building 3D meshes...';
      } else if (progress < 90) {
        detailedMessage = 'Applying materials...';
      } else if (progress < 100) {
        detailedMessage = 'Finalizing model...';
      } else {
        detailedMessage = 'Complete!';
      }
      progressText.textContent = `${detailedMessage} ${Math.round(progress)}%`;
    }
  }

  /**
   * Updates the model count badge
   */
  public updateModelCount(): void {
    const countElement = document.getElementById('modelCount');
    const tooltipContent = document.getElementById('modelDetailsContent');
    
    if (countElement && tooltipContent) {
      const models = this.ifcLoader.getLoadedModels();
      const modelCount = models.size;
      countElement.textContent = modelCount.toString();
      
      // Update tooltip content
      if (modelCount === 0) {
        tooltipContent.innerHTML = '<div class="no-models">No models loaded</div>';
      } else {
        let html = '';
        for (const [uuid, model] of models) {
          const metadata = this.ifcLoader.getModelMetadata(uuid);
          const modelName = metadata?.name || uuid;
          
          // Get the model object's unique UUID
          const modelGuid = model.object?.uuid || uuid;
          
          html += `
            <div class="model-item">
              <div class="model-name">
                <span><i class="fas fa-cube"></i> ${modelName}</span>
                <span class="model-guid"><i class="fas fa-fingerprint"></i> ${modelGuid}</span>
              </div>
            </div>
          `;
        }
        tooltipContent.innerHTML = html;
      }
    }
  }
}
