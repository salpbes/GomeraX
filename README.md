# GomeraX - Experimental IFC Viewer

**GOMERA** is a experimental, modular IFC file viewer built with [Open BIM Components (OBC)](https://docs.thatopen.com/).

## 🎯 Features

- 📂 **IFC File Loading**: Load and view Industry Foundation Classes (IFC) files
- ⚡ **Fragments Support**: Fast loading with pre-converted Fragments format
- 🎨 **Cast Shadows Rendering**: Professional cast shadows with ambient occlusion
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
- 🚶 **First-Person Walk Mode with Gravity**: FPS-style navigation with collision detection and gravity
- 📏 **Measurement Tools**: Length, Area, and Volume measurements with perpendicular guides
- 🎯 **Model Alignment Tool**: Drag-and-drop panel for precise multi-model positioning with AEC-standard coordinates
- 🏢 **Floor Plan Views**: Interactive 2D floor plan views with pan/zoom navigation
- 📊 **Property Table**: Excel-like interactive table for bulk property inspection and filtering
- 🤖 **AI-Powered BIM Assistant**: Natural language interface for model interaction with:
  - **On-Device LLM**: Privacy-first AI running entirely in-browser via WebLLM Qwen3 (no cloud required)
  - **Natural Language Commands**: Select, hide, isolate elements using natural language ("show me all doors")
  - **Smart Context**: Understands pronouns and follow-ups ("hide them", "zoom to those")
  - **Element Queries**: Count and analyze model elements ("how many windows are there?")
  - **Camera Control**: Navigate via voice ("show front view", "zoom to columns")
  - **Storey Navigation**: Jump to floors by name ("go to Level 2")
  - **IFC Type Recognition**: Automatically maps natural language to IFC types
  - **Real-time Stats**: GPU usage, decode speed, and token metrics display
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

## 👨‍💻 Testing Guide (For Non-Developers)

> **📋 No coding experience required!** This guide will walk you through testing GOMERA X on your own computer in about 5 minutes.

---

### 📦 Step 1: Install Node.js (One-Time Setup)

Node.js is a free tool that runs the viewer. You only need to install it once.

1. Go to **[nodejs.org](https://nodejs.org/)**
2. Click the big green button labeled **"LTS"** (on the left side)
3. Run the downloaded installer and click **Next** through all steps
4. ✅ Done! You now have Node.js installed

> 💡 **Tip:** To verify installation, open Terminal/Command Prompt and type `node --version`. You should see a version number like `v20.x.x`

---

### 📥 Step 2: Download GOMERA X

1. On this GitHub page, click the green **`< > Code`** button (near the top)
2. Select **"Download ZIP"** from the dropdown menu
3. Once downloaded, **extract/unzip** the folder:
   - **Windows:** Right-click the ZIP → **Extract All...**
   - **Mac:** Double-click the ZIP file
4. Move the extracted folder to an easy location (Desktop or Documents)

> ⚠️ **Important:** Remember where you saved this folder — you'll need it in the next step!

---

### 💻 Step 3: Open Terminal (Command Line)

| Operating System | How to Open |
|-----------------|-------------|
| **Windows** | Press `Windows key`, type **cmd**, press `Enter` |
| **Mac** | Press `Command + Space`, type **Terminal**, press `Enter` |
| **Linux** | Press `Ctrl + Alt + T` |

You should see a black or white window with a blinking cursor — this is your terminal.

---

### 📂 Step 4: Navigate to the Project Folder

In your terminal, type the following (don't press Enter yet):

```bash
cd 
```

> 📌 **Note:** Make sure there's a **space** after `cd`

Now, **drag and drop** the extracted folder from your file explorer directly into the terminal window. The path will appear automatically!

Press **Enter**.

**Example of what you might see:**
```bash
cd /Users/YourName/Desktop/OBC-IFCViewer-main
```

---

### 📦 Step 5: Install Dependencies

Type this command and press **Enter**:

```bash
npm install
```

⏳ **Wait 1-2 minutes** while it downloads the required components. You'll see text scrolling — this is normal!

> ✅ **Success indicator:** When it's done, you'll see your cursor again without any red "ERROR" messages.

---

### 🚀 Step 6: Start the Viewer

Type this command and press **Enter**:

```bash
npm run dev
```

You should see something like this:

```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

> 🎉 **The viewer is now running!** Keep this terminal window open.

---

### 🌐 Step 7: Open in Your Browser

1. **Copy** the link shown in the terminal (usually `http://localhost:3000`)
2. **Open Google Chrome** or **Microsoft Edge** (recommended browsers)
3. **Paste** the link into the address bar and press **Enter**

You should now see the GOMERA X viewer interface!

---

### 📁 Step 8: Load Your IFC Model

1. Look at the **bottom toolbar** of the viewer
2. Click the **📂 folder icon** (Load button)
3. Select **"Upload IFC"** or **"Upload Fragments"**
4. Choose an IFC file from your computer
5. Wait for the model to load and appear in 3D

🎊 **Congratulations!** You're now viewing your BIM model in GOMERA X!

---

### 🛑 How to Stop the Viewer

When you're done testing:
1. Go back to your terminal window
2. Press `Ctrl + C` (on both Windows and Mac)
3. The server will stop, and you can close the terminal

---

### ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm: command not found` | Node.js wasn't installed correctly. Restart Step 1 |
| `ENOENT: no such file or directory` | You're not in the right folder. Redo Step 4 |
| `ERESOLVE unable to resolve dependency tree` | Run `npm install --legacy-peer-deps` instead |
| Page won't load in browser | Make sure the terminal still shows the server running |
| Model loads but looks wrong | Try a different IFC file, or check if it's a valid IFC |

> 💬 **Still stuck?** Open an issue on this GitHub page describing your problem!

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
├── index.html                                 # HTML entry point
├── package.json                               # Dependencies and scripts
├── tsconfig.json                              # TypeScript configuration
├── vite.config.ts                             # Vite bundler configuration
├── public/
│   └── worker.mjs                             # Web worker for background tasks
└── src/
    ├── main.ts                                # Application entry point
    ├── IFCViewer.ts                           # Main viewer orchestration class
    ├── styles.css                             # Global styles
    └── modules/
        ├── UIManager.ts                       # UI Orchestration
        │
        ├── core/                              # 🧠 Core Application Modules
        │   ├── IFCLoaderModule.ts             # IFC & Fragments loading
        │   ├── PropertiesPanelModule.ts       # IFC tree and properties
        │   ├── PropertyTableModule.ts         # Excel-like property table
        │   ├── PerformanceMonitor.ts          # FPS & memory tracking
        │   ├── ViewerInitializer.ts           # Viewer setup & config
        │   ├── AIAssistantModule.ts           # 🤖 AI Assistant integration
        │   ├── ai/                            # AI Engine Components
        │   │   ├── WebLLMEngine.ts            # Local LLM (WebLLM/Qwen)
        │   │   ├── ConversationalEngine.ts    # Chat orchestration
        │   │   ├── ConversationContext.ts     # Context management
        │   │   ├── AIIntentEngine.ts          # User intent detection
        │   │   ├── AIBimActions.ts            # BIM-specific actions
        │   │   ├── AIRuleEngine.ts            # Rule-based responses
        │   │   ├── actions/                   # Action handlers
        │   │   ├── agent/                     # Agent components
        │   │   └── webllm/                    # WebLLM utilities
        │   └── properties/                    # Property Management
        │       ├── SelectionManager.ts        # Element selection
        │       ├── PropertyDisplayManager.ts  # Property display
        │       ├── TreeManager.ts             # IFC tree structure
        │       ├── StoreyDataManager.ts       # Storey/level data
        │       ├── GhostModeManager.ts        # Ghost mode rendering
        │       └── table/                     # Table components
        │
        ├── webgl/                             # 🎮 WebGL Feature Modules
        │   ├── index.ts                       # Module exports
        │   ├── WorldManager.ts                # 3D world (scene, camera, renderer)
        │   ├── ClipperModule.ts               # Advanced sectioning
        │   ├── ClipStylerModule.ts            # Section styling
        │   ├── MeasurementModule.ts           # Length/Area/Volume tools
        │   ├── FloorPlanModule.ts             # 2D floor plan views
        │   ├── ViewCubeModule.ts              # 3D navigation cube
        │   ├── MinimapModule.ts               # Minimap overlay
        │   ├── FirstPersonControlsModule.ts   # FPS-style navigation
        │   ├── ClusterModule.ts               # Element clustering
        │   ├── ColorSplashModule.ts           # Color highlighting
        │   ├── SpaceVisibilityModule.ts       # IfcSpace toggle
        │   ├── ModelTransformModule.ts        # Model positioning
        │   └── AdaptiveQualityController.ts   # Quality scaling
        │
        ├── webgpu/                            # ⚡ WebGPU Feature Modules
        │   ├── index.ts                       # Module exports
        │   ├── README.md                      # WebGPU documentation
        │   ├── WebGPURendererModule.ts        # Main renderer entry
        │   ├── ViewerWebGPUAPI.ts             # Public WebGPU API
        │   └── managers/                      # WebGPU Sub-managers
        │       ├── index.ts                   # Manager exports
        │       ├── WebGPULODManager.ts        # Level of Detail
        │       ├── WebGPUFog.ts               # Atmospheric fog
        │       ├── WebGPUOutlineManager.ts    # Selection outlines
        │       ├── WebGPUElementSelector.ts   # GPU picking
        │       ├── WebGPUColorPicker.ts       # Color picking
        │       ├── WebGPUEdgeManager.ts       # Edge rendering
        │       ├── WebGPUShadowManager.ts     # Shadow optimization
        │       ├── WebGPUAmbientOcclusion.ts  # AO effects
        │       ├── WebGPUMaterialFactory.ts   # Material creation
        │       ├── WebGPUCategoryPalette.ts   # Category colors
        │       ├── WebGPUGeometryUtils.ts     # Geometry helpers
        │       ├── WebGPUOptimizations.ts     # Performance utils
        │       ├── WebGPUProxySceneBuilder.ts # Scene building
        │       ├── WebGPUStatsManager.ts      # Stats tracking
        │       ├── WebGPUStatsOverlay.ts      # Stats UI overlay
        │       └── WebGPUTypes.ts             # TypeScript types
        │
        └── ui/                                # 🎨 UI Components
            ├── ToolbarBuilder.ts              # Toolbar structure
            ├── ToolbarHandlers.ts             # Toolbar event handlers
            ├── UIStyles.ts                    # Shared CSS styles
            ├── LoadingUIManager.ts            # Loading indicators
            ├── NotificationUIManager.ts       # Notifications
            ├── NotificationHelper.ts          # Notification utils
            ├── SelectionUIManager.ts          # Selection UI
            ├── NavigationUIManager.ts         # Navigation controls
            ├── ClipperUIManager.ts            # Clipper controls
            ├── MeasurementUIManager.ts        # Measurement UI
            ├── FloorPlanUIManager.ts          # Floor plan UI
            ├── ClusterUIManager.ts            # Cluster visualization
            ├── WebGPUUIManager.ts             # WebGPU settings UI
            ├── ModelAlignmentManager.ts       # Model alignment panel
            ├── ModelDashboard.ts              # Model statistics
            ├── SlicerDashboard.ts             # Data slicer panel
            ├── AIAssistantUIManager.ts        # 🤖 AI chat UI manager
            ├── ai/                            # AI UI Components
            │   ├── AIChatManager.ts           # Chat message handling
            │   ├── AIDomManager.ts            # DOM element creation
            │   └── AIStyleManager.ts          # AI panel styling
            └── dashboard/                     # Dashboard Components
                ├── UIManager.ts               # Dashboard UI
                ├── DataManager.ts             # Data processing
                ├── ChartManager.ts            # Chart rendering
                ├── SlicerUIManager.ts         # Slicer UI
                ├── SlicerDataManager.ts       # Slicer data
                └── SlicerChartManager.ts      # Slicer charts
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
