/**
 * WebGPUUIManager (The "WebGPU Toggle Wizard")
 * This handles all UI-related functionality for the experimental WebGPU renderer.
 */

import { NotificationHelper } from './NotificationHelper';


export class WebGPUUIManager {
  constructor(private viewer: any) {}

  /**
   * Sets up WebGPU toggle with support detection
   */
  public async setupWebGPUToggle(): Promise<void> {
    const toggle = document.getElementById('webgpuToggle') as HTMLInputElement;
    const statusIcon = document.getElementById('webgpuStatusIcon');
    const statusText = document.getElementById('webgpuStatusText');
    const webgpuOptions = document.getElementById('webgpuOptions');
    
    if (!toggle || !statusIcon || !statusText) return;
    
    // Check WebGPU support
    const support = await this.viewer?.checkWebGPUSupport();
    const isSupported = support?.available ?? false;
    
    if (isSupported) {
      statusIcon.textContent = '✅';
      statusText.textContent = 'Available';
      statusText.style.color = '#4ade80';
      toggle.disabled = false;
    } else {
      statusIcon.textContent = '❌';
      statusText.textContent = 'Not Supported';
      statusText.style.color = '#f87171';
      toggle.disabled = true;
      toggle.checked = false;
      if (support?.reason) {
        statusText.title = support.reason;
      }
    }
    
    // Setup WebGPU options handlers
    this.setupWebGPUOptions();
    
    // Handle toggle change
    toggle.addEventListener('change', async (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      
      if (!this.viewer) return;
      
      // Show loading state
      toggle.disabled = true;
      statusIcon.textContent = '⏳';
      statusText.textContent = enabled ? 'Loading...' : 'Switching...';
      statusText.style.color = '#fbbf24';
      
      try {
        const success = await this.viewer.toggleWebGPU(enabled);
        
        if (success) {
          if (enabled) {
            statusIcon.textContent = '🚀';
            statusText.textContent = 'Active';
            statusText.style.color = '#4ade80';
            if (webgpuOptions) webgpuOptions.style.display = 'block';
            console.log('🚀 WebGPU renderer enabled');
            NotificationHelper.show({
              title: '🚀 WebGPU Mode Active',
              message: 'Experimental WebGPU. Some materials may not render correctly.',
              type: 'info',
              duration: 5000
            });
          } else {
            statusIcon.textContent = '✅';
            statusText.textContent = 'Available';
            statusText.style.color = '#4ade80';
            if (webgpuOptions) webgpuOptions.style.display = 'none';
            console.log('🔄 Switched back to WebGL');
            NotificationHelper.show({
              title: '🔄 WebGL Mode Active',
              message: 'Switched back to WebGL renderer with full effects.',
              type: 'success',
              duration: 4000
            });
          }
        } else {
          toggle.checked = false;
          statusIcon.textContent = '❌';
          statusText.textContent = 'Failed';
          statusText.style.color = '#f87171';
          if (webgpuOptions) webgpuOptions.style.display = 'none';
          NotificationHelper.show({
            title: '❌ WebGPU Failed',
            message: 'Could not initialize WebGPU. Your browser may not support it.',
            type: 'error',
            duration: 5000
          });
        }
      } catch (error) {
        console.error('WebGPU toggle error:', error);
        toggle.checked = false;
        statusIcon.textContent = '❌';
        statusText.textContent = 'Error';
        statusText.style.color = '#f87171';
        if (webgpuOptions) webgpuOptions.style.display = 'none';

        NotificationHelper.show({
          title: '❌ Error',
          message: 'An unexpected error occurred while switching renderers.',
          type: 'error',
          duration: 5000
        });
      }
      
      toggle.disabled = false;
    });
  }

  /**
   * Sets up WebGPU options (tone mapping, exposure, shadows, ground plane)
   */
  private setupWebGPUOptions(): void {
    const toneMappingSelect = document.getElementById('toneMappingSelect') as HTMLSelectElement;
    const exposureSlider = document.getElementById('exposureSlider') as HTMLInputElement;
    const exposureValue = document.getElementById('exposureValue');
    const shadowsToggle = document.getElementById('webgpuShadowsToggle') as HTMLInputElement;
    const shadowAngleSlider = document.getElementById('shadowAngleSlider') as HTMLInputElement;
    const shadowAngleValue = document.getElementById('shadowAngleValue');
    const shadowElevationSlider = document.getElementById('shadowElevationSlider') as HTMLInputElement;
    const shadowElevationValue = document.getElementById('shadowElevationValue');
    const groundPlaneToggle = document.getElementById('webgpuGroundPlaneToggle') as HTMLInputElement;
    const edgesToggle = document.getElementById('webgpuEdgesToggle') as HTMLInputElement;
    const edgeThresholdControl = document.getElementById('edgeThresholdControl');
    const edgeThresholdSlider = document.getElementById('edgeThresholdSlider') as HTMLInputElement;
    const edgeThresholdValue = document.getElementById('edgeThresholdValue');
    const statsToggle = document.getElementById('webgpuStatsToggle') as HTMLInputElement;
    const frustumCullingToggle = document.getElementById('webgpuFrustumCullingToggle') as HTMLInputElement;
    const shadowQualitySelect = document.getElementById('shadowQualitySelect') as HTMLSelectElement;
    const performancePresetSelect = document.getElementById('performancePresetSelect') as HTMLSelectElement;
    
    if (toneMappingSelect) {
      toneMappingSelect.addEventListener('change', () => {
        const value = parseInt(toneMappingSelect.value);
        this.viewer?.setWebGPUToneMapping(value);
      });
    }
    
    if (exposureSlider && exposureValue) {
      exposureSlider.addEventListener('input', () => {
        const value = parseFloat(exposureSlider.value);
        exposureValue.textContent = value.toFixed(1);
        this.viewer?.setWebGPUExposure(value);
      });
    }
    
    if (shadowsToggle) {
      shadowsToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUShadows(shadowsToggle.checked);
      });
    }
    
    if (shadowAngleSlider && shadowAngleValue) {
      shadowAngleSlider.addEventListener('input', () => {
        const value = parseInt(shadowAngleSlider.value);
        shadowAngleValue.textContent = `${value}°`;
        this.viewer?.setWebGPUShadowAngle(value);
      });
    }
    
    if (shadowElevationSlider && shadowElevationValue) {
      shadowElevationSlider.addEventListener('input', () => {
        const value = parseInt(shadowElevationSlider.value);
        shadowElevationValue.textContent = `${value}°`;
        this.viewer?.setWebGPUShadowElevation(value);
      });
    }
    
    if (groundPlaneToggle) {
      groundPlaneToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUGroundPlane(groundPlaneToggle.checked);
      });
    }
    
    if (edgesToggle && edgeThresholdControl) {
      edgesToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUEdges(edgesToggle.checked);
        edgeThresholdControl.style.display = edgesToggle.checked ? 'block' : 'none';
      });
    }
    
    if (edgeThresholdSlider && edgeThresholdValue) {
      edgeThresholdSlider.addEventListener('input', () => {
        const value = parseInt(edgeThresholdSlider.value);
        edgeThresholdValue.textContent = `${value}°`;
        this.viewer?.setWebGPUEdgeThreshold(value);
      });
    }
    
    const outlineToggle = document.getElementById('webgpuOutlineToggle') as HTMLInputElement;
    const outlineSelectionColor = document.getElementById('outlineSelectionColor') as HTMLInputElement;
    
    if (outlineToggle) {
      outlineToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUOutlineEnabled(outlineToggle.checked);
      });
    }
    
    if (outlineSelectionColor) {
      outlineSelectionColor.addEventListener('change', () => {
        this.viewer?.setWebGPUOutlineSelectionColor(outlineSelectionColor.value);
      });
    }
    
    this.setupFogControls();
    this.setupLODControls();
    
    if (statsToggle) {
      statsToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUStats(statsToggle.checked);
      });
    }
    
    if (frustumCullingToggle) {
      frustumCullingToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUFrustumCulling(frustumCullingToggle.checked);
      });
    }
    
    if (shadowQualitySelect) {
      shadowQualitySelect.addEventListener('change', () => {
        const resolution = parseInt(shadowQualitySelect.value);
        this.viewer?.setWebGPUShadowQuality(resolution);
      });
    }
    
    if (performancePresetSelect) {
      performancePresetSelect.addEventListener('change', () => {
        const preset = performancePresetSelect.value as 'low' | 'medium' | 'high' | '';
        if (preset) {
          this.viewer?.applyWebGPUPerformancePreset(preset);
          if (preset === 'low') {
            if (shadowsToggle) shadowsToggle.checked = false;
            if (edgesToggle) edgesToggle.checked = false;
            if (shadowQualitySelect) shadowQualitySelect.value = '512';
          } else if (preset === 'medium') {
            if (shadowsToggle) shadowsToggle.checked = true;
            if (edgesToggle) edgesToggle.checked = false;
            if (shadowQualitySelect) shadowQualitySelect.value = '1024';
          } else if (preset === 'high') {
            if (shadowsToggle) shadowsToggle.checked = true;
            if (edgesToggle) edgesToggle.checked = true;
            if (edgeThresholdControl) edgeThresholdControl.style.display = 'block';
            if (shadowQualitySelect) shadowQualitySelect.value = '2048';
          }
        }
      });
    }
  }

  private setupFogControls(): void {
    const fogToggle = document.getElementById('webgpuFogToggle') as HTMLInputElement;
    const fogTypeSelect = document.getElementById('fogTypeSelect') as HTMLSelectElement;
    const fogTypeControl = document.getElementById('fogTypeControl');
    const fogDensitySlider = document.getElementById('fogDensitySlider') as HTMLInputElement;
    const fogDensityValue = document.getElementById('fogDensityValue');
    const fogDensityControl = document.getElementById('fogDensityControl');
    const fogNearSlider = document.getElementById('fogNearSlider') as HTMLInputElement;
    const fogNearValue = document.getElementById('fogNearValue');
    const fogNearControl = document.getElementById('fogNearControl');
    const fogFarSlider = document.getElementById('fogFarSlider') as HTMLInputElement;
    const fogFarValue = document.getElementById('fogFarValue');
    const fogFarControl = document.getElementById('fogFarControl');
    const fogColorPicker = document.getElementById('fogColorPicker') as HTMLInputElement;
    const fogColorControl = document.getElementById('fogColorControl');
    const fogPresetSelect = document.getElementById('fogPresetSelect') as HTMLSelectElement;
    const fogPresetControl = document.getElementById('fogPresetControl');
    const fogAutoConfigBtn = document.getElementById('fogAutoConfigBtn') as HTMLButtonElement;
    const fogAutoConfigControl = document.getElementById('fogAutoConfigControl');
    
    const updateFogTypeControls = (type: string) => {
      const isLinear = type === 'linear';
      if (fogDensityControl) fogDensityControl.style.display = isLinear ? 'none' : 'block';
      if (fogNearControl) fogNearControl.style.display = isLinear ? 'block' : 'none';
      if (fogFarControl) fogFarControl.style.display = isLinear ? 'block' : 'none';
    };
    
    if (fogToggle) {
      fogToggle.addEventListener('change', () => {
        const enabled = fogToggle.checked;
        this.viewer?.setWebGPUFogEnabled(enabled);
        if (fogTypeControl) fogTypeControl.style.display = enabled ? 'block' : 'none';
        if (fogColorControl) fogColorControl.style.display = enabled ? 'block' : 'none';
        if (fogPresetControl) fogPresetControl.style.display = enabled ? 'block' : 'none';
        if (fogAutoConfigControl) fogAutoConfigControl.style.display = enabled ? 'block' : 'none';
        if (enabled) {
          updateFogTypeControls(fogTypeSelect?.value || 'exponential2');
        } else {
          if (fogDensityControl) fogDensityControl.style.display = 'none';
          if (fogNearControl) fogNearControl.style.display = 'none';
          if (fogFarControl) fogFarControl.style.display = 'none';
        }
      });
    }
    
    if (fogTypeSelect) {
      fogTypeSelect.addEventListener('change', () => {
        const type = fogTypeSelect.value as 'linear' | 'exponential' | 'exponential2';
        this.viewer?.setWebGPUFogType(type);
        updateFogTypeControls(type);
      });
    }
    
    if (fogDensitySlider && fogDensityValue) {
      fogDensitySlider.addEventListener('input', () => {
        const value = parseFloat(fogDensitySlider.value);
        fogDensityValue.textContent = value.toFixed(4);
        this.viewer?.setWebGPUFogDensity(value);
      });
    }
    
    if (fogNearSlider && fogNearValue) {
      fogNearSlider.addEventListener('input', () => {
        const value = parseFloat(fogNearSlider.value);
        fogNearValue.textContent = value.toFixed(0);
        this.viewer?.setWebGPUFogNear(value);
      });
    }
    
    if (fogFarSlider && fogFarValue) {
      fogFarSlider.addEventListener('input', () => {
        const value = parseFloat(fogFarSlider.value);
        fogFarValue.textContent = value.toFixed(0);
        this.viewer?.setWebGPUFogFar(value);
      });
    }
    
    if (fogColorPicker) {
      fogColorPicker.addEventListener('change', () => {
        this.viewer?.setWebGPUFogColor(fogColorPicker.value);
      });
    }
    
    if (fogPresetSelect) {
      fogPresetSelect.addEventListener('change', () => {
        const preset = fogPresetSelect.value as 'light' | 'medium' | 'heavy' | 'blue' | 'warm' | '';
        if (preset) {
          this.viewer?.applyWebGPUFogPreset(preset);
        }
      });
    }
    
    if (fogAutoConfigBtn) {
      fogAutoConfigBtn.addEventListener('click', () => {
        this.viewer?.autoConfigureWebGPUFog();
      });
    }
  }

  private setupLODControls(): void {
    const lodToggle = document.getElementById('webgpuLODToggle') as HTMLInputElement;
    const lodDetailDistanceSlider = document.getElementById('lodDetailDistanceSlider') as HTMLInputElement;
    const lodDetailDistanceValue = document.getElementById('lodDetailDistanceValue');
    const lodDetailDistanceControl = document.getElementById('lodDetailDistanceControl');
    const lodImpostorDistanceSlider = document.getElementById('lodImpostorDistanceSlider') as HTMLInputElement;
    const lodImpostorDistanceValue = document.getElementById('lodImpostorDistanceValue');
    const lodImpostorDistanceControl = document.getElementById('lodImpostorDistanceControl');
    const lodImpostorToggle = document.getElementById('webgpuLODImpostorToggle') as HTMLInputElement;
    const lodImpostorControl = document.getElementById('lodImpostorControl');
    const lodStatsDisplay = document.getElementById('lodStatsDisplay');
    const lodStatsText = document.getElementById('lodStatsText');
    
    let lodStatsInterval: number | null = null;
    
    if (lodToggle) {
      lodToggle.addEventListener('change', () => {
        const enabled = lodToggle.checked;
        this.viewer?.setWebGPULODEnabled(enabled);
        if (lodDetailDistanceControl) lodDetailDistanceControl.style.display = enabled ? 'block' : 'none';
        if (lodImpostorDistanceControl) lodImpostorDistanceControl.style.display = enabled ? 'block' : 'none';
        if (lodImpostorControl) lodImpostorControl.style.display = enabled ? 'flex' : 'none';
        if (lodStatsDisplay) lodStatsDisplay.style.display = enabled ? 'block' : 'none';
        
        if (enabled) {
          const lodTriangleStats = document.getElementById('lodTriangleStats');
          lodStatsInterval = window.setInterval(() => {
            const stats = this.viewer?.getWebGPULODStats();
            if (stats && lodStatsText) {
              lodStatsText.textContent = `Full: ${stats.fullDetail} | Simplified: ${stats.simplified} | Impostor: ${stats.impostor}`;
              if (lodTriangleStats) {
                const savedPercent = stats.originalTriangles > 0 ? Math.round((stats.trianglesSaved / stats.originalTriangles) * 100) : 0;
                lodTriangleStats.textContent = `Tris: ${stats.originalTriangles.toLocaleString()} → ${stats.currentTriangles.toLocaleString()} (${savedPercent}% saved)`;
              }
            }
          }, 500);
        } else if (lodStatsInterval) {
          clearInterval(lodStatsInterval);
          lodStatsInterval = null;
        }
      });
    }
    
    if (lodDetailDistanceSlider && lodDetailDistanceValue) {
      lodDetailDistanceSlider.addEventListener('input', () => {
        const value = parseFloat(lodDetailDistanceSlider.value);
        lodDetailDistanceValue.textContent = value.toFixed(0);
        this.viewer?.setWebGPULODHighDistance(value);
      });
    }
    
    if (lodImpostorDistanceSlider && lodImpostorDistanceValue) {
      lodImpostorDistanceSlider.addEventListener('input', () => {
        const value = parseFloat(lodImpostorDistanceSlider.value);
        lodImpostorDistanceValue.textContent = value.toFixed(0);
        this.viewer?.setWebGPULODMediumDistance(value);
      });
    }
    
    if (lodImpostorToggle) {
      lodImpostorToggle.addEventListener('change', () => {
        this.viewer?.setWebGPULODShowImpostors(lodImpostorToggle.checked);
      });
    }
  }
}
