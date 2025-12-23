# WebGPU Renderer Module - Modular Architecture

This directory contains the modularized WebGPU renderer components. The code has been organized into focused, single-responsibility modules for better maintainability and testability.

## Module Structure

```text
webgpu/
├── index.ts                    # Re-exports all modules
├── WebGPURendererModule.ts     # Main entry point and orchestration
├── WebGPUTypes.ts              # Shared types, interfaces, and constants
├── WebGPUShadowManager.ts      # Shadow light and ground plane management
├── WebGPUEdgeManager.ts        # Edge/wireframe rendering
├── WebGPUOutlineManager.ts     # Selection highlighting and outlines
├── WebGPUColorPicker.ts        # Individual element picking in merged geometry
├── WebGPUElementSelector.ts    # Individual element selection and extraction
├── WebGPUStatsOverlay.ts       # Performance stats UI overlay
├── WebGPUOptimizations.ts      # Frustum culling, geometry merging
├── WebGPULODManager.ts         # Level of Detail (LOD) system
├── WebGPUFog.ts                # Atmospheric fog effects
├── WebGPUMaterialFactory.ts    # Material creation and caching
└── WebGPUGeometryUtils.ts      # Geometry conversion utilities
```

## Module Descriptions

### WebGPURendererModule.ts

The central hub for WebGPU rendering. It orchestrates all other modules and provides the main interface for the application:

- Renderer initialization and lifecycle management
- Scene and camera synchronization
- Integration with all sub-managers (Shadows, Edges, Outlines, etc.)
- Support for ColorSplash and Cluster modes in WebGPU

### WebGPUTypes.ts

Shared type definitions and constants used across all WebGPU modules:

- `RendererMode`, `WebGPUStatus`, `PerformancePreset`
- `SceneStats`, `PerformanceStats` interfaces
- `ShadowConfig`, `EdgeConfig`, `GroundPlaneConfig`
- `OutlineSettings`, `FogSettings`, `LODSettings`
- `CATEGORY_COLORS` - IFC element color palette
- `TONE_MAPPING_MODES` - Available tone mapping options
- Utility functions: `formatNumber`, `getToneMappingName`

### WebGPUShadowManager.ts

Handles all shadow-related functionality:

- Shadow-casting directional light setup
- Ground plane creation and positioning
- Shadow bounds calculation from scene
- Shadow angle and elevation control
- Safe shadow map resolution changes (recreates light to avoid WebGPU freeze)

### WebGPUEdgeManager.ts

Manages edge/wireframe rendering:

- Creates edge lines for all meshes using `THREE.EdgesGeometry`
- Configurable angle threshold
- Enable/disable at runtime
- Proper cleanup and disposal

### WebGPUOutlineManager.ts

Provides selection highlighting and outlines:

- Multi-pass rendering for selected objects
- Scaled-up back-face rendering for clean outlines
- Configurable outline color and thickness
- Hover effect support

### WebGPUColorPicker.ts

Enables individual element picking within merged geometries:

- Uses element ID encoding in vertex attributes
- CPU raycasting combined with attribute lookup
- RGB-to-ID decoding for fast element identification

### WebGPUElementSelector.ts

Handles individual element selection and extraction:

- Extracts specific element geometry from merged meshes
- Creates overlay meshes for highlighted elements
- Avoids ShaderMaterial for maximum WebGPU compatibility

### WebGPUStatsOverlay.ts

Real-time performance metrics display:

- FPS, frame time, min/max tracking
- Scene statistics (meshes, triangles, draw calls)
- Memory usage (geometries, materials, JS heap)
- Hardware info (CPU cores, device memory, battery)
- Draggable, styled overlay with scrollbar support

### WebGPUOptimizations.ts

Performance optimization utilities:

- Frustum culling implementation
- Camera movement detection
- Geometry merging by material
- Visible mesh counting

### WebGPULODManager.ts

Automatic Level of Detail (LOD) system:

- Distance-based geometry switching
- Full and Simplified detail levels
- Real-time LOD statistics and performance gains

### WebGPUFog.ts

Atmospheric fog effects:

- Linear and Exponential fog types
- Configurable density and falloff
- Works perfectly with MSAA (anti-aliasing)

### WebGPUMaterialFactory.ts

Material creation and caching:

- Material caching by color key
- Category-based materials (ColorSplash palette)
- Real material conversion from IFC data
- WebGPU-compatible MeshStandardMaterial creation

### WebGPUGeometryUtils.ts

Geometry manipulation utilities:

- TypedArray conversion (Float32, Uint32)
- Buffer attribute copying
- Int16 normals to Float32 conversion (WebGPU requirement)
- Geometry sanitization for WebGPU compatibility

## Limitations & Future Work

- **Ambient Occlusion (SSAO/GTAO)**: Currently not implemented due to compatibility issues between Three.js GTAONode and MSAA in WebGPU.
- **Sectioning/Clipping**: Not supported in WebGPU mode due to `ClippingGroup` compatibility issues.
- **Post-processing**: Limited support when MSAA is enabled.

## Usage

Import from the main index:

```typescript
import {
  WebGPURendererModule,
  WebGPUShadowManager,
  WebGPUEdgeManager,
  WebGPUOutlineManager,
  WebGPUColorPicker,
  WebGPUElementSelector,
  WebGPUStatsOverlay,
  WebGPUOptimizations,
  WebGPULODManager,
  WebGPUFog,
  WebGPUMaterialFactory,
  CATEGORY_COLORS,
  formatNumber,
  sanitizeGeometryForWebGPU,
} from './webgpu';
```

## Integration with Main Module

The main `WebGPURendererModule.ts` uses these sub-modules through composition:

```typescript
class WebGPURendererModule {
  private shadowManager = new WebGPUShadowManager();
  private edgeManager = new WebGPUEdgeManager();
  private outlineManager = new WebGPUOutlineManager();
  private colorPicker = new WebGPUColorPicker();
  private elementSelector = new WebGPUElementSelector();
  private statsOverlay = new WebGPUStatsOverlay();
  private optimizations = new WebGPUOptimizations();
  private lodManager = new WebGPULODManager();
  private fogManager = new WebGPUFog();
  private materialFactory = new WebGPUMaterialFactory();
  
  // Delegate to sub-modules...
  public setShadowsEnabled(enabled: boolean): void {
    this.shadowManager.setShadowsEnabled(enabled);
  }
}
```

## WebGPU-Specific Considerations

1. **Shadow Map Resolution Changes**: Never dispose shadow maps directly. Instead, recreate the entire DirectionalLight. The `WebGPUShadowManager.setShadowMapResolution()` handles this safely.

2. **Normals Format**: WebGPU requires vertex buffer stride to be a multiple of 4 bytes. Use `convertNormalsToFloat32()` to convert Int16 normals to Float32.

3. **Material Disposal**: Don't dispose materials while the renderer is active. Let garbage collection handle cleanup.

4. **Geometry Sanitization**: Use `sanitizeGeometryForWebGPU()` to ensure geometry attributes are in WebGPU-compatible format.

## Future Improvements

1. **Full Composition**: Migrate remaining proxy scene building logic to a dedicated `WebGPUProxySceneBuilder` class.

2. **Event System**: Add an event emitter for better communication between modules.

3. **Configuration Object**: Consolidate all settings into a single configuration object.

4. **Testing**: Add unit tests for each module.
