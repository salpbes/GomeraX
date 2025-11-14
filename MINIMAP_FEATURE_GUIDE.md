# Minimap Feature Guide

## Overview

The Minimap feature provides a real-time top-down map overlay during first-person walking mode. It displays the user's current position and viewing direction on a 2D floor plan, making navigation easier in complex building models.

## Features

- **Real-time Position Tracking**: Shows your current location as a blue circle on the minimap
- **Viewing Direction Indicator**: A cone shape indicates which direction you're looking
- **Auto-storey Detection**: Automatically detects which building storey you're on
- **Actual Floor Plan Geometry**: Displays the real building geometry from the current floor
- **Configurable Display**: Adjustable size, position, zoom level, and opacity
- **Smooth Integration**: Works seamlessly with the existing floor plan system

## How to Use

### Enabling the Minimap

1. **Enter Walking Mode**
   - Click the walking icon (🚶) in the toolbar
   - This activates first-person controls

2. **Toggle Minimap**
   - Click the walking icon again to open the walking mode submenu
   - Click "Show Minimap" button
   - The minimap will appear in the bottom-right corner by default

3. **Navigate**
   - Use WASD or arrow keys to move around
   - Move your mouse to look around (click to lock pointer)
   - Watch the minimap to see your position and viewing direction update in real-time

### Disabling the Minimap

- Click the minimap toggle button again to hide it
- The button label will change to "Hide Minimap" when active

## Minimap Configuration

The minimap can be customized programmatically through the console:

```javascript
// Get the minimap instance
const minimap = window.viewer.getMinimap();

// Change minimap size
minimap.updateConfig({
  width: 400,
  height: 400
});

// Change position
minimap.setPosition('top-left'); // or 'top-right', 'bottom-left', 'bottom-right'

// Adjust zoom level (lower = more zoomed in)
minimap.setZoom(30);

// Adjust opacity (0-1)
minimap.setOpacity(0.8);

// Complete configuration update
minimap.updateConfig({
  width: 350,
  height: 350,
  position: 'top-right',
  zoom: 40,
  opacity: 0.95
});
```

## Technical Architecture

### Module Structure

**MinimapModule** (`src/modules/MinimapModule.ts`)
- Creates a separate THREE.js scene for the minimap
- Uses orthographic camera for top-down view
- Renders to a separate canvas overlay
- Automatically syncs with main camera position

### Integration Points

1. **FloorPlanModule**: 
   - Used to detect available building storeys
   - Creates floor plan views for the minimap background

2. **FirstPersonControlsModule**: 
   - Minimap tracks the main camera position
   - Updates in sync with WASD movement

3. **UIManager**: 
   - Provides toggle button in walking mode submenu
   - Manages button state (show/hide)

### Visual Elements

The minimap displays:

- **Building Geometry**: Actual walls, doors, and other elements from the current floor
- **Grid Helper**: Background grid for spatial reference
- **User Marker**: Blue circle showing your position
- **View Cone**: Semi-transparent blue cone showing viewing direction

## Implementation Details

### Initialization Flow

```
IFCViewer.initialize()
  ├─> FloorPlanModule created
  ├─> MinimapModule created (depends on FloorPlanModule)
  │   ├─> Creates HTML container
  │   ├─> Sets up minimap scene
  │   ├─> Creates camera and renderer
  │   └─> Creates user marker and view cone
  └─> Passed to UIManager for toolbar integration
```

### Update Loop

When enabled, the minimap runs a continuous update loop:

1. **Get Main Camera Position**: Reads the main camera's world position
2. **Update Markers**: Moves the user marker to match camera XZ position
3. **Calculate Viewing Direction**: Gets camera's forward vector
4. **Rotate View Cone**: Aligns the cone with viewing direction
5. **Position Minimap Camera**: Follows the user marker
6. **Render**: Draws the updated scene to the minimap canvas

### Performance Considerations

- **Separate Renderer**: Uses its own WebGL renderer to avoid conflicts
- **Independent Update**: Only runs when minimap is visible
- **Optimized Geometry**: Only clones meshes within the current floor range (±4 meters)
- **Smart Filtering**: Excludes helpers, grids, and non-relevant objects
- **Optimized Size**: Default 300x300px canvas keeps memory usage low

## API Reference

### MinimapModule Methods

#### `initialize(): Promise<void>`
Initializes the minimap module, creates container and scene.

#### `enable(storeyName?: string): Promise<void>`
Shows the minimap. Auto-detects storey if not specified.

#### `disable(): void`
Hides the minimap and stops the update loop.

#### `toggle(storeyName?: string): Promise<void>`
Toggles minimap on/off.

#### `isActive(): boolean`
Returns whether the minimap is currently visible.

#### `setZoom(zoom: number): void`
Sets the orthographic camera size (affects zoom level).

#### `setOpacity(opacity: number): void`
Sets minimap container opacity (0-1).

#### `setPosition(position): void`
Sets corner position. Options: 'top-left', 'top-right', 'bottom-left', 'bottom-right'.

#### `updateConfig(config: Partial<MinimapConfig>): void`
Updates multiple configuration options at once.

#### `dispose(): void`
Cleanup method, removes all resources.

### MinimapConfig Interface

```typescript
interface MinimapConfig {
  width: number;        // Canvas width in pixels
  height: number;       // Canvas height in pixels
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  zoom: number;         // Orthographic camera size (30-100 recommended)
  opacity: number;      // Container opacity (0-1)
}
```

## Troubleshooting

### Minimap Not Showing

**Issue**: Minimap button doesn't show the map

**Solutions**:
1. Ensure you have loaded an IFC model first
2. Make sure the model has building storeys defined
3. Check browser console for error messages
4. Try manually enabling: `window.viewer.getMinimap().enable()`

### Position Not Updating

**Issue**: User marker doesn't move

**Solutions**:
1. Ensure first-person controls are enabled (WASD mode)
2. Check that you're actually moving in the scene
3. Verify minimap is active: `window.viewer.getMinimap().isActive()`

### Wrong Storey Displayed

**Issue**: Minimap shows wrong floor

**Solutions**:
1. Manually specify storey: `minimap.enable('Level 1')`
2. Move camera to correct height for auto-detection
3. Check available storeys: `await floorPlan.getAllStoreys()`

## Future Enhancements

Possible improvements for future versions:

- [ ] Multi-storey minimap with floor switcher
- [ ] Show other users/entities on minimap
- [ ] Display wall geometry from floor plan
- [ ] Click-to-teleport functionality
- [ ] Compass rose for orientation
- [ ] North indicator
- [ ] Scale indicator
- [ ] Custom markers support

## Examples

### Basic Usage

```javascript
// Enable minimap for current storey
const minimap = window.viewer.getMinimap();
await minimap.enable();
```

### Specify Storey

```javascript
// Enable minimap for specific floor
const minimap = window.viewer.getMinimap();
await minimap.enable('Level 2');
```

### Large Minimap in Top-Right

```javascript
const minimap = window.viewer.getMinimap();
minimap.updateConfig({
  width: 500,
  height: 500,
  position: 'top-right',
  zoom: 60,
  opacity: 0.9
});
await minimap.enable();
```

### Compact Transparent Minimap

```javascript
const minimap = window.viewer.getMinimap();
minimap.updateConfig({
  width: 200,
  height: 200,
  position: 'bottom-left',
  zoom: 25,
  opacity: 0.6
});
await minimap.enable();
```

## Related Documentation

- [First Person Controls Guide](./GETTING_STARTED.md)
- [Floor Plan Module](./MODEL_ALIGNMENT_GUIDE.md)
- [UI Manager Reference](./ARCHITECTURE.md)

## Contributing

When working with the minimap feature:

1. Keep the update loop lightweight
2. Dispose of THREE.js resources properly
3. Test with models at different scales
4. Ensure compatibility with other modules
5. Document any new configuration options

---

**Last Updated**: November 9, 2025  
**Module**: MinimapModule  
**Version**: 1.0.0
