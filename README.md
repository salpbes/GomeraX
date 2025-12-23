# GOMERA - Professional IFC Viewer

**GOMERA** is a professional, modular IFC file viewer built with [Open BIM Components (OBC)](https://docs.thatopen.com/).

## 🎯 Features

- 📂 **IFC File Loading**: Load and view Industry Foundation Classes (IFC) files
- ⚡ **Fragments Support**: Fast loading with pre-converted Fragments format
- 🎨 **Revit-like Rendering**: Professional cast shadows with ambient occlusion
- 📊 **Performance Monitoring**: Real-time FPS, memory usage, and render time stats
- 💾 **Export Functionality**: Convert and download IFC files as Fragments
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🏗️ **Modular Architecture**: Clean, maintainable code structure
- 🌐 **Modern UI**: Bottom floating toolbar with professional Font Awesome icons
- 🔄 **Automatic Alignment**: Models align to site coordinates automatically
- 🧠 **Smart Coordinate System**: Automatic far-origin model detection and handling
- ⚠️ **Visual Warnings**: Professional alerts for far-origin models (>100km from origin)
- 🛡️ **Alignment Protection**: Prevents mixing incompatible coordinate systems
- 📋 **Model Information**: Hover badge displays model names and UUIDs
- 🎨 **Professional Design**: Purple gradient buttons with glassmorphic styling
- 🎭 **Expandable Menus**: Organized actions in Load, View, Info, and Clipper groups
- 🧭 **ViewCube Navigation**: Interactive 3D cube for quick camera orientation
- ✂️ **Advanced Sectioning**: Cut through models with preset planes or custom cuts
- 🔄 **Section Flip**: View both sides of any section plane
- 🗂️ **Properties Panel**: IFC tree view and element property inspection
- 👁️ **Space Visibility**: Toggle IfcSpace elements on/off
- 🚶 **First-Person Walk Mode**: FPS-style navigation with collision detection
- 📏 **Measurement Tools**: Length, Area, and Volume measurements with perpendicular guides
- 🎯 **Model Alignment Tool**: Drag-and-drop panel for precise multi-model positioning with AEC-standard coordinates
- 🏢 **Floor Plan Views**: Interactive 2D floor plan views with pan/zoom navigation
- 📊 **Property Table**: Excel-like interactive table for bulk property inspection and filtering
- 🎮 **Experimental WebGPU Mode**: Next-generation rendering for massive models with:
  - **Instant Highlighting**: Zero-latency selection using GPU-shared buffers
  - **LOD (Level of Detail)**: Automatic geometry simplification for distant objects
  - **Atmospheric Fog**: Linear and exponential fog for enhanced depth perception
  - **Professional Outlines**: Clean selection highlighting using multi-pass rendering
  - **GPU Color Picking**: Instant element identification in merged geometries
  - **Chunked Scene Rebuilding**: Smooth isolation/un-isolation without UI freezing
  - **Adaptive Quality**: Automatic performance scaling based on hardware
  - **Shadow Optimizations**: High-performance shadows with "ghost mode" support
  - **Frustum Culling**: Optimized edge rendering for complex geometries
  - **Performance Stats Overlay**: Detailed hardware, memory, and rendering metrics

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher recommended)
- npm, yarn, or pnpm

### Installation

1. Install dependencies:

```bash
npm install
```

1. Start the development server:

```bash
npm run dev
```

1. Open your browser and navigate to `http://localhost:3000`

## 👨‍💻 Testing Guide (Layman's Style)

If you are not a developer and just want to test this viewer on your machine, follow these simple steps:

1. **Install Node.js**: Go to [nodejs.org](https://nodejs.org/) and download the **LTS** version (the one on the left). Install it like any other application.
2. **Download the Code**: Click the green **Code** button at the top of this GitHub page and select **Download ZIP**. Extract the folder to your Desktop or Documents.
3. **Open your Terminal**:
    - **Windows**: Press the `Windows` key, type `cmd`, and press Enter.
    - **Mac**: Press `Command + Space`, type `Terminal`, and press Enter.
4. **Navigate to the Folder**: Type `cd` (with a space at the end), then drag the folder you extracted into the terminal window. It will automatically fill in the path. Press Enter.
5. **Install the Viewer**: Type `npm install` and press Enter. Wait a minute for it to download the necessary components.
6. **Run the Viewer**: Type `npm run dev` and press Enter.
7. **Open your Browser**: You will see a link in the terminal (usually `http://localhost:3000`). Copy and paste this into **Google Chrome** or **Microsoft Edge**.
8. **Load a Model**: Click the folder icon at the bottom toolbar, select an IFC file from your computer, and enjoy the performance!

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## 📁 Project Structure

```text
OBC-IFCViewer/
├── src/
│   ├── modules/
│   │   ├── core/                      # Core Application Modules
│   │   │   ├── IFCLoaderModule.ts     # IFC & Fragments loading logic
│   │   │   ├── PropertiesPanelModule.ts # IFC tree and properties panel
│   │   │   ├── PropertyTableModule.ts # Excel-like property table
│   │   │   └── PerformanceMonitor.ts  # Performance tracking
│   │   ├── webgl/                     # WebGL Feature Modules (Tools)
│   │   │   ├── WorldManager.ts        # 3D world setup (scene, camera, renderer)
│   │   │   ├── ClipperModule.ts       # Advanced sectioning tool
│   │   │   ├── MeasurementModule.ts   # Measurement tools
│   │   │   ├── FloorPlanModule.ts     # 2D Floor plan navigation
│   │   │   └── ...
│   │   ├── webgpu/                    # WebGPU Feature Modules
│   │   │   ├── WebGPURendererModule.ts # Main WebGPU entry point
│   │   │   ├── WebGPULODManager.ts    # Level of Detail system
│   │   │   ├── WebGPUFog.ts           # Atmospheric fog effects
│   │   │   ├── WebGPUOutlineManager.ts # Selection highlighting
│   │   │   └── ...
│   │   ├── ui/                        # UI Components & Styles
│   │   │   ├── ToolbarBuilder.ts      # Toolbar structure
│   │   │   ├── ToolbarHandlers.ts     # Event handlers
│   │   │   └── UIStyles.ts            # Shared styling
│   │   └── UIManager.ts               # UI Orchestration
│   ├── IFCViewer.ts                   # Main viewer orchestration class
│   ├── main.ts                        # Application entry point
│   └── styles.css                     # Global styles
├── index.html                         # HTML entry point
├── package.json                       # Dependencies and scripts
└── vite.config.ts                     # Vite bundler configuration
```

## 🧩 Module Overview

### Core Modules (src/modules/core)

#### IFCLoaderModule
- IFC file conversion to Fragments
- Direct Fragments loading
- Model management and export

#### PropertiesPanelModule
- IFC hierarchical tree view
- Element property inspection
- Collapsible side panel

#### PropertyTableModule
- Excel-like interactive table
- Bulk property inspection
- Advanced filtering and sorting

#### PerformanceMonitor
- Real-time FPS tracking
- Frame time and memory usage

### WebGL Feature Modules (src/modules/webgl)

#### WorldManager
- 3D environment setup (scene, camera, renderer)
- Grid and visual aids
- Lighting configuration

#### ClipperModule
- Advanced model sectioning
- Preset planes (X/Y/Z following AEC conventions)
- Custom double-click sections
- Flip and clear functionality

#### MeasurementModule
- Length, Area, and Volume measurements
- Perpendicular guides and snapping
- Professional dimensioning

#### FloorPlanModule
- Interactive 2D floor plan views
- Automatic camera positioning
- Pan/zoom navigation

### WebGPU Feature Modules (src/modules/webgpu)

#### WebGPURendererModule
- Experimental high-performance rendering engine
- Orchestrates all WebGPU sub-managers
- Optimized for massive models with millions of triangles

#### WebGPULODManager
- Automatic Level of Detail (LOD) system
- Distance-based geometry simplification
- Significant performance gains for large scenes

#### WebGPUFog
- Atmospheric fog effects (Linear/Exponential)
- Enhanced depth perception
- Works with MSAA anti-aliasing

#### WebGPUOutlineManager
- Professional selection highlighting
- Multi-pass outline rendering
- Configurable colors and thickness

### UI Modules (src/modules/ui & UIManager)

#### UIManager
- Modern floating toolbar with glassmorphic styling
- Expandable submenu system
- Model count badge with tooltips
- Event handling and state management

## 🎮 Usage

### Loading an IFC File

1. Click the **Load** button (folder icon) in the bottom toolbar
2. Select upload option from the submenu
3. Choose an `.ifc` or `.frag` file from your computer
4. Wait for conversion (if IFC) or instant loading (if Fragments)
5. Interact with the 3D model using mouse/touch controls

### Modern Bottom Toolbar

The application features a modern floating toolbar at the bottom with the following controls:

**Main Actions**:

- 📂 **Load**: Upload IFC/Fragments files or load sample models (expandable)
- 💾 **Export**: Save current model as Fragments format
- 👁️ **View**: Camera controls and space visibility (expandable)
- ✂️ **Clipper**: Sectioning tool with presets (expandable)
  - Section X/Y/Z (AEC convention aligned)
  - Flip Side (show opposite cut)
  - Clear All sections
- ℹ️ **Info**: Model information and statistics (expandable)
- 🗑️ **Clear**: Remove all loaded models
- ⚙️ **Settings**: Scene customization and performance (expandable)
  - **Renderer Mode**: Switch between WebGL and experimental WebGPU
  - **Shadow Quality**: Adjust shadow resolution for performance
  - **Background Color**: Customize the viewer environment

**Model Count Badge**:

- Displays total number of loaded models
- Hover to see detailed tooltip with model names and UUIDs
- Positioned on the Load button for easy access

**ViewCube (Top-Right)**:

- Click any face for instant camera orientation
- Perfect for switching between plan/elevation views
- Smooth animated transitions

### Scene Controls (Settings Menu)

- **Background Color**: Change the scene background
- **Directional Light**: Adjust main light intensity
- **Ambient Light**: Adjust ambient illumination

### Automatic Model Alignment

Models automatically align to their site coordinates when loaded. No manual alignment required! The viewer uses `COORDINATE_TO_ORIGIN = false` in the FragmentsManager to preserve original project coordinates, ensuring multi-discipline models (Architectural, Structural, MEP, etc.) align correctly.

### 3D Navigation

**Mouse Controls**:

- **Rotate**: Left mouse button (or one finger drag on mobile)
- **Pan**: Right mouse button (or two finger drag on mobile)
- **Zoom**: Mouse wheel (or pinch on mobile)
- **Select**: Single-click on elements to view properties

**ViewCube Navigation**:

- Click any face (front/back/left/right/top/bottom) for instant orientation
- Automatic smooth camera transitions
- Perfect for reviewing floor plans and elevations

### Sectioning Tool

**Enable**: Click the scissors icon ✂️ in the toolbar

**Section Methods**:

- **Section X**: Side view cut (perpendicular to X axis)
- **Section Y**: Horizontal floor plan cut (top view, AEC standard)
- **Section Z**: Vertical elevation cut (front view, AEC standard)
- **Custom Sections**: Double-click on model to create plane at that point

**Additional Controls**:

- **Flip Side**: Show opposite side of section cut
- **Clear All**: Remove all section planes
- **Delete Key**: Remove sections when clipper is enabled

**Sectioning Tips**:

- Preset sections auto-replace previous ones for cleaner workflow
- Flip is stable even when moving the mouse
- Follow AEC conventions (Y=horizontal plan, Z=vertical elevation)

### Model Alignment Tool

**Enable**: Click **View** → **Align Models** in the toolbar

**Features**:

- **Model Selection**: Choose any loaded model from dropdown
- **Position Display**: Current X, Y, Z coordinates (AEC standard with Z as elevation)
- **Manual Input**: Type precise coordinate values (0.1m precision)
- **Arrow Key Controls**:
  - **←/→**: Move along X axis (left/right)
  - **↑/↓**: Move along Y axis (forward/backward)
  - **Shift + ↑/↓**: Move along Z axis (elevation)
- **Step Size**: Configurable increment for arrow keys (default: 1m)
- **Draggable Panel**: Reposition panel anywhere on screen
- **Minimize/Expand**: Collapse panel when not needed
- **Apply/Reset**: Update position or return to origin (0, 0, 0)

**Use Cases**:

- Align models from different coordinate systems
- Position far-origin models (>100km from origin)
- Fine-tune multi-discipline model placement
- Verify model elevations and offsets

**Workflow**:

1. Load multiple IFC models
2. Open Model Alignment panel from View menu
3. Select model to reposition from dropdown
4. Adjust using manual inputs or arrow keys
5. Click Apply to update position
6. Drag panel to preferred location, minimize when done

## Technologies Used

- **[@thatopen/components](https://www.npmjs.com/package/@thatopen/components)** (3.2.0) - Core BIM components
- **[@thatopen/components-front](https://www.npmjs.com/package/@thatopen/components-front)** (3.2.0) - Frontend BIM tools
- **[@thatopen/ui](https://www.npmjs.com/package/@thatopen/ui)** (3.2.0) - UI component library
- **[@thatopen/ui-obc](https://www.npmjs.com/package/@thatopen/ui-obc)** (3.2.1) - OBC-specific UI elements (ViewCube)
- **[Three.js](https://threejs.org/)** (0.175.0) - 3D graphics library
- **[web-ifc](https://github.com/tomvandig/web-ifc)** - IFC file parser
- **[Font Awesome](https://fontawesome.com/)** (6.5.1) - Professional icon library
- **[Vite](https://vitejs.dev/)** - Fast build tool
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development

## 📚 Learn More

- [Open BIM Components Documentation](https://docs.thatopen.com/)
- [IFC Format Specification](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/)
- [Three.js Documentation](https://threejs.org/docs/)

## 🤝 Contributing

This is a demonstration project. Feel free to fork and modify for your needs.

## 📄 License

MIT License - Feel free to use this project as a starting point for your own applications.

## 🙏 Acknowledgments

- That Open Company for the excellent Open BIM Components libraries
- Three.js team for the amazing 3D engine
- BuildingSMART for the IFC standard
