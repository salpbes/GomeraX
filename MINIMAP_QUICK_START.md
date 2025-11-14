# Minimap Feature - Quick Start

## What is it?

A small map overlay that shows your position and viewing direction when walking around in first-person mode.

## How to use it

### Step 1: Load a Model
- Click the folder icon and load an IFC file

### Step 2: Enter Walking Mode  
- Click the walking icon (🚶) in the toolbar
- The walking mode submenu opens

### Step 3: Enable Minimap
- Click "Show Minimap" button in the submenu
- A minimap appears in the bottom-right corner

### Step 4: Navigate
- Use WASD or arrow keys to move
- Move mouse to look around (click to lock)
- Watch the minimap to see where you are

### Visual Guide

```
┌─────────────────────────────────────┐
│                                     │
│         Main 3D View                │
│                                     │
│                                     │
│                                     │
│                                     │
│                     ┌──────────┐    │
│                     │ Minimap  │    │
│                     │    ▲     │    │  ← You are here
│                     │   ╱ ╲    │    │  ← Viewing direction
│                     │  ●═══╲   │    │  ← Your position
│                     │   Grid   │    │
│                     └──────────┘    │
└─────────────────────────────────────┘
```

## Minimap Elements

- **Building Geometry**: Actual walls, doors, and building elements from your current floor
- **Blue Circle (●)**: Your current position
- **Blue Cone (▲)**: Direction you're looking
- **Grid**: Background grid for spatial reference

## Customization (Console)

```javascript
// Get minimap
const minimap = window.viewer.getMinimap();

// Make it bigger
minimap.updateConfig({ width: 400, height: 400 });

// Move to top-left
minimap.setPosition('top-left');

// Zoom in more
minimap.setZoom(30);
```

## Troubleshooting

**Minimap not showing?**
- Make sure you loaded a model first
- Check that the model has building storeys
- Try: `window.viewer.getMinimap().enable()`

**Position not updating?**  
- Ensure walking mode is active (WASD enabled)
- Make sure you're actually moving

**Wrong floor shown?**
- Specify manually: `minimap.enable('Level 1')`

## Tips

- Minimap auto-detects which floor you're on
- It only appears when you toggle it on
- Hides automatically when you exit walking mode
- Very lightweight - no performance impact

---

For detailed information, see [MINIMAP_FEATURE_GUIDE.md](./MINIMAP_FEATURE_GUIDE.md)
