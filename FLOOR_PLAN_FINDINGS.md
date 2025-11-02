# Floor Plan View Findings from OBC Documentation

## Key Discovery: Use Plan Navigation Mode

The OBC library has a built-in **Plan navigation mode** designed specifically for floor plan interaction! This is much simpler than implementing manual mouse controls.

### How It Works

1. **Views System**: Creates 2D sections through the 3D scene using clipping planes
2. **Plan Mode**: A navigation mode for the OrthoPerspectiveCamera that provides 2D floor plan navigation
3. **Integration**: Views automatically work with Plan mode for natural floor plan interaction

### OBC Components for Floor Plans

| Component | Purpose |
|-----------|---------|
| **Views** | Creates and manages 2D sections (plans, elevations, sections) |
| **OrthoPerspectiveCamera** | Camera with multiple projections and navigation modes |
| **PlanMode** | Navigation mode for 2D floor plan interaction (pan/zoom) |
| **CameraControls** | Built-in camera controls library (yomotsu/camera-controls) |

### How to Implement Floor Plans Correctly

```typescript
// 1. Create floor plan views from IFC storeys
await views.createFromIfcStoreys({ /* config */ });

// 2. When user opens a floor plan view
views.open(viewId);

// 3. Switch to Plan navigation mode (NOT manual controls!)
await camera.set("Plan");

// 4. Switch to Orthographic projection if needed
camera.projection.current = "Orthographic";

// 5. Pan/Zoom works automatically through CameraControls in Plan mode
```

### Why Our Manual Implementation Doesn't Work

1. **Views use clipping planes**: They render the 3D scene with clipping planes, not a separate 2D canvas
2. **CameraControls manages interaction**: The library already handles pan/zoom in Plan mode
3. **Rendering pipeline**: We're trying to manually render when the framework does it automatically

### Current Issues in Our Code

1. ❌ We disabled CameraControls (it works in Plan mode!)
2. ❌ We're implementing manual mouse controls (Plan mode does this)
3. ❌ We're not using the Plan navigation mode
4. ❌ We're trying to force rendering (unnecessary in Plan mode)

### Correct Approach

Instead of:
- Manual mouse event listeners
- Disabling CameraControls
- Forcing renderer.render() calls

We should:
- Use `camera.set("Plan")` to enable Plan navigation
- Let CameraControls handle pan/zoom
- The Views system will handle the rendering through clipping planes
- Use `camera.projection.current = "Orthographic"` for 2D view

### Key OBC Documentation Files

- `/OBC/engine_docs/docs/Tutorials/Components/Core/Views.mdx` - Views tutorial
- `/OBC/engine_docs/docs/Tutorials/Components/Core/OrthoPerspectiveCamera.mdx` - Camera tutorial
- `/OBC/engine_docs/docs/api/@thatopen/components/classes/Views.md` - Views API
- `/OBC/engine_docs/docs/api/@thatopen/components/classes/OrthoPerspectiveCamera.md` - Camera API
- `/OBC/engine_docs/docs/api/@thatopen/components/classes/PlanMode.md` - Plan mode API

### Next Steps

1. Remove all manual mouse control code
2. Remove renderer.render() forcing code
3. Use `camera.set("Plan")` when opening floor plan view
4. Use `camera.set("Orbit")` when closing floor plan view
5. Let CameraControls handle all interaction automatically
