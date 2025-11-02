# IFC Viewer - Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         IFC VIEWER APP                           │
│                         (main.ts)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ initializes
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       IFCViewer Class                            │
│                    (IFCViewer.ts)                                │
│                                                                   │
│  Orchestrates all modules and manages application lifecycle     │
└───────┬─────────────┬──────────────┬──────────────┬────────────┘
        │             │              │              │
        │             │              │              │
        ▼             ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────┐ ┌─────────────┐
│ WorldManager │ │ IFCLoader    │ │ViewCube  │ │ FirstPerson │
│              │ │ Module       │ │Module    │ │ Controls    │
└──────┬───────┘ └──────┬───────┘ └────┬─────┘ └──────┬──────┘
       │                │              │              │
       │                │  metadata    │         collision
       │                │  callbacks   │         detection
       │                ▼              ▼              ▼
┌──────────────────────────────────────────────────────────┐
│                    UIManager                              │
│              (UIManager.ts)                               │
│                                                           │
│  Modern bottom toolbar with Font Awesome icons           │
│  - Expandable submenus (Load, View, Clipper, Info)      │
│  - Walk mode toggle with speed control                   │
│  - Model count badge with tooltip                        │
│  - ViewCube integration                                  │
│  - Sectioning controls                                   │
│  - Automatic metadata updates                            │
└───────────────────────────────────────────────────────────┘
```

## Module Dependency Graph

```
main.ts
  └─> IFCViewer
       ├─> WorldManager
       │    └─> OBC.Components
       │         ├─> OBC.Worlds
       │         ├─> OBC.SimpleScene
       │         ├─> OBC.OrthoPerspectiveCamera
       │         ├─> OBF.PostproductionRenderer (advanced graphics)
       │         │    ├─> Ambient Occlusion (GTAO)
       │         │    ├─> Cast Shadows (COLOR_SHADOWS style)
       │         │    ├─> LOD Material Support
       │         │    └─> GPU-accelerated effects
       │         ├─> OBC.Grids
       │         ├─> OBC.BoundingBoxer
       │         └─> OBC.Raycasters
       │
       ├─> IFCLoaderModule
       │    ├─> WorldManager (dependency)
       │    ├─> Model Metadata System (Map storage)
       │    └─> OBC.Components
       │         ├─> OBC.IfcLoader
       │         └─> OBC.FragmentsManager
       │              └─> COORDINATE_TO_ORIGIN = false (automatic alignment)
       │
       ├─> ViewCubeModule
       │    ├─> WorldManager (dependency)
       │    ├─> @thatopen/ui-obc (bim-view-cube)
       │    └─> OBC.BoundingBoxer
       │         └─> getCameraOrientation() for face clicks
       │
       ├─> ClipperModule
       │    ├─> WorldManager (dependency)
       │    ├─> OBC.Clipper
       │    ├─> OBC.Raycasters (mouse intersection)
       │    ├─> OBC.BoundingBoxer (model center calculation)
       │    └─> THREE.Vector3 (plane normals)
       │
       ├─> FirstPersonControlsModule
       │    ├─> WorldManager (dependency)
       │    ├─> OBC.Worlds
       │    ├─> OBC.OrthoPerspectiveCamera (FirstPerson mode)
       │    ├─> OBC.FragmentsManager
       │    └─> Fragment.raycast() API
       │         ├─> Async collision detection (Web Worker)
       │         ├─> model.getItemsData() (category extraction)
       │         └─> Category-based filtering (walls vs doors)
       │
       ├─> UIManager
       │    ├─> WorldManager (dependency)
       │    ├─> IFCLoaderModule (dependency)
       │    ├─> ViewCubeModule (via IFCViewer)
       │    ├─> ClipperModule (via IFCViewer)
       │    ├─> Font Awesome 6.5.1 (icon library)
       │    └─> Modern UI Components
       │         ├─> Bottom floating toolbar
       │         ├─> Expandable submenus
       │         ├─> Model count badge
       │         ├─> ViewCube controls
       │         ├─> Clipper controls (X/Y/Z/Flip/Clear)
       │         └─> Detailed tooltip system
       │
       └─> PerformanceMonitor
            ├─> WorldManager (dependency)
            └─> stats.js
```

## Data Flow

### Loading an IFC File

```
User Action (Click Load button → Upload submenu)
        │
        ▼
UIManager.handleFileUpload()
        │
        ▼
IFCLoaderModule.loadIFC()
        │
        ├─> Fetch/Read File
        ├─> Convert to Uint8Array
        ├─> OBC.IfcLoader.load()
        │    └─> web-ifc (WASM) parses IFC
        │         └─> Converts to Fragments
        │
        ▼
FragmentsManager.onItemSet
        │
        ├─> Add to Scene (automatic alignment via COORDINATE_TO_ORIGIN = false)
        ├─> Link to Camera
        ├─> Store Metadata (retry logic for mesh count)
        └─> Update Renderer
        │
        ▼
Metadata Callback Triggered
        │
        ▼
UIManager.updateModelCount()
        │
        ├─> Update badge number
        └─> Refresh tooltip content (name + UUID)
        │
        ▼
Model appears in 3D Scene with metadata displayed
```

### Rendering Loop

```
Browser Animation Frame
        │
        ▼
World.renderer.onBeforeUpdate
        │
        ├─> PerformanceMonitor.begin()
        │
        ▼
Three.js Render Cycle
        │
        ├─> Update Camera
        ├─> Update Fragments
        ├─> Render Scene
        │
        ▼
World.renderer.onAfterUpdate
        │
        └─> PerformanceMonitor.end()
```

## Component Interactions

### Scene Customization Flow

```
User adjusts slider in UI
        │
        ▼
UIManager (event handler)
        │
        ▼
WorldManager.setLightingIntensity()
        │
        ▼
world.scene.config.directionalLight.intensity = value
        │
        ▼
Three.js automatically re-renders with new lighting
```

## File Structure with Purpose

```
OBC-IFCViewer/
│
├── src/
│   ├── modules/                    # Modular components
│   │   ├── WorldManager.ts         # 🌍 3D World Management
│   │   │   - Creates scene, camera, renderer
│   │   │   - Manages lighting and grids
│   │   │   - Provides scene customization
│   │   │
│   │   ├── IFCLoaderModule.ts      # 📦 Model Loading
│   │   │   - Loads IFC files
│   │   │   - Converts to Fragments
│   │   │   - Manages model lifecycle
│   │   │   - Export functionality
│   │   │
│   │   ├── FirstPersonControlsModule.ts  # 🚶 Walk Mode
│   │   │   - FPS-style camera controls (WASD, mouse look)
│   │   │   - Async collision detection via Fragment raycast
│   │   │   - Category-based filtering (walls block, doors allow)
│   │   │   - Crosshair and visual feedback
│   │   │
│   │   ├── UIManager.ts            # 🎨 User Interface
│   │   │   - File upload controls
│   │   │   - Scene settings panel
│   │   │   - Walk mode toggle
│   │   │   - Mobile responsiveness
│   │   │   - Status updates
│   │   │
│   │   └── PerformanceMonitor.ts   # 📊 Performance Tracking
│   │       - FPS monitoring
│   │       - Memory usage
│   │       - Frame time tracking
│   │
│   ├── IFCViewer.ts                # 🎯 Main Orchestrator
│   │   - Initializes all modules
│   │   - Manages application lifecycle
│   │   - Provides public API
│   │
│   ├── main.ts                     # 🚀 Entry Point
│   │   - Bootstrap application
│   │   - DOM ready handling
│   │   - Error handling
│   │
│   └── styles.css                  # 💅 Global Styles
│       - Layout and positioning
│       - Responsive design
│       - Animations
│
├── index.html                      # 📄 HTML Entry
│   - Container div
│   - Module script import
│
├── vite.config.ts                  # ⚙️ Build Configuration
├── tsconfig.json                   # 🔧 TypeScript Config
├── package.json                    # 📦 Dependencies
│
├── README.md                       # 📖 User Documentation
├── DEV_PROGRESS.md                 # 📋 Development Log
├── GETTING_STARTED.md              # 🚀 Quick Start
└── ARCHITECTURE.md                 # 📐 This file
```

## Technology Stack Layers

```
┌─────────────────────────────────────────┐
│         Application Layer                │
│  (IFCViewer, Modules, UI)               │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│      Open BIM Components (OBC)          │
│  - @thatopen/components                 │
│  - @thatopen/fragments                  │
│  - @thatopen/ui                         │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│           Core Libraries                 │
│  - Three.js (3D Graphics)               │
│  - web-ifc (IFC Parser)                 │
│  - stats.js (Performance)               │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│          Browser APIs                    │
│  - WebGL 2.0                            │
│  - WebAssembly                          │
│  - File API                             │
└──────────────────────────────────────────┘
```

## Key Design Patterns

### 1. Singleton Pattern
```typescript
// Components are retrieved, not instantiated
const worlds = components.get(OBC.Worlds);
const ifcLoader = components.get(OBC.IfcLoader);
```

### 2. Dependency Injection
```typescript
class UIManager {
  constructor(
    private worldManager: WorldManager,
    private ifcLoader: IFCLoaderModule
  ) {}
}
```

### 3. Event-Driven Architecture
```typescript
// React to events
fragments.list.onItemSet.add(({ value: model }) => {
  // Handle new model
});

world.camera.controls.addEventListener('rest', () => {
  // Update when camera stops
});
```

### 4. Factory Pattern
```typescript
// Creating complex objects
const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();
```

## Memory Management Strategy

```
Application Lifecycle:
  
1. Initialization
   └─> Create components
   └─> Allocate GPU memory
   └─> Setup event listeners

2. Runtime
   └─> Load/unload models
   └─> Update render loop
   └─> Monitor memory usage

3. Cleanup (CRITICAL)
   └─> Remove event listeners
   └─> Dispose Three.js objects
   └─> Clear fragments
   └─> Dispose components
```

## Performance Considerations

### Optimization Strategies:
1. **Lazy Loading**: Only load models when requested
2. **Fragments Format**: Pre-converted models load instantly
3. **Camera Rest Events**: Update only when camera stops moving
4. **Selective Rendering**: Only render visible objects
5. **Memory Monitoring**: Track and prevent memory leaks

### Performance Metrics:
- **Target FPS**: 60 (smooth animation)
- **Max Frame Time**: 16ms (1000ms / 60fps)
- **Memory Usage**: Monitor via stats.js

## Security Considerations

1. **CORS**: CDN resources require proper CORS headers
2. **File Validation**: Check file extensions before loading
3. **Error Handling**: Catch and handle all exceptions
4. **Input Sanitization**: Validate user inputs

## Extensibility Points

Want to add features? Here are the extension points:

1. **New UI Controls**: Extend `UIManager` and add toolbar handlers
2. **Custom Tools**: Create new module in `src/modules/` (e.g., MeasurementModule)
3. **Model Analysis**: Hook into `fragments.list.onItemSet`
4. **Custom Rendering**: Extend `WorldManager`
5. **File Formats**: Add loaders to `IFCLoaderModule`
6. **Navigation Tools**: Follow ViewCubeModule pattern with BoundingBoxer
7. **Cutting/Sectioning**: Extend ClipperModule for custom plane types
8. **Camera Controls**: Extend FirstPersonControlsModule for new navigation modes

## New Modules (Phases 7-8)

### ViewCubeModule
**Location**: `src/modules/ViewCubeModule.ts`

**Purpose**: 3D navigation cube for easy camera orientation

**Key Features**:
- Interactive cube with 6 clickable faces
- Automatic camera alignment to model views
- Uses BoundingBoxer for optimal camera positioning
- Smooth camera transitions
- Positioned in top-right corner of viewport

**Integration**:
```typescript
this.viewCube = new ViewCubeModule(worldManager);
await this.viewCube.initialize(world, container);
```

### ClipperModule
**Location**: `src/modules/ClipperModule.ts`

**Purpose**: Advanced sectioning tool for model analysis

**Key Features**:
- Toggle sectioning mode on/off
- Preset sections (X/Y/Z aligned to AEC conventions)
- Flip planes to show opposite side
- Clear all sections
- Double-click for custom plane creation
- Auto-replace previous planes when selecting presets

**Integration**:
```typescript
this.clipper = new ClipperModule(worldManager);
await this.clipper.initialize(world, container);
```

**Section Conventions** (AEC Standard):
- **Section X**: Side view (perpendicular to X axis)
- **Section Y**: Plan view (horizontal, perpendicular to Z axis)
- **Section Z**: Elevation view (vertical, perpendicular to Y axis)

### FirstPersonControlsModule (Phase 8)
**Location**: `src/modules/FirstPersonControlsModule.ts`

**Purpose**: Immersive first-person navigation with collision detection

**Key Features**:
- FPS-style camera controls (WASD, Arrow keys, mouse look)
- Pointer lock support for immersive experience
- Async collision detection using Fragment's raycast API
- Category-based filtering (walls block, doors/windows allow passage)
- Visual feedback (crosshair, status indicator, controls panel)
- Adjustable movement speed (0.1 - 2.0)
- Fixed camera near plane to prevent wall clipping

**Technical Highlights**:
- Uses `model.raycast()` from Fragment API (not THREE.Raycaster)
- Async architecture: loop → updateMovement → checkCollision
- Raycast returns `{localId, distance, object}`
- Gets IFC category via `model.getItemsData([localId])`
- Respects geometry voids (doors/windows) automatically
- Web Worker-based raycasting (non-blocking)

**Collision Detection Evolution**:
- 10+ approaches attempted before finding optimal solution
- Final approach leverages OBC's internal geometry mapping
- No physical collision meshes needed (lightweight)
- Category-based filtering after raycast hit detection

**Integration**:
```typescript
this.firstPersonControls = new FirstPersonControlsModule(
  worldManager,
  fragments
);
await this.firstPersonControls.initialize(world, fragments);
```

**UI Integration**:
- Walk mode toggle in View submenu (fa-person-walking icon)
- Speed slider in settings panel
- Active state indication when enabled
- ESC key to exit walk mode

## Testing Strategy (Future)

```
Unit Tests
  └─> Test individual module methods
  └─> Mock dependencies

Integration Tests
  └─> Test module interactions
  └─> Verify data flow

E2E Tests
  └─> Test complete user workflows
  └─> Browser automation

Performance Tests
  └─> Load large models
  └─> Measure FPS and memory
```

---

**This architecture ensures**:
✅ Maintainability - Clear module boundaries
✅ Scalability - Easy to add features
✅ Testability - Mockable dependencies
✅ Performance - Optimized rendering
✅ Reliability - Proper error handling
