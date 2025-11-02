# Floor Plan Controls Fix - Updated

## Problem

The floor plan view was displaying correctly but pan/zoom interactions were not working.

## Root Cause (Updated)

The issue was **CameraControls interference**. The CameraControls library doesn't work properly in orthographic mode and was preventing manual mouse event handlers from working correctly. Additionally:

1. Event listeners weren't properly disconnected from CameraControls
2. Manual pan calculations were too complex
3. CameraControls was still active and consuming mouse events

## Solutions Applied

### 1. Disabled CameraControls in Floor Plan Mode

When entering floor plan mode, we now **explicitly disable CameraControls** to prevent it from interfering:

```typescript
if (camera.controls) {
  camera.controls.enabled = false;
  console.log('🖱️ CameraControls disabled to prevent interference');
}
```

### 2. Simplified Pan Logic

Replaced complex vector calculations with direct position adjustment:

```typescript
// Simple and effective pan:
camera.threeOrtho.position.x -= deltaX * panSpeed;
camera.threeOrtho.position.z -= deltaY * panSpeed;
camera.threeOrtho.updateMatrix();
camera.threeOrtho.updateMatrixWorld(true);
```

### 3. Enhanced Event Handling

- Added `preventDefault()` and `stopPropagation()` to prevent event bubbling
- Added document-level mouse tracking so panning works even when dragging outside canvas
- Used capture phase (`{ capture: true }`) to intercept events before other handlers

```typescript
canvas.addEventListener('mousedown', onMouseDown, { capture: true, passive: false });
// ... also listen to document for extended pan tracking
document.addEventListener('mousemove', onDocumentMouseMove, { capture: true, passive: false });
```

### 4. Fixed Zoom with Inverted Scroll

```typescript
const zoomDirection = e.deltaY > 0 ? -1 : 1; // Invert for natural scroll
const zoomFactor = 1 + (zoomDirection * zoomSpeed);
camera.threeOrtho.zoom *= zoomFactor;
camera.threeOrtho.updateProjectionMatrix();
camera.threeOrtho.updateMatrixWorld(true);
```

### 5. Proper Cleanup

When exiting floor plan mode, CameraControls is re-enabled:

```typescript
if (camera && camera.controls) {
  camera.controls.enabled = true;
  console.log('🖱️ CameraControls re-enabled');
}
```

## File Modified

- `src/modules/FloorPlanModule.ts`
  - `enableManualControls()` method - Complete rewrite for simplicity and reliability
  - `disableManualControls()` method - Updated for proper cleanup

## Testing Instructions

1. Load an IFC model with multiple storeys
2. Open a floor plan view from the toolbar menu
3. **Test pan**: Click and drag with left mouse button anywhere on the canvas
4. **Test zoom**: Use mouse wheel to zoom in/out
5. **Test extended pan**: Drag outside the canvas boundary and the pan should continue
6. Close the plan view and verify 3D navigation works normally

## Expected Behavior

✅ Smooth panning with left-click drag  
✅ Zoom in/out with mouse wheel  
✅ Pan continues even when dragging outside viewport  
✅ Responsive and immediate feedback  
✅ No interference from CameraControls  
✅ 3D controls work normally after closing floor plan
