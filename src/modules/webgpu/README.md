# WebGPU Renderer Module - Modular Architecture

This directory contains the modularized WebGPU renderer components. The code has been organized into focused, single-responsibility modules for better maintainability and testability.

## Module Structure

```
webgpu/
├── index.ts                    # Re-exports all modules
├── WebGPUTypes.ts              # Shared types, interfaces, and constants
├── WebGPUShadowManager.ts      # Shadow light and ground plane management
├── WebGPUEdgeManager.ts        # Edge/wireframe rendering
├── WebGPUStatsOverlay.ts       # Performance stats UI overlay
├── WebGPUOptimizations.ts      # Frustum culling, geometry merging
├── WebGPUMaterialFactory.ts    # Material creation and caching
├── WebGPUGeometryUtils.ts      # Geometry conversion utilities
├── WebGPUSectionManager.ts     # Section planes (clipping) functionality
└── README.md                   # This file
```

## Module Descriptions

### WebGPUTypes.ts

Shared type definitions and constants used across all WebGPU modules:

- `RendererMode`, `WebGPUStatus`, `PerformancePreset`
- `SceneStats`, `PerformanceStats` interfaces
- `ShadowConfig`, `EdgeConfig`, `GroundPlaneConfig`
- `SectionConfig`, `SectionPlaneData` - Section plane configuration
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

### WebGPUSectionManager.ts

Section planes (clipping) functionality for WebGPU mode:

- Create section planes along X, Y, Z axes
- Double-click on surfaces to create planes at that point
- Interactive 3D flip buttons to reverse clipping direction
- Drag plane helpers to reposition planes
- Delete key to remove all planes
- Visibility and enabled state toggling
- Serialization/deserialization of plane data

**Key Features:**

- Visual plane helpers with configurable size and color
- Real-time flip button positioning that scales with camera distance
- Mouse hover effects on flip buttons
- Raycasting for plane creation at surface hit points

**Usage:**

```typescript
const sectionManager = new WebGPUSectionManager();
sectionManager.initialize(scene, camera, container, (planes) => {
  // Callback when planes change
  renderer.clippingPlanes = planes;
});

// Create preset planes
sectionManager.createXAxisPlane(center);
sectionManager.createYAxisPlane(center);
sectionManager.createZAxisPlane(center);

// Flip, toggle, delete
sectionManager.flipAllPlanes();
sectionManager.toggleAllPlanesVisibility();
sectionManager.deleteAllPlanes();
```

## Usage

Import from the main index:

```typescript
import {
  WebGPUShadowManager,
  WebGPUEdgeManager,
  WebGPUStatsOverlay,
  WebGPUOptimizations,
  WebGPUMaterialFactory,
  WebGPUSectionManager,
  CATEGORY_COLORS,
  formatNumber,
  sanitizeGeometryForWebGPU,
} from './webgpu';
```

## Integration with Main Module

The main `WebGPURendererModule.ts` can use these sub-modules through composition:

```typescript
class WebGPURendererModule {
  private shadowManager = new WebGPUShadowManager();
  private edgeManager = new WebGPUEdgeManager();
  private statsOverlay = new WebGPUStatsOverlay();
  private optimizations = new WebGPUOptimizations();
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
