# Model Alignment Guide

## Problem: Misaligned IFC Files

When loading multiple IFC files (e.g., Architectural and Structural), they often appear:
- In different positions
- Below the ground (grid)
- Not centered in the scene
- At different coordinate systems

## Solutions

The viewer provides two approaches to alignment:

1. **Geometric Alignment** - Simple transformations based on bounding boxes
2. **IFC Site Alignment** - BIM-compliant alignment using IfcSite entities (recommended for proper BIM workflows)

---

## Geometric Alignment Tools

### Available Tools

#### 1. 📏 Center All Models
**Purpose**: Centers all loaded models as a group at the origin (0, 0, 0)

**When to use**:
- Models are far from the center
- Want to work around the origin point
- Models were exported with different coordinate systems

**How it works**: Calculates the bounding box of all models and moves them so the center of the group is at the origin.

#### 2. ⬆️ Move to Ground
**Purpose**: Moves all models up so they sit on the grid (y = 0)

**When to use**:
- Models appear below the ground/grid
- Structural model is underground
- Want all models to start at ground level

**How it works**: Finds the lowest point of all models and moves everything up so that point touches y = 0.

#### 3. 🎯 Fit Camera
**Purpose**: Adjusts the camera to view all loaded models

**When to use**:
- After loading new models
- Models are too far away or too close
- Lost sight of the models

**How it works**: Calculates the bounding box of all models and positions the camera at an optimal distance and angle.

#### 4. ℹ️ Model Info
**Purpose**: Shows detailed information about each loaded model

**Displays**:
- Model position (x, y, z)
- Model size (width × height × depth)
- Bounding box min/max coordinates

**When to use**:
- Checking model positions
- Debugging alignment issues
- Understanding model dimensions

---

## Typical Workflow for Misaligned Models

### Scenario: Loading Architectural + Structural IFC files

**Step 1: Load First Model**
```
1. Click "Choose File"
2. Select Architectural.ifc
3. Wait for conversion
4. Model appears in viewer
```

**Step 2: Load Second Model**
```
1. Click "Choose File" again
2. Select Structural.ifc
3. Wait for conversion
4. Second model appears (possibly misaligned)
```

**Step 3: Check Model Info**
```
1. Click "ℹ️ Model Info"
2. Review positions and sizes
3. Note if one model is below ground (negative Y)
```

**Step 4: Fix Alignment**
```
Option A: If models are below ground:
1. Click "⬆️ Move to Ground"
2. Both models move up to y = 0

Option B: If models are scattered:
1. Click "📏 Center All Models"
2. Models group together at origin

Option C: Both issues:
1. Click "📏 Center All Models" first
2. Then click "⬆️ Move to Ground"
3. Finally click "🎯 Fit Camera"
```

---

## Advanced: Programmatic Control

For advanced users, you can use the console:

### Access the viewer
```javascript
const viewer = window.viewer;
const transform = viewer.getModelTransform();
```

### Get model information
```javascript
const info = transform.getModelsInfo();
console.log(info);
```

### Center specific model
```javascript
// Get all loaded models
const models = viewer.getIFCLoader().getLoadedModels();

// Center first model
for (const [id] of models) {
  transform.centerModel(id);
  break;
}
```

### Move model by specific amount
```javascript
import * as THREE from 'three';

// Move model up by 5 units
const modelId = 'your-model-id';
transform.adjustModelHeight(modelId, 5);

// Or move in any direction
transform.moveModel(modelId, new THREE.Vector3(10, 0, -5));
```

### Align one model to another
```javascript
const models = Array.from(viewer.getIFCLoader().getLoadedModels().keys());
const sourceId = models[0];
const targetId = models[1];

// Align first model to second model
transform.alignModelToModel(sourceId, targetId);
```

---

## Tips & Best Practices

### 1. Load Order
- Load the main/reference model first
- Then load additional models
- Use alignment tools after all models are loaded

### 2. Save Aligned Models
After aligning models:
1. Click "💾 Export as Fragments"
2. Save each model
3. Next time, load the Fragments files instead of IFC
4. They'll remember their positions!

### 3. Multiple Model Sets
If working with many files:
- Load one set (e.g., Architecture)
- Align them
- Export as Fragments
- Clear all
- Load next set (e.g., MEP)
- Align them
- Export

### 4. Common Issues

**Problem**: Models still don't align after centering
**Solution**: Check the model info - they might need individual adjustment. Use the console to move specific models.

**Problem**: Structural model much smaller than architectural
**Solution**: This might be a scale issue in the original IFC export. Check the source files.

**Problem**: Models are rotated differently
**Solution**: The current tools handle position only. Rotation would need custom code or re-export from source software with consistent orientation.

---

## IFC Site Alignment (BIM-Compliant) ⭐

### What is IFC Site Alignment?

In BIM workflows, each IFC file contains an **IfcSite** entity that stores the project's coordinate system:
- Object Placement (Local coordinates)
- Reference Latitude/Longitude (Geographic coordinates)
- Reference Elevation (Vertical datum)

**Why use this?** When different disciplines (Architectural, Structural, MEP) export their models from the same BIM project, they should all share the same IfcSite coordinates. Using these coordinates ensures proper alignment according to the original project setup.

### Available IFC Site Tools

#### 1. 🌍 Align by IfcSite
**Purpose**: Automatically aligns all models using their IfcSite entity coordinates

**When to use**:
- Loading multiple files from the same BIM project
- Models were exported with proper IfcSite data
- Need precise, BIM-compliant alignment
- Geometric alignment doesn't work correctly

**How it works**:
1. Extracts IfcSite entity from each model
2. Reads ObjectPlacement → RelativePlacement → Location → Coordinates
3. Uses the first model's site as reference
4. Aligns all other models to match that reference position

**Best for**: Architectural + Structural + MEP models from same project

#### 2. ✅ Check Site Alignment
**Purpose**: Verifies if all loaded models have matching IfcSite coordinates

**When to use**:
- Before aligning to see if models already match
- After alignment to verify success
- Troubleshooting alignment issues

**Shows**:
- How many models have IfcSite entities
- Whether coordinates match across models
- Detailed comparison data

#### 3. 📋 Show Site Info
**Purpose**: Displays IfcSite information for all loaded models

**When to use**:
- Inspecting model metadata
- Verifying IfcSite data exists
- Debugging coordinate system issues

**Displays**:
- Model ID
- Site Name
- Position coordinates (X, Y, Z)
- Reference Elevation

---

## Which Alignment Method to Use?

### Use **IFC Site Alignment** when:
- ✅ Models are from the same BIM project
- ✅ Models have IfcSite entities with proper coordinates
- ✅ Need precise, BIM-compliant alignment
- ✅ Working with multiple disciplines (Arch + Struct + MEP)

### Use **Geometric Alignment** when:
- Models don't have IfcSite data
- Models are from different projects/sources
- Need quick visual alignment only
- IFC Site alignment doesn't work

### Typical Workflow:

```
1. Load all models (Architectural, Structural, etc.)
2. Click "📋 Show Site Info" - Check if IfcSite exists
3. Click "✅ Check Site Alignment" - See if they already match
4. Click "🌍 Align by IfcSite" - Auto-align using BIM data
5. Click "🎯 Fit Camera" - View the result
```

If IfcSite alignment fails, fall back to geometric tools:
```
1. Click "📏 Center All Models"
2. Click "⬆️ Move to Ground"
3. Click "🎯 Fit Camera"
```

---

## Keyboard Shortcuts (Future Enhancement)

Could be added:
- `C` - Center models
- `G` - Move to ground
- `F` - Fit camera
- `I` - Show info
- `S` - Align by IfcSite

---

## Troubleshooting

### Models disappear after alignment
- Use "🎯 Fit Camera" to find them
- Check "ℹ️ Model Info" for positions
- Use "Clear All Models" and reload if needed

### Alignment is still wrong
- Try IFC Site alignment first if available
- Try sequence: Center → Move to Ground → Fit Camera
- Check console for any errors
- Verify IFC files have correct coordinate systems at export

### "No IfcSite found" error
- Some IFC files don't include IfcSite entities
- Use geometric alignment tools instead
- Contact the person who exported the model

### IfcSite alignment doesn't help
- Models might have incorrect IfcSite coordinates at export
- Use geometric alignment as fallback
- Check if models are actually from the same project

### Performance issues with many models
- Use Fragments format instead of IFC
- Clear unused models
- Monitor performance stats (top-left corner)

---

## Summary

The viewer provides comprehensive alignment tools:

**Geometric Alignment**: Simple, visual corrections
- ✅ Fix models below ground
- ✅ Center scattered models
- ✅ Adjust camera view
- ✅ Inspect model positions

**IFC Site Alignment**: BIM-compliant coordination
- ✅ Use IfcSite entity coordinates
- ✅ Proper multi-discipline alignment
- ✅ Maintain project coordinate system
- ✅ Verify alignment accuracy

**Recommended approach**: Try IFC Site alignment first for BIM projects, fall back to geometric alignment if needed!
