# 📁 Project File Tree

```
OBC-IFCViewer/
│
├── 📄 .gitignore                      # Git ignore rules
│
├── 📚 DOCUMENTATION FILES
│   ├── README.md                      # Main user documentation
│   ├── GETTING_STARTED.md             # Quick start guide
│   ├── DEV_PROGRESS.md                # Development progress log
│   ├── ARCHITECTURE.md                # Technical architecture
│   ├── PROJECT_SUMMARY.md             # Project overview
│   └── FILE_TREE.md                   # This file
│
├── ⚙️ CONFIGURATION FILES
│   ├── package.json                   # Dependencies & scripts
│   ├── tsconfig.json                  # TypeScript config
│   └── vite.config.ts                 # Vite build config
│
├── 🌐 FRONTEND
│   └── index.html                     # HTML entry point
│
├── 💻 SOURCE CODE
│   └── src/
│       ├── main.ts                    # Application entry point
│       ├── IFCViewer.ts               # Main orchestrator class
│       ├── styles.css                 # Global CSS styles
│       │
│       └── modules/                   # Modular components
│           ├── WorldManager.ts             # 3D scene management
│           ├── IFCLoaderModule.ts          # Model loading & conversion
│           ├── ModelTransformModule.ts     # Model transformation utilities
│           ├── PropertiesPanelModule.ts    # IFC tree & properties
│           ├── SpaceVisibilityModule.ts    # Space element control
│           ├── ViewCubeModule.ts           # 3D navigation cube
│           ├── ClipperModule.ts            # Sectioning tool
│           ├── FirstPersonControlsModule.ts # FPS walk mode with collision
│           ├── UIManager.ts                # User interface controls
│           ├── PerformanceMonitor.ts       # Performance tracking
│           │
│           └── ui/                    # UI Submodules
│               ├── UIStyles.ts        # CSS-in-JS styles
│               ├── ToolbarBuilder.ts  # HTML generation
│               └── ToolbarHandlers.ts # Event handlers
│
└── 📖 EXTERNAL DOCS (Reference)
    └── OBC-Documentation/             # Open BIM Components documentation
        ├── Getting started.docx
        ├── Creating our 3D world.docx
        ├── IfcLoader.docx
        └── ... (other OBC docs)
```

## 📊 File Statistics

### Source Code Files (26 total)

| Category | Files | Lines | Description |
|----------|-------|-------|-------------|
| TypeScript | 14 | ~6,830 | Application logic |
| HTML | 1 | ~20 | Entry point |
| CSS | 1 | ~250 | Styling |
| Config | 3 | ~60 | Build & TS config |
| Docs | 7 | ~3,500 | Documentation |
| **Total** | **26** | **~10,660** | **Complete project** |

### Module Breakdown

```
src/modules/
├── WorldManager.ts                  (~220 lines) - 3D Environment + PostproductionRenderer
├── IFCLoaderModule.ts               (~675 lines) - Model Loading + Smart Coordinate System
├── ModelTransformModule.ts          (~150 lines) - Transformations
├── PropertiesPanelModule.ts         (~1264 lines) - Tree & Properties (Minimized by Default)
├── SpaceVisibilityModule.ts         (~120 lines) - Space Control
├── ViewCubeModule.ts                (~180 lines) - Navigation Cube
├── ClipperModule.ts                 (~300 lines) - Sectioning Tool
├── FirstPersonControlsModule.ts     (~530 lines) - FPS Walk Mode
├── UIManager.ts                     (~922 lines) - Main UI + Warning Labels
├── PerformanceMonitor.ts            (~85 lines)  - Performance
└── ui/
    ├── UIStyles.ts                  (~1349 lines) - CSS Styles + GOMERA Branding
    ├── ToolbarBuilder.ts            (~184 lines) - HTML Gen + Logo
    └── ToolbarHandlers.ts           (~263 lines) - Handlers + Error Messages
                                     ─────────────
                                     ~6,830 lines total
```

### Documentation

```
Documentation Files:
├── README.md              (~200 lines) - User guide
├── GETTING_STARTED.md     (~120 lines) - Tutorial
├── DEV_PROGRESS.md        (~2100 lines) - Dev log (13 phases complete)
├── ARCHITECTURE.md        (~500 lines) - Technical docs
├── PROJECT_SUMMARY.md     (~850 lines) - Overview
└── FILE_TREE.md           (this file)  - File structure
                           ─────────────
                           ~3,500 lines total
```

## 🎯 File Purposes

### Core Application Files

| File | Purpose | Key Responsibilities |
|------|---------|---------------------|
| `src/main.ts` | Entry point | Bootstrap app, handle DOM ready, HMR guards |
| `src/IFCViewer.ts` | Main class | Orchestrate all modules, wire callbacks |
| `src/modules/WorldManager.ts` | 3D scene | Create & manage scene, camera, PostproductionRenderer |
| `src/modules/IFCLoaderModule.ts` | Loading | Load IFC/Fragments, **smart coordinate system**, far-origin detection |
| `src/modules/ModelTransformModule.ts` | Transform | Center, fit, align models |
| `src/modules/PropertiesPanelModule.ts` | Properties | IFC tree, entity properties, selection (starts minimized) |
| `src/modules/SpaceVisibilityModule.ts` | Spaces | Toggle IfcSpace visibility |
| `src/modules/ViewCubeModule.ts` | Navigation | 3D orientation cube with face clicks |
| `src/modules/ClipperModule.ts` | Sectioning | Cut through models (X/Y/Z presets) |
| `src/modules/FirstPersonControlsModule.ts` | Walk Mode | FPS navigation with collision detection |
| `src/modules/UIManager.ts` | Interface | UI controls, toolbar, **warning labels**, event handling |
| `src/modules/PerformanceMonitor.ts` | Metrics | FPS, memory, frame time tracking |
| `src/modules/ui/UIStyles.ts` | Styling | CSS-in-JS for toolbar, **GOMERA branding**, **warning labels** |
| `src/modules/ui/ToolbarBuilder.ts` | HTML | Toolbar HTML generation with **logo** |
| `src/modules/ui/ToolbarHandlers.ts` | Handlers | Toolbar actions, **enhanced error messages** |
| `src/styles.css` | Styling | Global layout, responsive design |

### Configuration Files

| File | Purpose | Configuration |
|------|---------|--------------|
| `package.json` | Dependencies | npm packages, scripts |
| `tsconfig.json` | TypeScript | Compiler options, module resolution |
| `vite.config.ts` | Build | Dev server, production build |
| `.gitignore` | Git | Ignore node_modules, build output |

### Documentation Files

| File | Audience | Content |
|------|----------|---------|
| `README.md` | End users | Installation, features, usage, **smart coordinate system** |
| `GETTING_STARTED.md` | Beginners | Step-by-step tutorial |
| `DEV_PROGRESS.md` | Developers | Development process, decisions (**13 phases complete**) |
| `ARCHITECTURE.md` | Technical | System design, patterns |
| `PROJECT_SUMMARY.md` | All | Complete overview with **Phase 13** |
| `FILE_TREE.md` | All | File structure (this file) |

## 🔗 File Dependencies

### Import Graph

```
main.ts
  └─> IFCViewer.ts
       └─> modules/WorldManager.ts
            └─> @thatopen/components
            └─> three

       └─> modules/IFCLoaderModule.ts
            └─> modules/WorldManager.ts
            └─> @thatopen/components

       └─> modules/ModelTransformModule.ts
            └─> @thatopen/components

       └─> modules/PropertiesPanelModule.ts
            └─> modules/WorldManager.ts
            └─> modules/IFCLoaderModule.ts
            └─> @thatopen/components

       └─> modules/SpaceVisibilityModule.ts
            └─> modules/WorldManager.ts
            └─> @thatopen/components

       └─> modules/ViewCubeModule.ts
            └─> modules/WorldManager.ts
            └─> @thatopen/ui-obc
            └─> @thatopen/components
            └─> three

       └─> modules/ClipperModule.ts
            └─> modules/WorldManager.ts
            └─> @thatopen/components
            └─> three

       └─> modules/FirstPersonControlsModule.ts
            └─> modules/WorldManager.ts
            └─> @thatopen/components
            └─> @thatopen/fragments
            └─> three

       └─> modules/UIManager.ts
            └─> modules/WorldManager.ts
            └─> modules/IFCLoaderModule.ts
            └─> modules/ModelTransformModule.ts
            └─> modules/ui/UIStyles.ts
            └─> modules/ui/ToolbarBuilder.ts
            └─> modules/ui/ToolbarHandlers.ts
            └─> @thatopen/ui
            └─> @thatopen/ui-obc

       └─> modules/PerformanceMonitor.ts
            └─> modules/WorldManager.ts
            └─> stats.js
```

### External Dependencies

```
package.json dependencies:
├── @thatopen/components@3.2.0
├── @thatopen/components-front@3.2.0
├── @thatopen/fragments@3.2.0
├── @thatopen/ui@3.2.0
├── @thatopen/ui-obc@3.2.1
├── three@^0.169.0
├── web-ifc@^0.0.72
└── stats.js@^0.17.0

devDependencies:
├── vite@^5.4.10
└── typescript@^5.6.3
```

## 📦 Generated Files (After Installation)

```
After running 'npm install':
├── node_modules/          (~150MB, ~1000+ packages)
└── package-lock.json      (Dependency lock file)

After running 'npm run build':
└── dist/                  (Production build)
    ├── index.html
    ├── assets/
    │   ├── index-[hash].js
    │   └── index-[hash].css
    └── ...
```

## 🎨 File Naming Conventions

### TypeScript Files
- **PascalCase**: `WorldManager.ts`, `IFCViewer.ts`
- Classes match filename
- Clear, descriptive names

### CSS Files
- **kebab-case**: `styles.css`
- Descriptive of content

### Documentation
- **UPPER_CASE**: `README.md`, `DEV_PROGRESS.md`
- Easy to identify
- Standard convention

## 📏 Code Metrics

### Lines of Code by Type

```
TypeScript:        ~3,030 lines
  - Logic:           ~2,120 lines
  - Comments:          ~910 lines
  - Comment ratio:     ~30%

CSS:               ~250 lines
  - Styles:          ~200 lines
  - Comments:         ~50 lines

HTML:              ~20 lines
  - Markup:           ~15 lines
  - Comments:          ~5 lines

Config:            ~60 lines
Documentation:     ~1,400 lines
                  ────────────
Total:             ~4,760 lines
```

### Module Complexity

| Module | Lines | Methods | Complexity |
|--------|-------|---------|------------|
| WorldManager | ~120 | 5 | Low |
| IFCLoaderModule | ~210 | 6 | Medium |
| UIManager | ~280 | 9 | Medium |
| PerformanceMonitor | ~85 | 5 | Low |
| IFCViewer | ~110 | 5 | Low |

## 🔍 File Locations Quick Reference

### Need to modify...?

**Scene appearance (colors, lights)**
→ `src/modules/WorldManager.ts`

**File loading logic**
→ `src/modules/IFCLoaderModule.ts`

**UI layout or controls**
→ `src/modules/UIManager.ts`

**Visual styling**
→ `src/styles.css`

**Performance tracking**
→ `src/modules/PerformanceMonitor.ts`

**Build configuration**
→ `vite.config.ts`

**TypeScript settings**
→ `tsconfig.json`

**Dependencies**
→ `package.json`

## ✅ Verification Checklist

Use this to verify all files are present:

```
Core Application:
✅ src/main.ts
✅ src/IFCViewer.ts
✅ src/styles.css
✅ src/modules/WorldManager.ts
✅ src/modules/IFCLoaderModule.ts
✅ src/modules/UIManager.ts
✅ src/modules/PerformanceMonitor.ts

Frontend:
✅ index.html

Configuration:
✅ package.json
✅ tsconfig.json
✅ vite.config.ts
✅ .gitignore

Documentation:
✅ README.md
✅ GETTING_STARTED.md
✅ DEV_PROGRESS.md
✅ ARCHITECTURE.md
✅ PROJECT_SUMMARY.md
✅ FILE_TREE.md
```

## 🎯 Summary

**Total Project Files**: 26 (excluding node_modules)
**Total Lines of Code**: ~4,760
**Modules**: 10 independent modules
**UI Submodules**: 3 (UIStyles, ToolbarBuilder, ToolbarHandlers)
**Documentation**: 7 comprehensive files
**Ready to Use**: ✅ Yes

---

**To get started**: See `GETTING_STARTED.md`
**For architecture**: See `ARCHITECTURE.md`
**For full details**: See `PROJECT_SUMMARY.md`
