/**
 * ToolbarBuilder module
 * Contains functions to generate HTML for toolbar components
 */

/**
 * Creates the HTML structure for the bottom toolbar
 */
export function createToolbarHTML(): string {
  return `
    <div class="toolbar-container">
      <!-- GOMERA Logo/Brand -->
      <div class="toolbar-brand">
        <span class="brand-text">GOMERA</span>
      </div>
      
      <!-- Load Model Group (expandable) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="upload" title="Load Model">
          <span class="icon"><i class="fas fa-folder-open"></i></span>
        </button>
        <div class="toolbar-submenu" id="loadSubmenu">
          <button class="submenu-btn" data-action="upload" title="Upload IFC File">
            <span class="icon"><i class="fas fa-file-upload"></i></span>
            <span class="label">Upload File</span>
          </button>
          <button class="submenu-btn" data-action="sample" title="Load Sample">
            <span class="icon"><i class="fas fa-building"></i></span>
            <span class="label">Load Sample</span>
          </button>
        </div>
      </div>
      
      <!-- Export Group (expandable) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="toggleExport" title="Export Options">
          <span class="icon"><i class="fas fa-download"></i></span>
        </button>
        <div class="toolbar-submenu" id="exportSubmenu">
          <button class="submenu-btn" data-action="exportFragments" title="Export as Fragments (.frag) - Fast loading format">
            <span class="icon"><i class="fas fa-puzzle-piece"></i></span>
            <span class="label">Fragments (.frag)</span>
          </button>
          <button class="submenu-btn" data-action="exportGLTF" title="Export as glTF (.gltf) - 3D interchange format">
            <span class="icon"><i class="fas fa-cube"></i></span>
            <span class="label">glTF (.gltf)</span>
          </button>
          <button class="submenu-btn" data-action="exportGLB" title="Export as GLB (.glb) - Binary glTF format">
            <span class="icon"><i class="fas fa-box"></i></span>
            <span class="label">GLB (.glb)</span>
          </button>
          <button class="submenu-btn" data-action="exportUSDZ" title="Export as USDZ (.usdz) - Universal Scene Description">
            <span class="icon"><i class="fas fa-gem"></i></span>
            <span class="label">USDZ (.usdz)</span>
          </button>
          <button class="submenu-btn" data-action="exportScreenshot" title="Export Screenshot (PNG)">
            <span class="icon"><i class="fas fa-camera"></i></span>
            <span class="label">Screenshot (PNG)</span>
          </button>
          <button class="submenu-btn" data-action="exportJSON" title="Export Properties as JSON">
            <span class="icon"><i class="fas fa-file-code"></i></span>
            <span class="label">Properties (JSON)</span>
          </button>
        </div>
      </div>
      
      <!-- View Controls Group (expandable) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="toggleView" title="View Controls">
          <span class="icon"><i class="fas fa-eye"></i></span>
        </button>
        <div class="toolbar-submenu" id="viewSubmenu">
          <button class="submenu-btn" data-action="center" title="Center Models">
            <span class="icon"><i class="fas fa-bullseye"></i></span>
            <span class="label">Center</span>
          </button>
          <button class="submenu-btn" data-action="fit" title="Fit Camera">
            <span class="icon"><i class="fas fa-compress"></i></span>
            <span class="label">Fit View</span>
          </button>
          <button class="submenu-btn" data-action="autoRotate" title="Auto Rotate View (Click to stop)" id="autoRotateBtn">
            <span class="icon"><i class="fas fa-sync-alt"></i></span>
            <span class="label">Auto Rotate</span>
          </button>
          <button class="submenu-btn" data-action="toggleSpaces" title="Toggle Space Visibility" id="toggleSpacesBtn">
            <span class="icon"><i class="fas fa-cube"></i></span>
            <span class="label">Hide Spaces</span>
          </button>
          <button class="submenu-btn" data-action="toggleGrid" title="Toggle Grid Visibility" id="toggleGridBtn">
            <span class="icon"><i class="fas fa-th"></i></span>
            <span class="label">Hide Grid</span>
          </button>
          <button class="submenu-btn" data-action="alignModels" title="Model Alignment Tool" id="alignModelsBtn">
            <span class="icon"><i class="fas fa-arrows-alt"></i></span>
            <span class="label">Align Models</span>
          </button>
          <button class="submenu-btn" data-action="createFloorPlan" title="Create Floor Plan View" id="createFloorPlanBtn">
            <span class="icon"><i class="fas fa-map"></i></span>
            <span class="label">Floor Plans</span>
          </button>
          <button class="submenu-btn" data-action="closeFloorPlan" title="Close Floor Plan View" id="closeFloorPlanBtn" style="display: none;">
            <span class="icon"><i class="fas fa-times-circle"></i></span>
            <span class="label">Close Floor Plan</span>
          </button>
        </div>
      </div>
      
      <!-- Cluster Button (main toolbar button) - HIDDEN but keeping logic -->
      <div class="toolbar-group" style="display: none;">
        <button class="toolbar-btn" data-action="toggleCluster" title="IFC Element Clustering" id="clusterMainBtn">
          <span class="icon"><i class="fas fa-cubes"></i></span>
        </button>
        <div class="toolbar-submenu" id="clusterSubmenu">
          <button class="submenu-btn" data-action="cancelClusterMode" title="Exit Cluster Mode & Fit View">
            <span class="icon"><i class="fas fa-times-circle"></i></span>
            <span class="label">Cancel Mode</span>
          </button>
        </div>
      </div>
      
      <!-- Color Splash Button (main toolbar button) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="toggleColorSplash" title="Color Elements by Type" id="colorSplashMainBtn">
          <span class="icon"><i class="fas fa-paint-brush"></i></span>
        </button>
        <div class="toolbar-submenu" id="colorSplashSubmenu">
          <button class="submenu-btn" data-action="cancelColorSplashMode" title="Exit Color Splash & Fit View">
            <span class="icon"><i class="fas fa-times-circle"></i></span>
            <span class="label">Cancel Mode</span>
          </button>
        </div>
      </div>
      
      <!-- Walk Mode Group (first person + WASD controls) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="toggleWalkMode" title="Walking Mode (WASD)" id="walkModeBtn">
          <span class="icon"><i class="fas fa-walking"></i></span>
          <span class="walk-indicator" id="walkIndicator" style="display: none;"></span>
        </button>
        <div class="toolbar-submenu" id="walkSubmenu">
          <div class="walk-speed-control">
            <label style="font-size: 11px; color: #999; display: block; margin-bottom: 6px; text-align: center;">
              <i class="fas fa-tachometer-alt" style="margin-right: 4px;"></i>Walk Speed
            </label>
            <input type="range" id="walkSpeedSlider" min="0.1" max="2" step="0.1" value="0.3" 
                   style="width: 180px; cursor: pointer;">
            <div style="display: flex; justify-content: space-between; font-size: 9px; color: #666; margin-top: 4px; width: 180px;">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </div>
          <button class="submenu-btn" data-action="toggleMinimap" title="Toggle Minimap" id="minimapBtn">
            <span class="icon"><i class="fas fa-map-marked-alt"></i></span>
            <span class="label">Show Minimap</span>
          </button>
          <button class="submenu-btn" data-action="cancelWalkMode" title="Exit Walking Mode">
            <span class="icon"><i class="fas fa-times-circle"></i></span>
            <span class="label">Cancel Mode</span>
          </button>
        </div>
      </div>
      
      <!-- Clipper Group (expandable sectioning tool) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="toggleClipper" title="Sectioning Tool" id="clipperBtn">
          <span class="icon"><i class="fas fa-cut"></i></span>
        </button>
        <div class="toolbar-submenu" id="clipperSubmenu">
          <button class="submenu-btn" data-action="clipperX" title="Section X Axis">
            <span class="icon">X</span>
            <span class="label">Section X</span>
          </button>
          <button class="submenu-btn" data-action="clipperY" title="Section Y Axis">
            <span class="icon">Y</span>
            <span class="label">Section Y</span>
          </button>
          <button class="submenu-btn" data-action="clipperZ" title="Section Z Axis">
            <span class="icon">Z</span>
            <span class="label">Section Z</span>
          </button>
          <button class="submenu-btn" data-action="clipperSurface" title="Double-click on any surface to create section" id="clipperSurfaceBtn">
            <span class="icon"><i class="fas fa-mouse-pointer"></i></span>
            <span class="label">Click Surface</span>
          </button>
          <button class="submenu-btn" data-action="clipperFlip" title="Flip Section (Show Other Side)">
            <span class="icon"><i class="fas fa-exchange-alt"></i></span>
            <span class="label">Flip Side</span>
          </button>
          <button class="submenu-btn" data-action="cancelClipperMode" title="Clear All Sections & Exit Mode">
            <span class="icon"><i class="fas fa-times-circle"></i></span>
            <span class="label">Cancel Mode</span>
          </button>
        </div>
      </div>
      
      <!-- Measurement Group (expandable measurement tools) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="toggleMeasure" title="Measurement Tools" id="measureBtn">
          <span class="icon"><i class="fas fa-ruler-combined"></i></span>
        </button>
        <div class="toolbar-submenu" id="measureSubmenu">
          <button class="submenu-btn" data-action="measureLength" title="Length Measurement (Double-click to measure)">
            <span class="icon"><i class="fas fa-ruler"></i></span>
            <span class="label">Length</span>
          </button>
          <button class="submenu-btn" data-action="measureArea" title="Area Measurement (Double-click to start, Enter to finish)">
            <span class="icon"><i class="fas fa-vector-square"></i></span>
            <span class="label">Area</span>
          </button>
          <button class="submenu-btn" data-action="measureVolume" title="Volume Measurement (Double-click to start, Enter to finish)">
            <span class="icon"><i class="fas fa-cube"></i></span>
            <span class="label">Volume</span>
          </button>
          <button class="submenu-btn" data-action="measureClear" title="Clear All Measurements">
            <span class="icon"><i class="fas fa-eraser"></i></span>
            <span class="label">Clear All</span>
          </button>
          <button class="submenu-btn" data-action="measureExport" title="Export Measurements as JSON">
            <span class="icon"><i class="fas fa-file-export"></i></span>
            <span class="label">Export</span>
          </button>
          <button class="submenu-btn" data-action="togglePerpGuides" title="Toggle Perpendicular Guides" id="perpGuidesBtn">
            <span class="icon"><i class="fas fa-grip-lines"></i></span>
            <span class="label">Guides: ON</span>
          </button>
          <button class="submenu-btn" data-action="cancelMeasureMode" title="Exit Measurement Mode">
            <span class="icon"><i class="fas fa-times-circle"></i></span>
            <span class="label">Cancel Mode</span>
          </button>
        </div>
      </div>
      
      <!-- Info Group (expandable) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="toggleInfo" title="Model Information">
          <span class="icon"><i class="fas fa-info-circle"></i></span>
        </button>
        <div class="toolbar-submenu" id="infoSubmenu">
          <button class="submenu-btn" data-action="modelinfo" title="Models Info">
            <span class="icon"><i class="fas fa-cube"></i></span>
            <span class="label">Model Info</span>
          </button>
          <button class="submenu-btn" data-action="openSlicer" title="Interactive Slicer Dashboard" id="slicerBtn">
            <span class="icon"><i class="fas fa-sliders-h"></i></span>
            <span class="label">Slicer Dashboard</span>
          </button>
        </div>
      </div>
      
      <button class="toolbar-btn" data-action="clear" title="Clear All Models">
        <span class="icon"><i class="fas fa-trash-alt"></i></span>
      </button>
      
      <button class="toolbar-btn" data-action="settings" title="Settings">
        <span class="icon"><i class="fas fa-cog"></i></span>
      </button>
      
      <!-- WebGPU Renderer Group (expandable) -->
      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="toggleWebGPUPanel" title="WebGPU Renderer (Experimental)" id="webgpuMainBtn">
          <span class="icon"><i class="fas fa-microchip"></i></span>
        </button>
        <div class="toolbar-submenu webgpu-submenu" id="webgpuSubmenu">
          <div class="webgpu-panel-header">
            <i class="fas fa-microchip" style="color: #69db7c;"></i>
            <span>WebGPU Renderer</span>
            <span class="experimental-badge">Experimental</span>
          </div>
          
          <div class="webgpu-panel-content">
            <!-- Enable WebGPU Toggle -->
            <label class="checkbox-label webgpu-main-toggle">
              <input type="checkbox" id="webgpuToggle">
              <span>Enable WebGPU</span>
            </label>
            
            <div id="webgpuStatus" class="webgpu-status">
              <span id="webgpuStatusIcon">⏳</span> <span id="webgpuStatusText">Checking...</span>
            </div>
            
            <!-- WebGPU Options (shown when WebGPU is active) -->
            <div id="webgpuOptions" class="webgpu-options" style="display: none;">
              
              <!-- Lighting Section -->
              <div class="webgpu-section">
                <div class="webgpu-section-header">☀️ Lighting</div>
                
                <!-- Tone Mapping -->
                <div class="webgpu-control">
                  <label>Tone Mapping:</label>
                  <select id="toneMappingSelect">
                    <option value="0">None</option>
                    <option value="1">Linear</option>
                    <option value="2">Reinhard</option>
                    <option value="3">Cineon</option>
                    <option value="4" selected>ACES Filmic</option>
                    <option value="6">AgX</option>
                    <option value="7">Neutral</option>
                  </select>
                </div>
                
                <!-- Exposure -->
                <div class="webgpu-control">
                  <label>
                    <span>Exposure:</span>
                    <span id="exposureValue">1.0</span>
                  </label>
                  <input type="range" id="exposureSlider" min="0.1" max="3" step="0.1" value="1">
                </div>
              </div>
              
              <!-- Shadows Section -->
              <div class="webgpu-section">
                <div class="webgpu-section-header">🌒 Shadows</div>
                
                <label class="checkbox-label">
                  <input type="checkbox" id="webgpuShadowsToggle" checked>
                  <span>Enable Shadows</span>
                </label>
                
                <!-- Shadow Angle -->
                <div class="webgpu-control">
                  <label>
                    <span>Sun Angle:</span>
                    <span id="shadowAngleValue">45°</span>
                  </label>
                  <input type="range" id="shadowAngleSlider" min="0" max="360" step="5" value="45">
                </div>
                
                <!-- Shadow Elevation -->
                <div class="webgpu-control">
                  <label>
                    <span>Sun Height:</span>
                    <span id="shadowElevationValue">45°</span>
                  </label>
                  <input type="range" id="shadowElevationSlider" min="10" max="90" step="5" value="45">
                </div>
                
                <!-- Ground Plane Toggle -->
                <label class="checkbox-label">
                  <input type="checkbox" id="webgpuGroundPlaneToggle" checked>
                  <span>Show Ground Plane</span>
                </label>
              </div>
              
              <!-- Edges Section -->
              <div class="webgpu-section">
                <div class="webgpu-section-header">✏️ Edges</div>
                
                <label class="checkbox-label">
                  <input type="checkbox" id="webgpuEdgesToggle">
                  <span>Show Edges/Outlines</span>
                </label>
                
                <!-- Edge Threshold Slider -->
                <div id="edgeThresholdControl" class="webgpu-control" style="display: none;">
                  <label>
                    <span>Edge Threshold:</span>
                    <span id="edgeThresholdValue">15°</span>
                  </label>
                  <input type="range" id="edgeThresholdSlider" min="5" max="45" step="5" value="15">
                </div>
              </div>
              
              <!-- Stats Section -->
              <div class="webgpu-section">
                <div class="webgpu-section-header">📊 Performance</div>
                
                <label class="checkbox-label">
                  <input type="checkbox" id="webgpuStatsToggle">
                  <span>Show Stats Overlay</span>
                </label>
                
                <label class="checkbox-label">
                  <input type="checkbox" id="webgpuFrustumCullingToggle" checked>
                  <span>Frustum Culling</span>
                </label>
                
                <!-- Shadow Quality -->
                <div class="webgpu-control">
                  <label>Shadow Quality:</label>
                  <select id="shadowQualitySelect">
                    <option value="512">Low (512)</option>
                    <option value="1024">Medium (1024)</option>
                    <option value="2048" selected>High (2048)</option>
                    <option value="4096">Ultra (4096)</option>
                  </select>
                </div>
                
                <!-- Performance Presets -->
                <div class="webgpu-control">
                  <label>Performance Preset:</label>
                  <select id="performancePresetSelect">
                    <option value="">Custom</option>
                    <option value="low">Low (Fast)</option>
                    <option value="medium">Medium (Balanced)</option>
                    <option value="high">High (Quality)</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div class="webgpu-warning">
              ⚠️ Disables post-processing (AO, outlines)
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Settings Panel (hidden by default) -->
    <div class="settings-panel" id="settingsPanel" style="display: none;">
      <div class="settings-content">
        <h3>Scene Settings</h3>
        <label>
          Background Color
          <input type="color" id="bgColorPicker" value="#202932">
        </label>
        <label>
          Directional Light
          <input type="range" id="dirLightSlider" min="0" max="10" step="0.1" value="5">
        </label>
        <label>
          Ambient Light
          <input type="range" id="ambLightSlider" min="0" max="10" step="0.1" value="2">
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="adaptiveQualityToggle" checked>
          <span>Adaptive Quality (Auto FPS)</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="doubleSidedRenderingToggle" checked>
          <span>Double-Sided Rendering</span>
        </label>
        
        <!-- Visual Style Selector -->
        <div style="margin-top: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px; color: rgba(255,255,255,0.7);">
            Visual Style:
          </label>
          <select id="visualStyleSelect" style="width: 100%; padding: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white; border-radius: 4px; font-size: 12px;">
            <option value="0">Basic (Fast)</option>
            <option value="1">Pen (Edges)</option>
            <option value="2">Pen + Shadows</option>
            <option value="3">Color + Pen</option>
            <option value="4" selected>Realistic (Shadows)</option>
            <option value="5">Full (Color+Pen+Shadows)</option>
          </select>
        </div>
        
        <!-- Section Cut Settings Group -->
        <div class="settings-group" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.15);">
          <h4 style="margin: 0 0 12px 0; font-size: 13px; color: rgba(255,255,255,0.9); display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-cut" style="color: #4dabf7;"></i>
            Section Cut Settings
          </h4>
          
          <label class="checkbox-label">
            <input type="checkbox" id="sectionHatchesToggle" checked>
            <span>Enable Section Fills</span>
          </label>
          
          <!-- Fill Opacity Selector -->
          <div style="margin-top: 10px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; color: rgba(255,255,255,0.7);">
              Fill Opacity:
            </label>
            <select id="hatchPerformanceModeSelect" style="width: 100%; padding: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white; border-radius: 4px; font-size: 12px;">
              <option value="high">High (50%)</option>
              <option value="balanced" selected>Balanced (30%)</option>
              <option value="performance">Subtle (10%)</option>
            </select>
          </div>
          
          <!-- Fill Color Selector -->
          <div style="margin-top: 10px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; color: rgba(255,255,255,0.7);">
              Fill Color:
            </label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="color" id="sectionFillColorPicker" value="#add8e6" style="width: 50px; height: 30px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); border-radius: 4px; cursor: pointer;">
              <select id="sectionFillColorPreset" style="flex: 1; padding: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white; border-radius: 4px; font-size: 12px;">
                <option value="#add8e6" selected>Light Blue</option>
                <option value="#ffcccb">Light Red</option>
                <option value="#90ee90">Light Green</option>
                <option value="#ffffe0">Light Yellow</option>
                <option value="#dda0dd">Light Purple</option>
                <option value="#ffa07a">Light Orange</option>
                <option value="#d3d3d3">Light Gray</option>
                <option value="custom">Custom...</option>
              </select>
            </div>
          </div>
          
          <div style="font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 8px; padding: 6px; background: rgba(0,0,0,0.2); border-radius: 4px; line-height: 1.4;">
            💡 Section fills show clean cut<br>surfaces when using sectioning tool
          </div>
        </div>
      </div>
    </div>
    
    <!-- Model Count Badge -->
    <div class="model-count-badge" id="modelCountBadge">
      <span class="icon"><i class="fas fa-layer-group"></i></span>
      <span class="count" id="modelCount">0</span>
      
      <!-- Model Details Tooltip -->
      <div class="model-details-tooltip" id="modelDetailsTooltip">
        <div class="tooltip-header">Loaded Models</div>
        <div class="tooltip-content" id="modelDetailsContent">
          <div class="no-models">No models loaded</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Creates the HTML for the loading indicator overlay
 */
export function createLoadingIndicatorHTML(): string {
  const tips = [
    "💡 Tip: Use the View Cube to quickly orient your camera",
    "💡 Tip: Double-click the Cluster button to toggle cluster view",
    "💡 Tip: Use Section tool to cut through the model",
    "💡 Tip: Right-click and drag to pan the camera",
    "💡 Tip: Press 'W' to enable first-person navigation mode",
    "💡 Tip: Use the Measure tool to get accurate dimensions",
    "💡 Tip: Click on elements to view their IFC properties",
    "💡 Tip: Use Fit View to see all loaded models at once",
    "💡 Tip: The minimap helps you navigate large floor plans",
    "💡 Tip: Export models as fragments for faster loading next time",
    "💡 Tip: Multiple IFC files can be loaded and aligned automatically",
    "💡 Tip: Use Space Visibility to toggle building spaces on/off",
    "💡 Tip: Scroll to zoom, drag to rotate the 3D view",
    "💡 Tip: The properties panel shows detailed IFC element data",
    "💡 Tip: Section views can show interior details clearly"
  ];
  
  const jokes = [
    "😄 Why did the IFC file go to therapy? It had too many relationships!",
    "😄 What's an architect's favorite music? IFC and roll!",
    "😄 Why don't IFC files ever get lost? They always know their coordinates!",
    "😄 How do BIM models stay in shape? They do geometric exercises!",
    "😄 What did the wall say to the slab? 'I've got you covered!'",
    "😄 Why was the IFC file so confident? It had great properties!",
    "😄 What's a 3D model's favorite dessert? Layer cake!",
    "😄 Why did the beam break up with the column? It needed more support!",
    "😄 How do IFC elements communicate? Through their relationships!",
    "😄 What's a BIM coordinator's favorite movie? The Matrix... of transformations!",
    "😄 Why don't doors ever win arguments? They always get framed!",
    "😄 What did the architect say to the broken IFC? 'Let's rebuild this relationship!'"
  ];
  
  const randomTip = tips[Math.floor(Math.random() * tips.length)];
  const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
  
  return `
    <div class="loading-content">
      <div class="loading-spinner-container">
        <div class="loading-spinner"></div>
      </div>
      <div class="loading-title">Loading IFC Model</div>
      <div class="loading-subtitle">Please wait while we process your file...</div>
      <div class="loading-progress">
        <div class="progress-bar">
          <div class="progress-fill" id="loadingProgress"></div>
        </div>
        <div class="progress-text" id="loadingProgressText">Initializing...</div>
      </div>
      <div class="loading-tip" id="loadingTip" 
           data-tips='${JSON.stringify(tips).replace(/'/g, "&apos;")}'>${randomTip}</div>
      <div class="loading-joke" id="loadingJoke"
           data-jokes='${JSON.stringify(jokes).replace(/'/g, "&apos;")}'>${randomJoke}</div>
    </div>
  `;
}
