# 🚀 Quick Start Guide

Welcome to your IFC Viewer! Follow these simple steps to get started.

## Prerequisites
- Node.js (version 18 or higher)
- npm (comes with Node.js)

## Installation Steps

### 1. Install Dependencies
Open your terminal in this project directory and run:

```bash
npm install
```

This will download all required packages (~50-100MB).

### 2. Start Development Server

```bash
npm run dev
```

The application will automatically open in your browser at `http://localhost:3000`

### 3. Load an IFC Model

**Option A: Load Sample Model**
- Click the **Load** button (folder icon) in the bottom toolbar
- Select "Load Sample" from the submenu
- Wait for the model to convert and load (takes a few seconds)

**Option B: Load Your Own File**
- Click the **Load** button (folder icon) in the bottom toolbar
- Select "Upload Model" from the submenu
- Choose an `.ifc` or `.frag` file from your computer
- Watch the loading status indicator

## 🎮 Using the Viewer

### Modern Bottom Toolbar

The application features a **floating toolbar** at the bottom with professional icons:

**Main Buttons**:
- 📂 **Load**: Upload IFC/Fragments files or load sample models (has submenu)
- 💾 **Export**: Save current model as Fragments format
- 👁️ **View**: Camera and visibility controls (has submenu)
  - Reset view, zoom to fit
  - Toggle IfcSpace visibility
- ✂️ **Clipper**: Sectioning tool (has submenu)
  - Section X/Y/Z (preset planes following AEC conventions)
  - Flip Side (show opposite side of section)
  - Clear All sections
- ℹ️ **Info**: Model information and statistics (has submenu)
- 🗑️ **Clear**: Remove all loaded models
- ⚙️ **Settings**: Scene customization (background, lighting)

**Model Count Badge**:
- Blue badge on the Load button shows total loaded models
- **Hover** over the badge to see a detailed tooltip with:
  - Model name
  - Model UUID
  - Mesh count for each model

### Navigation Controls

**Mouse**:
- **Rotate**: Click and drag with left mouse button
- **Pan**: Click and drag with right mouse button  
- **Zoom**: Use mouse wheel
- **Select**: Single-click on any element to view properties

**View Cube** (Top-Right Corner):
- Click any face to align camera to that view
- Automatic smooth transitions
- Perfect for switching between plan/elevation views

### Properties Panel (Left Side)
- **IFC Tree View**: Hierarchical view of building structure
  - Click to expand/collapse levels
  - Single-click elements to select them
- **Properties Tab**: View selected element attributes
- **Minimize**: Click minus icon to collapse panel
- **Expand**: Click tab when collapsed to restore

### Sectioning Tool (Clipper)
Perfect for analyzing building interiors:

1. **Enable**: Click scissors icon ✂️ in toolbar
2. **Choose Method**:
   - **Section X**: Side view cut (perpendicular to X axis)
   - **Section Y**: Horizontal floor plan cut (top view)
   - **Section Z**: Vertical elevation cut (front view)
   - **Custom**: Double-click on model to create plane at that point
3. **Flip Side**: Click to see opposite side of section cut
4. **Clear All**: Remove all section planes
5. **Disable**: Click scissors icon again to turn off

**Sectioning Tips**:
- Preset sections auto-replace previous ones
- Flip is stable even when moving mouse
- Delete key removes planes when clipper is enabled

### Scene Settings (Settings Button)
Adjust the appearance using the settings menu:
- **Background Color**: Click the color picker
- **Directional Light**: Use slider to adjust main light intensity
- **Ambient Light**: Use slider to adjust ambient illumination

### Model Actions
- **💾 Export**: Click Export button in toolbar to save as Fragments
- **🗑️ Clear**: Click Clear button in toolbar to remove all models

### Automatic Model Alignment
Models automatically align to their site coordinates when loaded - no manual alignment needed! This ensures that multi-discipline models (Architectural, Structural, MEP) align correctly.

### Performance Stats
The top-left corner shows real-time performance:
- Click to cycle through FPS / Frame Time / Memory

## 📱 Mobile/Tablet
- Bottom toolbar is fully responsive
- Tap buttons to access menus
- Submenus expand upward for easy access
- Use one finger to rotate
- Use two fingers to pan
- Pinch to zoom

## 🛠️ Building for Production

When ready to deploy:

```bash
npm run build
```

This creates optimized files in the `dist/` directory.

To preview the production build:

```bash
npm run preview
```

## 📚 Need Help?

- Check `README.md` for detailed documentation
- See `DEV_PROGRESS.md` for technical details
- Visit [OBC Documentation](https://docs.thatopen.com/)

## Common Issues

**Problem: "Cannot find module" errors**
- Solution: Run `npm install` again

**Problem: Blank screen**
- Solution: Check browser console (F12) for errors
- Ensure you're using a modern browser (Chrome, Firefox, Edge, Safari)

**Problem: Slow loading**
- Solution: Try loading a smaller IFC file first
- Consider using pre-converted `.frag` files

## Sample IFC Files

You can find free sample IFC files at:
- [IFC OpenShell](https://github.com/Autodesk/revit-ifc/tree/master/Sample%20Files)
- [BIMData Examples](https://github.com/bimdata/documentation/tree/master/examples)
- Built-in sample: Automatically loads when clicking "Load Sample IFC"

---

**Happy Modeling! 🏗️**
