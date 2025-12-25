/**
 * UI STYLES (The "Stylist")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This file contains all the CSS "makeup" for the app. It defines the colors, 
 * fonts, shadows, and animations that make the toolbar and dashboards look 
 * professional and consistent.
 * 
 * HOW IT CONNECTS:
 * - Used by all UI components to ensure they all share the same "Dark Mode" 
 *   look and feel.
 * --------------------------------------------------------------------------------
 */

export function getToolbarStyles(): string {
  return `
    .bottom-toolbar {
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    }
    
    .toolbar-container {
      display: flex;
      gap: 6px;
      background: rgba(40, 40, 70, 0.95);
      backdrop-filter: blur(10px);
      padding: 10px 14px;
      border-radius: 14px;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      align-items: center;
    }
    
    /* GOMERA Brand Logo */
    .toolbar-brand {
      display: flex;
      align-items: center;
      margin-right: 12px;
      padding-right: 12px;
      border-right: 1px solid rgba(255, 255, 255, 0.15);
    }
    
    .brand-text {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 1px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .toolbar-group {
      position: relative;
      display: flex;
      align-items: center;
    }
    
    .toolbar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      min-width: 40px;
      height: 40px;
      border: none;
      padding: 0px 10px;
      border-radius: 8px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      cursor: pointer;
      transition: all 0.3s;
      position: relative;
      overflow: visible;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }
    
    .toolbar-btn:hover {
      background: linear-gradient(135deg, #7c8ff5 0%, #8b5cb8 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }
    
    .toolbar-btn:active {
      transform: scale(0.95);
    }
    
    /* Active state for Walk Mode button */
    #walkModeBtn.active {
      background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%) !important;
      box-shadow: 0 8px 24px rgba(139, 92, 246, 0.7) !important;
    }
    
    #walkModeBtn.active:hover {
      background: linear-gradient(135deg, #a78bfa 0%, #c084fc 100%) !important;
    }
    
    /* Active state for Cluster button */
    #clusterMainBtn.active {
      background: linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%) !important;
      box-shadow: 0 8px 24px rgba(59, 130, 246, 0.7) !important;
    }
    
    #clusterMainBtn.active:hover {
      background: linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%) !important;
    }
    
    /* Active state for Color Splash button */
    #colorSplashMainBtn.active {
      background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%) !important;
      box-shadow: 0 8px 24px rgba(139, 92, 246, 0.7) !important;
    }
    
    #colorSplashMainBtn.active:hover {
      background: linear-gradient(135deg, #a78bfa 0%, #f472b6 100%) !important;
    }
    
    /* Active state for Sectioning (Clipper) button */
    #clipperBtn.active {
      background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%) !important;
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.7) !important;
    }
    
    #clipperBtn.active:hover {
      background: linear-gradient(135deg, #34d399 0%, #2dd4bf 100%) !important;
    }
    
    /* Active state for Measurement button */
    #measureBtn.active {
      background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%) !important;
      box-shadow: 0 8px 24px rgba(245, 158, 11, 0.7) !important;
    }
    
    #measureBtn.active:hover {
      background: linear-gradient(135deg, #fbbf24 0%, #fb923c 100%) !important;
    }
    
    /* Active state for Information button */
    .toolbar-btn[data-action="toggleInfo"].active {
      background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%) !important;
      box-shadow: 0 8px 24px rgba(6, 182, 212, 0.7) !important;
    }
    
    .toolbar-btn[data-action="toggleInfo"].active:hover {
      background: linear-gradient(135deg, #22d3ee 0%, #60a5fa 100%) !important;
    }
    
    .toolbar-btn .icon {
      font-size: 20px;
      line-height: 1;
      color: white;
      transition: all 0.3s ease;
    }
    
    .toolbar-btn:hover .icon {
      transform: translateY(-3px);
    }
    
    .walk-indicator {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 10px;
      height: 10px;
      background: #4ade80;
      border-radius: 50%;
      border: 2px solid rgba(40, 40, 70, 0.8);
      box-shadow: 0 0 12px rgba(74, 222, 128, 0.9);
      animation: pulse 2s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.2);
      }
    }
    
    .crosshair {
      position: fixed;
      top: 50%;
      left: 50%;
      width: 30px;
      height: 30px;
      margin-left: -15px;
      margin-top: -15px;
      pointer-events: none;
      z-index: 1000;
      display: none;
      animation: crosshairPulse 1.5s ease-in-out infinite;
    }
    
    .crosshair::before,
    .crosshair::after {
      content: '';
      position: absolute;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
      transition: all 0.15s ease;
    }
    
    .crosshair::before {
      top: 50%;
      left: 3px;
      right: 3px;
      height: 2px;
      margin-top: -1px;
    }
    
    .crosshair::after {
      left: 50%;
      top: 3px;
      bottom: 3px;
      width: 2px;
      margin-left: -1px;
    }
    
    .crosshair.visible {
      display: block;
    }
    
    @keyframes crosshairPulse {
      0%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.3);
        opacity: 0.5;
      }
    }
    
    .walk-helper {
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(40, 40, 70, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      box-shadow: 
        0 8px 24px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0;
      z-index: 999;
      min-width: 280px;
      opacity: 0;
      pointer-events: none;
      transform: translateY(10px);
      transition: all 0.3s ease;
    }
    
    .walk-helper.visible {
      opacity: 1;
      pointer-events: all;
      transform: translateY(0);
    }
    
    .walk-helper.minimized {
      min-width: auto;
    }
    
    .walk-helper-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(102, 126, 234, 0.2);
      border-radius: 12px 12px 0 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      cursor: move;
      user-select: none;
    }
    
    .walk-helper-title {
      font-size: 13px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .walk-helper-title i {
      color: #667eea;
    }
    
    .walk-helper-toggle {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
      font-size: 12px;
    }
    
    .walk-helper-toggle:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
    
    .walk-helper-content {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .walk-helper-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .walk-helper-label {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .walk-helper-keys {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .walk-helper-key-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .walk-helper-key-group kbd {
      display: inline-block;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      color: white;
      min-width: 28px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .walk-helper-key-group i {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.7);
      width: 28px;
      text-align: center;
    }
    
    .walk-helper-desc {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.8);
    }
    
    .toolbar-submenu {
      position: absolute;
      bottom: calc(100% + 25px);
      left: 50%;
      transform: translateX(-50%) scale(0.9);
      background: rgba(40, 40, 70, 0.98);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      box-shadow: 
        0 8px 24px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 140px;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s ease;
      z-index: 1001;
    }
    
    .toolbar-submenu.visible {
      opacity: 1;
      pointer-events: all;
      transform: translateX(-50%) scale(1);
    }
    
    .submenu-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: none;
      background-color: rgb(49, 49, 83);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.3s;
      color: white;
      white-space: nowrap;
      text-align: left;
    }
    
    .submenu-btn:hover {
      background-color: rgb(58, 58, 94);
      transform: translateY(-2px);
    }
    
    .submenu-btn:active {
      transform: scale(0.95);
    }
    
    /* Active state for submenu buttons (e.g., click surface mode) */
    .submenu-btn.active {
      background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%) !important;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5) !important;
    }
    
    .submenu-btn.active:hover {
      background: linear-gradient(135deg, #34d399 0%, #2dd4bf 100%) !important;
    }
    
    .submenu-btn .icon {
      font-size: 16px;
      line-height: 1;
      filter: grayscale(0.2) brightness(1.2);
      transition: all 0.3s ease;
    }
    
    .submenu-btn:hover .icon {
      transform: translateY(-2px);
      filter: grayscale(0) brightness(1.3);
    }
    
    .submenu-btn .label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
      color: white;
    }
    
    .walk-speed-control {
      padding: 12px 16px;
      background-color: rgb(49, 49, 83);
      border-radius: 6px;
      min-width: 200px;
    }
    
    .walk-speed-control input[type="range"] {
      height: 6px;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      outline: none;
      width: 100%;
    }
    
    .walk-speed-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgb(102, 126, 234);
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.5);
    }
    
    .walk-speed-control input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.2);
      box-shadow: 0 0 12px rgba(102, 126, 234, 0.8);
    }
    
    .walk-speed-control input[type="range"]::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgb(102, 126, 234);
      cursor: pointer;
      border: none;
      transition: all 0.3s;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.5);
    }
    
    .walk-speed-control input[type="range"]::-moz-range-thumb:hover {
      transform: scale(1.2);
      box-shadow: 0 0 12px rgba(102, 126, 234, 0.8);
    }
    
    /* WebGPU Submenu Styles */
    .webgpu-submenu {
      min-width: 280px !important;
      max-height: 70vh;
      overflow-y: auto;
      padding: 0 !important;
    }
    
    .webgpu-submenu::-webkit-scrollbar {
      width: 5px;
    }
    
    .webgpu-submenu::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
    }
    
    .webgpu-submenu::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.3);
      border-radius: 3px;
    }
    
    .webgpu-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: linear-gradient(135deg, rgba(105, 219, 124, 0.2) 0%, rgba(40, 40, 70, 0.95) 100%);
      border-bottom: 1px solid rgba(105, 219, 124, 0.3);
      font-size: 14px;
      font-weight: 600;
      color: white;
    }
    
    .webgpu-panel-header .experimental-badge {
      margin-left: auto;
      font-size: 9px;
      padding: 2px 6px;
      background: rgba(255, 193, 7, 0.3);
      color: #ffc107;
      border-radius: 4px;
      font-weight: 500;
    }
    
    .webgpu-panel-content {
      padding: 12px 16px;
    }
    
    .webgpu-main-toggle {
      margin-bottom: 10px;
    }
    
    .webgpu-status {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      padding: 6px 8px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      line-height: 1.4;
      margin-bottom: 8px;
    }
    
    .webgpu-options {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 12px;
      margin-top: 8px;
    }
    
    .webgpu-section {
      margin-bottom: 14px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.15);
      border-radius: 8px;
    }
    
    .webgpu-section-header {
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .webgpu-control {
      margin-bottom: 10px;
    }
    
    .webgpu-control:last-child {
      margin-bottom: 0;
    }
    
    .webgpu-control label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
    }
    
    .webgpu-control select {
      width: 100%;
      padding: 5px 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.3);
      color: white;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }
    
    .webgpu-control select:hover {
      border-color: rgba(105, 219, 124, 0.5);
    }
    
    .webgpu-control input[type="range"] {
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }
    
    .webgpu-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #69db7c;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    }
    
    .webgpu-control input[type="range"]::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #69db7c;
      cursor: pointer;
      border: none;
    }
    
    .webgpu-warning {
      font-size: 9px;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 8px;
      line-height: 1.4;
      text-align: center;
    }
    
    /* WebGPU checkbox labels - white text */
    .webgpu-submenu .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      padding: 6px 0;
      color: #ffffff;
    }
    
    .webgpu-submenu .checkbox-label span {
      color: #ffffff;
      font-size: 12px;
    }
    
    .webgpu-submenu .checkbox-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: #69db7c;
    }

    .settings-panel {
      position: absolute;
      bottom: 80px;
      right: 0;
      background: rgba(40, 40, 70, 0.98);
      backdrop-filter: blur(10px);
      padding: 20px;
      border-radius: 16px;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      min-width: 250px;
      max-height: calc(100vh - 120px);
      overflow-y: auto;
      animation: slideUp 0.3s ease;
    }
    
    /* Custom scrollbar for settings panel */
    .settings-panel::-webkit-scrollbar {
      width: 6px;
    }
    
    .settings-panel::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
    }
    
    .settings-panel::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.3);
      border-radius: 3px;
    }
    
    .settings-panel::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.5);
    }
    
    .settings-content h3 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: white;
    }
    
    .settings-content label {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.9);
    }
    
    .settings-content input[type="color"],
    .settings-content input[type="range"] {
      width: 100%;
      height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      cursor: pointer;
      background: rgba(255, 255, 255, 0.1);
    }
    
    .settings-content input[type="range"] {
      height: 6px;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.2);
    }
    
    .settings-content input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgb(59, 130, 246);
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .settings-content input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.2);
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);
    }
    
    .settings-content .checkbox-label {
      flex-direction: row;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      transition: background 0.2s;
    }
    
    .settings-content .checkbox-label:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    
    .settings-content input[type="checkbox"] {
      width: 20px;
      height: 20px;
      cursor: pointer;
      accent-color: rgb(102, 126, 234);
    }
    
    .settings-content .checkbox-label span {
      flex: 1;
    }
    
    .walk-speed-panel {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(40, 40, 70, 0.98);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      box-shadow: 
        0 8px 24px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 12px 16px;
      z-index: 999;
      animation: slideUp 0.3s ease;
    }
    
    .walk-speed-panel label {
      color: rgba(255, 255, 255, 0.9);
      font-weight: 500;
    }
    
    .walk-speed-panel input[type="range"] {
      height: 6px;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      outline: none;
    }
    
    .walk-speed-panel input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgb(102, 126, 234);
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.5);
    }
    
    .walk-speed-panel input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.2);
      box-shadow: 0 0 12px rgba(102, 126, 234, 0.8);
    }
    
    .model-count-badge {
      position: absolute;
      top: -10px;
      left: -10px;
      display: flex;
      align-items: center;
      gap: 4px;
      background: linear-gradient(145deg, #3b82f6, #2563eb);
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 
        3px 3px 8px rgba(37, 99, 235, 0.3),
        -1px -1px 4px rgba(96, 165, 250, 0.2);
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    .model-count-badge:hover {
      transform: scale(1.05);
      box-shadow: 
        4px 4px 12px rgba(37, 99, 235, 0.4),
        -1px -1px 4px rgba(96, 165, 250, 0.3);
    }
    
    .model-details-tooltip {
      position: absolute;
      bottom: calc(100% + 20px);
      left: -250px;
      background: rgba(40, 40, 70, 0.98);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      box-shadow: 
        0 8px 24px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 12px;
      min-width: 500px;
      max-width: 650px;
      opacity: 0;
      pointer-events: none;
      transform: translateY(5px);
      transition: all 0.3s ease;
      z-index: 1002;
    }
    
    /* Show tooltip on hover, but NOT when submenu is open */
    .model-count-badge:hover .model-details-tooltip {
      opacity: 1;
      pointer-events: all;
      transform: translateY(0);
    }
    
    /* Hide tooltip when submenu is open - override hover */
    .model-count-badge.submenu-open .model-details-tooltip,
    .model-count-badge.submenu-open:hover .model-details-tooltip {
      opacity: 0 !important;
      pointer-events: none !important;
    }
    
    .model-count-badge[data-submenu-open="true"]:hover .model-details-tooltip {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    
    /* Hide tooltip when any submenu is open */
    .toolbar-submenu.active ~ .model-count-badge .model-details-tooltip,
    .model-count-badge:has(~ .toolbar-group .toolbar-submenu.active) .model-details-tooltip {
      opacity: 0 !important;
      pointer-events: none !important;
    }
    
    .tooltip-header {
      font-size: 13px;
      font-weight: 600;
      color: white;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .tooltip-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .no-models {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
      text-align: center;
      padding: 10px;
    }
    
    .model-item {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 10px;
      transition: all 0.2s ease;
    }
    
    .model-item:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateX(-2px);
    }
    
    .model-name {
      color: white;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    
    .model-name > span:first-child {
      display: flex;
      align-items: center;
      gap: 6px;
      word-break: break-word;
      text-align: left;
      flex: 1;
    }
    
    .model-name i.fa-cube {
      color: rgba(59, 130, 246, 0.8);
      flex-shrink: 0;
    }
    
    .model-guid {
      color: rgba(255, 255, 255, 0.6);
      font-weight: 400;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-family: 'Courier New', monospace;
    }
    
    .model-guid i {
      font-size: 10px;
    }
    
    .model-count-badge .icon {
      font-size: 14px;
    }
    
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @media (max-width: 768px) {
      .bottom-toolbar {
        bottom: 10px;
        left: 10px;
        right: 10px;
        transform: none;
      }
      
      .toolbar-container {
        justify-content: space-around;
        padding: 10px;
        border-radius: 16px;
        gap: 4px;
      }
      
      .toolbar-btn {
        padding: 8px 10px;
        min-width: 40px;
      }
      
      .toolbar-btn .icon {
        font-size: 20px;
      }
      
      .toolbar-submenu {
        left: 0;
        transform: translateX(0) scale(0.9);
      }
      
      .toolbar-submenu.visible {
        transform: translateX(0) scale(1);
      }
      
      .settings-panel {
        bottom: 70px;
        left: 10px;
        right: 10px;
        max-height: calc(100vh - 100px);
      }
    }
  `;
}

export function getLoadingIndicatorStyles(): string {
  return `
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    z-index: 9999;
    justify-content: center;
    align-items: center;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  `;
}

/* Loading screen component styles */
export function getLoadingScreenStyles(): string {
  return `
    .loading-content {
      text-align: center;
      width: 500px;
      max-width: 90vw;
      padding: 40px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    
    .loading-spinner-container {
      margin-bottom: 24px;
    }
    
    .loading-spinner {
      width: 60px;
      height: 60px;
      margin: 0 auto;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-top: 4px solid #4A90E2;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .loading-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      color: white;
    }
    
    .loading-subtitle {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 24px;
    }
    
    .loading-progress {
      width: 100%;
      max-width: 420px;
      margin: 0 auto 24px auto;
    }
    
    .progress-bar {
      position: relative;
      width: 420px;
      max-width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    
    .progress-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: linear-gradient(90deg, #4A90E2, #63B3ED);
      border-radius: 4px;
      transform: translateX(-100%);
      transition: transform 0.3s ease;
      will-change: transform;
      width: 100%;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .progress-text {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
    }
    
    .loading-tip {
      font-size: 14px;
      color: #FFD700;
      padding: 12px 16px;
      background: rgba(255, 215, 0, 0.1);
      border-radius: 8px;
      margin-bottom: 12px;
      border-left: 3px solid #FFD700;
      text-align: left;
    }
    
    .loading-joke {
      font-size: 13px;
      color: #63B3ED;
      padding: 12px 16px;
      background: rgba(99, 179, 237, 0.1);
      border-radius: 8px;
      margin-bottom: 24px;
      border-left: 3px solid #63B3ED;
      text-align: left;
    }
  `;
}

export function getPropertiesPanelStyles(): string {
  return `
    /* Container for both panels */
    .ifc-panels-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 900;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    }
    
    /* IFC Tree Panel (Left Side) */
    .ifc-tree-panel {
      position: fixed;
      top: 20px;
      left: 20px;
      width: 280px;
      max-height: calc(100vh - 40px);
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
      transition: transform 0.3s ease, opacity 0.3s ease;
      resize: horizontal;
      min-width: 200px;
      max-width: 500px;
    }
    
    /* Resize handle indicator */
    .ifc-tree-panel::after {
      content: '';
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 4px;
      height: 40px;
      background: rgba(102, 126, 234, 0.3);
      border-radius: 2px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .ifc-tree-panel:hover::after {
      opacity: 1;
    }
    
    .ifc-tree-panel.collapsed {
      transform: translateX(calc(-100% - 20px));
      opacity: 0;
      pointer-events: none;
    }
    
    /* IFC Properties Panel (Right Side) */
    .ifc-properties-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 380px;
      max-height: calc(100vh - 40px);
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    
    .ifc-properties-panel.collapsed {
      transform: translateX(calc(100% + 20px));
      opacity: 0;
      pointer-events: none;
    }
    
    /* Expand Tabs (visible when collapsed) */
    .expand-tab {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      cursor: pointer;
      border-radius: 0 8px 8px 0;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease, transform 0.2s ease;
      z-index: 1000;
      font-size: 18px;
    }
    
    .expand-tab-left {
      left: 0;
    }
    
    .expand-tab-right {
      right: 0;
      border-radius: 8px 0 0 8px;
      box-shadow: -2px 0 8px rgba(0, 0, 0, 0.3);
    }
    
    .expand-tab:hover {
      background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
      transform: translateY(-50%) scale(1.05);
    }
    
    /* Panel Headers */
    .ifc-tree-panel .panel-header,
    .ifc-properties-panel .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px 12px 0 0;
    }
    
    .ifc-tree-panel .panel-header h3,
    .ifc-properties-panel .panel-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .ifc-tree-panel .header-actions,
    .ifc-properties-panel .header-actions {
      display: flex;
      gap: 6px;
    }
    
    .ifc-tree-panel .icon-btn,
    .ifc-properties-panel .icon-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      font-size: 14px;
    }
    
    .ifc-tree-panel .icon-btn:hover,
    .ifc-properties-panel .icon-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    /* Tree Search Box */
    .tree-search-container {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .tree-search-wrapper {
      display: flex;
      align-items: center;
      background: #ffffff;
      border-radius: 6px;
      padding: 6px 10px;
      border: 1px solid rgba(0, 0, 0, 0.15);
      transition: all 0.2s ease;
    }
    
    .tree-search-wrapper:focus-within {
      border-color: #667eea;
      box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
    }
    
    .tree-search-icon {
      color: rgba(0, 0, 0, 0.4);
      font-size: 12px;
      margin-right: 8px;
    }
    
    .tree-search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #000000;
      font-size: 12px;
      padding: 0;
    }
    
    .tree-search-input::placeholder {
      color: rgba(0, 0, 0, 0.4);
    }
    
    .tree-search-clear {
      display: none;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: rgba(0, 0, 0, 0.4);
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      font-size: 10px;
      transition: all 0.2s ease;
    }
    
    .tree-search-clear:hover {
      color: #000;
      background: rgba(0, 0, 0, 0.1);
    }
    
    .tree-search-results {
      display: none;
      padding: 6px 0 0 0;
      font-size: 11px;
    }
    
    .search-result-count {
      color: #667eea;
    }
    
    .search-no-results {
      color: #888888;
      font-style: italic;
    }
    
    /* Search highlight */
    .tree-node-content.tree-search-match {
      background: rgba(102, 126, 234, 0.2) !important;
      border-left: 2px solid #667eea;
    }
    
    .tree-node-content.tree-search-match .tree-label {
      color: #667eea;
      font-weight: 600;
    }

    /* Active search match (currently selected) */
    .tree-node-content.tree-search-active {
      background: rgba(102, 126, 234, 0.4) !important;
      border-left: 4px solid #764ba2 !important;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
    }

    .tree-node-content.tree-search-active .tree-label {
      color: #764ba2 !important;
      font-weight: 800 !important;
      font-size: 1.1em;
    }
    
    /* Tree Container */
    .ifc-tree-panel .tree-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      min-height: 0;
    }
    
    /* Properties Content */
    .ifc-properties-panel .properties-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      min-height: 0;
    }
    
    /* Tree Styles */
    .tree-root {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    
    .tree-node {
      margin: 0;
      position: relative;
    }
    
    .tree-children {
      list-style: none;
      margin: 0;
      padding: 0;
      padding-left: 18px;
      display: none;
      position: relative;
    }
    
    /* Vertical line for hierarchy */
    .tree-children::before {
      content: '';
      position: absolute;
      left: 9px;
      top: 0;
      bottom: 0;
      width: 1px;
      background: rgba(102, 126, 234, 0.2);
    }
    
    .tree-node.expanded > .tree-children {
      display: block;
    }
    
    .tree-node-content {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px;
      border-radius: 4px;
      cursor: default;
      transition: all 0.2s ease;
      position: relative;
      user-select: none;
      min-height: 26px;
    }
    
    /* Hover effect for all nodes */
    .tree-node-content:hover {
      background: rgba(102, 126, 234, 0.08);
    }
    
    /* Toggle icon */
    .tree-toggle {
      color: #667eea;
      font-size: 9px;
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.2s ease;
      border-radius: 3px;
      flex-shrink: 0;
    }
    
    .tree-toggle:hover {
      background: rgba(102, 126, 234, 0.15);
    }
    
    .tree-node.expanded > .tree-node-content .tree-toggle i {
      transform: rotate(0deg);
    }
    
    .tree-toggle i {
      transition: transform 0.2s ease;
    }
    
    /* Spacer for nodes without children */
    .tree-spacer {
      width: 14px;
      height: 14px;
      display: inline-block;
      flex-shrink: 0;
    }
    
    /* Icon styling */
    .tree-icon {
      color: #667eea;
      font-size: 12px;
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    
    /* Different icons for different node types */
    .model-node .tree-icon {
      color: #667eea;
    }
    
    .spatial-node .tree-icon {
      color: #764ba2;
    }
    
    .category-node .tree-icon {
      color: #f093fb;
    }
    
    .element-node .tree-icon {
      color: #4facfe;
    }
    
    /* Label styling */
    .tree-label {
      flex: 1;
      font-size: 11px;
      color: #2d3748;
      font-weight: 500;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    /* Different label styles for node types */
    .model-node > .tree-node-content .tree-label {
      font-weight: 600;
      font-size: 12px;
      color: #1a202c;
    }
    
    .spatial-node > .tree-node-content .tree-label {
      font-weight: 600;
      font-size: 11px;
      color: #2d3748;
    }
    
    .category-node > .tree-node-content .tree-label {
      font-weight: 500;
      font-size: 11px;
      color: #4a5568;
    }
    
    .element-node > .tree-node-content .tree-label {
      font-weight: 400;
      font-size: 10px;
      color: #718096;
    }
    
    /* Count badge */
    .tree-count {
      font-size: 9px;
      color: #718096;
      background: rgba(102, 126, 234, 0.1);
      padding: 1px 4px;
      border-radius: 8px;
      font-weight: 500;
      flex-shrink: 0;
    }
    
    /* Selectable nodes */
    .tree-node-content.selectable {
      cursor: pointer;
    }
    
    .tree-node-content.selectable:hover {
      background: rgba(102, 126, 234, 0.15);
    }
    
    .tree-node-content.selectable:active {
      background: rgba(102, 126, 234, 0.25);
      transform: scale(0.98);
    }
    
    /* Selected state */
    .tree-node-content.selected {
      background: rgba(102, 126, 234, 0.2);
      box-shadow: inset 0 0 0 1px rgba(102, 126, 234, 0.3);
    }
    
    /* No models message */
    .no-models {
      text-align: center;
      color: #999;
      padding: 20px;
      font-style: italic;
    }
    
    .ifc-properties-panel .property-groups {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .ifc-properties-panel .property-group {
      background: rgba(0, 0, 0, 0.02);
      border-radius: 6px;
      padding: 8px;
    }
    
    .ifc-properties-panel .property-group-header {
      font-weight: 600;
      font-size: 13px;
      color: #667eea;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(102, 126, 234, 0.2);
    }
    
    .ifc-properties-panel .property-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    }
    
    .ifc-properties-panel .property-row:last-child {
      border-bottom: none;
    }
    
    .ifc-properties-panel .property-key {
      color: #666;
      font-weight: 500;
      font-size: 12px;
    }
    
    .ifc-properties-panel .property-value {
      color: #333;
      font-weight: 400;
      font-size: 12px;
      text-align: right;
      word-break: break-word;
      max-width: 60%;
    }
    
    .ifc-properties-panel .property-value.small {
      font-size: 10px;
      font-family: monospace;
    }
    
    .ifc-properties-panel .error {
      color: #e74c3c;
      padding: 12px;
      text-align: center;
      background: rgba(231, 76, 60, 0.1);
      border-radius: 6px;
    }
    
    /* Mobile responsiveness */
    @media (max-width: 768px) {
      .ifc-properties-panel {
        width: calc(100% - 40px);
        max-width: 350px;
        right: 20px;
      }
    }
    
    /* Scrollbar styling */
    .ifc-properties-panel .tree-container::-webkit-scrollbar,
    .ifc-properties-panel .properties-content::-webkit-scrollbar,
    .ifc-properties-panel .tree-section::-webkit-scrollbar,
    .ifc-properties-panel .properties-section::-webkit-scrollbar {
      width: 6px;
    }
    
    .ifc-properties-panel .tree-container::-webkit-scrollbar-track,
    .ifc-properties-panel .properties-content::-webkit-scrollbar-track,
    .ifc-properties-panel .tree-section::-webkit-scrollbar-track,
    .ifc-properties-panel .properties-section::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.05);
      border-radius: 3px;
    }
    
    .ifc-properties-panel .tree-container::-webkit-scrollbar-thumb,
    .ifc-properties-panel .properties-content::-webkit-scrollbar-thumb,
    .ifc-properties-panel .tree-section::-webkit-scrollbar-thumb,
    .ifc-properties-panel .properties-section::-webkit-scrollbar-thumb {
      background: #667eea;
      border-radius: 3px;
    }
    
    .ifc-properties-panel .tree-container::-webkit-scrollbar-thumb:hover,
    .ifc-properties-panel .properties-content::-webkit-scrollbar-thumb:hover,
    .ifc-properties-panel .tree-section::-webkit-scrollbar-thumb:hover,
    .ifc-properties-panel .properties-section::-webkit-scrollbar-thumb:hover {
      background: #764ba2;
    }
    
    /* Far-Origin Model Warning Label */
    .coordinate-warning {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999;
      background: linear-gradient(135deg, rgba(255, 152, 0, 0.95) 0%, rgba(255, 87, 34, 0.95) 100%);
      backdrop-filter: blur(10px);
      padding: 12px 18px;
      border-radius: 10px;
      box-shadow: 
        0 4px 20px rgba(255, 152, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideInRight 0.4s ease-out;
      max-width: 320px;
    }
    
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .coordinate-warning-icon {
      font-size: 20px;
      line-height: 1;
    }
    
    .coordinate-warning-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .coordinate-warning-title {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.3px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    .coordinate-warning-message {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.95);
      line-height: 1.4;
    }
    
    .coordinate-warning-close {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: #fff;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      transition: all 0.2s ease;
      flex-shrink: 0;
      margin-left: 6px;
    }
    
    .coordinate-warning-close:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }

    /* Search Navigation Buttons */
    .search-nav-controls .icon-btn {
      background: rgba(102, 126, 234, 0.1) !important; /* Override default white */
      color: #667eea !important; /* Override default white */
      border: 1px solid rgba(102, 126, 234, 0.2) !important;
    }
    
    .search-nav-controls .icon-btn:hover {
      background: rgba(102, 126, 234, 0.2) !important;
      color: #764ba2 !important;
      transform: translateY(-1px);
    }
  `;
}
