# Floor Plan Testing Guide

## How the Refactored Implementation Works

The new implementation uses OBC's built-in **Plan navigation mode** which automatically handles pan and zoom through CameraControls.

### Flow Diagram

```
1. User clicks "View Floor Plan" for a storey
   ↓
2. createFloorPlanView() creates a View with clipping planes
   ↓
3. openView() positions the camera and activates the view
   ↓
4. enableManualControls() calls camera.set('Plan')
   ↓
5. Plan mode is now active - CameraControls handles interaction
   ↓
6. User can pan (left drag) and zoom (mouse wheel) naturally
   ↓
7. User closes view → disableManualControls() calls camera.set('Orbit')
   ↓
8. Back to 3D navigation mode
```

## Testing Checklist

### Test 1: Floor Plan View Creation
- [ ] Open application and load an IFC model with storeys
- [ ] Click the floor plan button
- [ ] Verify that a modal appears with storey list
- [ ] Expected: "First Floor", "Second Floor", etc. should be listed

### Test 2: Floor Plan Opening
- [ ] Click "View" on any storey (e.g., "First Floor")
- [ ] Expected: Floor plan view should open
- [ ] Expected: Camera should be positioned above the storey looking down
- [ ] Expected: View should show a 2D floor plan representation

### Test 3: Pan Functionality
- [ ] With floor plan view open, hold LEFT MOUSE BUTTON and drag
- [ ] Expected: Floor plan should pan smoothly in the direction you drag
- [ ] Expected: Should work in all directions (up, down, left, right, diagonal)
- [ ] Expected: Panning outside canvas boundaries should still work (document-level tracking)
- [ ] Check browser console: Should see minimal logging (only mode activation logs)

### Test 4: Zoom Functionality
- [ ] With floor plan view open, use MOUSE WHEEL to scroll
- [ ] Expected: Scrolling up zooms out (more of floor visible)
- [ ] Expected: Scrolling down zooms in (closer view)
- [ ] Expected: Zoom should be smooth and responsive
- [ ] Expected: Zoom should be clamped between reasonable min/max

### Test 5: Return to 3D
- [ ] With floor plan open, click "Close Floor Plan" or press ESC (if implemented)
- [ ] Expected: Floor plan should close
- [ ] Expected: Camera should return to 3D Orbit mode
- [ ] Expected: Should be able to orbit, pan, zoom normally in 3D

### Test 6: Multiple Storeys
- [ ] Open floor plan for "First Floor"
- [ ] Test pan/zoom functionality
- [ ] Close and open floor plan for "Second Floor"
- [ ] Expected: Should smoothly switch between storeys
- [ ] Expected: Each storey should have correct elevation/position

### Test 7: Performance
- [ ] Monitor browser performance (F12 → Performance tab)
- [ ] Pan and zoom continuously
- [ ] Expected: Smooth 60 FPS or better
- [ ] Expected: Minimal memory leak
- [ ] Check CPU usage - should be reasonable

### Test 8: Browser Console
- [ ] Open browser console (F12)
- [ ] Perform pan and zoom operations
- [ ] Expected: Minimal console logging
- [ ] Expected: No error messages
- [ ] Expected: Logs should only show mode changes, not every interaction

## Expected Console Logs When Activating Plan Mode

```
📍 Switching camera to Plan navigation mode
✅ Plan mode activated - pan/zoom controls are now active
```

## Expected Console Logs When Returning to Orbit Mode

```
📍 Switching camera back to Orbit navigation mode
✅ Orbit mode activated - 3D navigation restored
```

## Troubleshooting

### Issue: Pan/Zoom not working
- [ ] Check that floor plan view actually opened (look for clipping in canvas)
- [ ] Check browser console for errors
- [ ] Verify camera.set('Plan') was called (check logs)
- [ ] Try refreshing page and testing again

### Issue: 3D navigation broken after floor plan
- [ ] Make sure closeView() was called properly
- [ ] Check that camera.set('Orbit') executed (check logs)
- [ ] Try clicking somewhere else in the 3D view to regain focus
- [ ] Refresh page if needed

### Issue: Floor plan looks wrong
- [ ] Verify the camera was positioned correctly above the storey
- [ ] Check if the storey elevation is correct
- [ ] Try a different storey to see if it's storey-specific
- [ ] Check IFC model data for issues

## Key Differences from Previous Implementation

### Before (Manual Controls)
- 200+ lines of mouse event handling
- Manual camera position updates
- Forced renderer.render() calls
- Complex mouseButton configuration
- Multiple setTimeout attempts
- Constant camera sync operations

### After (Plan Mode)
- ~20 lines of code (camera.set('Plan'))
- CameraControls handles everything
- Framework manages rendering
- Works with native CameraControls setup
- Simple, clean, no workarounds
- Just tell the framework what mode to use

## Code Locations

- **Main Implementation**: `/src/modules/FloorPlanModule.ts`
- **Method to Test**: `openView()` - opens floor plan
- **Method to Test**: `closeView()` - closes floor plan
- **Core Methods**: 
  - `enableManualControls()` - calls `camera.set('Plan')`
  - `disableManualControls()` - calls `camera.set('Orbit')`

## References

All implementation follows OBC official documentation:
- Views: `/OBC/engine_docs/docs/api/@thatopen/components/classes/Views.md`
- OrthoPerspectiveCamera: `/OBC/engine_docs/docs/api/@thatopen/components/classes/OrthoPerspectiveCamera.md`
- PlanMode: `/OBC/engine_docs/docs/api/@thatopen/components/classes/PlanMode.md`
- Tutorials: `/OBC/engine_docs/docs/Tutorials/Components/Core/`
