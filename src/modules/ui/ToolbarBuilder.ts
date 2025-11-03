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
      
      <button class="toolbar-btn" data-action="export" title="Export as Fragments">
        <span class="icon"><i class="fas fa-download"></i></span>
      </button>
      
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
        </div>
      </div>
      
      <button class="toolbar-btn" data-action="clear" title="Clear All Models">
        <span class="icon"><i class="fas fa-trash-alt"></i></span>
      </button>
      
      <button class="toolbar-btn" data-action="settings" title="Settings">
        <span class="icon"><i class="fas fa-cog"></i></span>
      </button>
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
          <input type="checkbox" id="ambientOcclusionToggle" checked>
          <span>Ambient Occlusion (AO)</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="doubleSidedRenderingToggle" checked>
          <span>Double-Sided Rendering</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="sectionHatchesToggle" checked>
          <span>Section Hatches</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="sectionFillsToggle" checked>
          <span>Hatch Fills</span>
        </label>
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
  return `
    <div style="text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
      <div>Loading IFC Model...</div>
    </div>
  `;
}
