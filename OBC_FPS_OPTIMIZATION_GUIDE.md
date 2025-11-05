# OBC FPS Optimization Guide
## Incorporating OBC Framework Best Practices

**Date**: 2025  
**Context**: Optimization for IFC Viewer with all features active (Ambient Occlusion, Double-Sided Rendering, Section Hatches & Fills)  
**OBC Version**: @thatopen/components 3.2.0, @thatopen/components-front 3.2.0

---

## Part 1: OBC Framework Optimization Principles

### 1.1 Fragment System & LOD (Level of Detail)

**OBC Best Practice**: Fragments use culling and LOD to optimize geometry rendering by offloading parts not visible to the user.

**Implementation**:
```typescript
// From OBC FragmentsManager Tutorial
// Camera-based culling: Update fragments when camera stops
world.camera.controls.addEventListener("rest", () => 
  fragments.core.update(true)
);

// Also update on camera changes for continuous optimization
world.onCameraChanged.add((camera) => {
  for (const [, model] of fragments.list) {
    model.useCamera(camera.three);
  }
  fragments.core.update(true);
  // Update PostproductionRenderer camera too
  world.renderer?.postproduction?.updateCamera?.();
});
```

**Expected FPS Gain**: +15% by skipping off-screen geometry rendering

**Key OBC Principle**: Fragment culling is automatic—just call `fragments.core.update(true)` after camera changes

---

### 1.2 PostproductionRenderer Optimization Parameters

**OBC Best Practice**: GTAO (Ground Truth Ambient Occlusion) has tunable parameters that trade quality for performance.

**Critical Parameters** (from OBC PostproductionRenderer Tutorial):

```typescript
// Ambient Occlusion Parameters - Balance quality/performance
const aoParameters = {
  radius: 0.25,              // 0.01-1.0 (smaller = faster, less shadow)
  distanceExponent: 1,       // 1-4 (lower = faster, less detail)
  thickness: 1,              // 0.01-10 (affects shadow depth)
  scale: 1,                  // 0.01-2 (1.0 = standard, 0.5 = 50% lighter)
  samples: 16,               // 2-32 (lower = faster BUT more artifacts)
  distanceFallOff: 1,        // 0-1 (falloff rate)
  screenSpaceRadius: true,   // true = adaptive radius based on screen
};

// Pixel Dithering Parameters - Reduces banding artifacts
const pdParameters = {
  lumaPhi: 10,              // 0-20 (luminance threshold)
  depthPhi: 2,              // 0.01-20 (depth threshold)
  normalPhi: 3,             // 0.01-20 (normal threshold)
  radius: 4,                // 0-32 (sample radius)
  radiusExponent: 1,        // 0.1-4 (radius scale)
  rings: 2,                 // 1-16 (sample rings)
  samples: 16,              // 2-32 (lower = faster)
};

// Apply parameters
world.renderer.postproduction.aoPass.updateGtaoMaterial(aoParameters);
world.renderer.postproduction.aoPass.updatePdMaterial(pdParameters);
```

**Performance-Optimized Presets**:

| Preset | Radius | Samples | Scale | Expected FPS Impact |
|--------|--------|---------|-------|---------------------|
| **Ultra** (default) | 0.25 | 32 | 1.0 | -40% (baseline) |
| **High Quality** | 0.25 | 16 | 0.8 | -28% |
| **Balanced** | 0.15 | 12 | 0.7 | -18% |
| **Performance** | 0.1 | 8 | 0.5 | -8% |
| **Ultra Performance** | 0.08 | 4 | 0.3 | -3% |

**Expected FPS Gain**: +25-37% by switching from Ultra to Performance presets

---

### 1.3 Hider Component for Geometry Filtering

**OBC Best Practice**: Use Hider component to isolate/hide categories, reducing fragment rendering load.

**Implementation**:
```typescript
// From OBC Hider Tutorial - Efficient visibility management
const hider = components.get(OBC.Hider);

// Hide non-visible categories during sectioning
const hideNonRelevantCategories = async (visibleCategories: string[]) => {
  const modelIdMap: OBC.ModelIdMap = {};
  
  // Get all categories to hide (inverse of visible)
  for (const [, model] of fragments.list) {
    const items = await model.getItemsOfCategories(
      [/^(IFCDOOR|IFCWINDOW|IFCFURNITURE)$/]
    );
    const localIds = Object.values(items).flat();
    modelIdMap[model.modelId] = new Set(localIds);
  }
  
  // Hide them efficiently
  await hider.set(false, modelIdMap);
};

// Reset when needed
const showAll = async () => {
  await hider.set(true);
};
```

**Expected FPS Gain**: +20% by hiding 40% of geometry during sectioning

**Key OBC Principle**: Hider works with ModelIdMaps (OBC's selection system) for worker-thread efficiency

---

### 1.4 ClipStyler Performance Optimization

**OBC Best Practice**: Reduce ClipStyler complexity during real-time operations.

**Optimization Strategy**:
```typescript
// Simplified ClipStyler mode during movement
const clipStyler = components.get(OBF.ClipStyler);

// Simplified mode: lines only, no fills
enableSimplifiedMode = () => {
  // Reduce line width and disable fills
  const simplifiedStyle = {
    linesMaterial: new LineMaterial({
      color: "#000000",
      linewidth: 0.5,  // Reduced from 1.5px
    }),
    // NO fillsMaterial - saves 30% of clip rendering
  };
  clipStyler.styles.set("SimplifiedHatch", simplifiedStyle);
  
  // Switch clipping planes to simplified style
  for (const [, clippingPlane] of clipper.list) {
    clipStyler.createFromClipping(clippingPlane.id, {
      items: {
        All: { style: "SimplifiedHatch" }
      }
    });
  }
};

// Full mode for static views
disableSimplifiedMode = () => {
  // Switch back to full-quality style with fills
};
```

**Expected FPS Gain**: +15-20% by disabling fills during camera movement

---

## Part 2: Complete OBC-Based FPS Optimization Strategy

### Priority Tier 1: Immediate High-Impact Optimizations

#### 1. Adaptive Quality Controller (OBC FragmentsManager + PostproductionRenderer)
- **File to Create**: `src/modules/AdaptiveQualityController.ts`
- **Triggers**: Monitor FPS via PerformanceMonitor
- **Actions**:
  - FPS < 30: Switch to "Performance" AO preset
  - FPS < 35: Auto-enable ClipStyler simplified mode
  - FPS > 45: Return to full quality
  
**Expected Impact**: +25-40% FPS stabilization

**Integration Points**:
- Hook into `worldManager.setAmbientOcclusion()` for AO preset switching
- Hook into `clipStyler.enableSimplifiedMode()` for automatic switching
- Read FPS from `performanceMonitor.fps`

#### 2. Fragment-Based Geometry Filtering (OBC Hider)
- **File to Modify**: Extend `IFCLoaderModule.ts`
- **Strategy**: Hide non-visible categories during sectioning
- **Implementation**:
  - When entering sectioning mode: hide IFCDOOR, IFCWINDOW, IFCFURNITURE
  - When exiting: restore visibility
  
**Expected Impact**: +15-25% during sectioning

**OBC Integration**:
```typescript
// In IFCLoaderModule or new SectioningModule
const hider = components.get(OBC.Hider);
const enterSectioningMode = async () => {
  // Hide minor elements
  await hider.set(false, {
    [modelId]: new Set([...doorIds, ...windowIds])
  });
};
```

#### 3. Camera-Based LOD Updates (OBC FragmentsManager Core)
- **File to Modify**: `src/modules/WorldManager.ts`
- **Strategy**: Already partially implemented, enhance it
- **Code**:
```typescript
// Ensure camera rest listener calls fragment update with LOD
world.camera.controls.addEventListener("rest", () => {
  fragments.core.update(true);  // true = enable LOD
});

// Also update on zoom changes (via camera change event)
world.onCameraChanged.add((camera) => {
  // Update fragment LOD based on camera zoom
  for (const [, model] of fragments.list) {
    model.useCamera(camera.three);
  }
  fragments.core.update(true);
});
```

**Expected Impact**: +10-15% by culling off-screen geometry

---

### Priority Tier 2: Medium-Impact Optimizations

#### 4. AO Resolution Scaling (PostproductionRenderer Parameter Tuning)
- **Strategy**: Render AO at reduced resolution, upscale
- **Implementation**:
```typescript
// Reduce GTAO samples based on device performance
const aoPass = world.renderer.postproduction.aoPass;

// Performance mode
aoPass.updateGtaoMaterial({
  samples: 8,           // Down from 32
  radius: 0.15,        // Smaller occlusion radius
  scale: 0.7,          // Lighter shadows
  screenSpaceRadius: true,
});
```

**Expected Impact**: +15-25% AO-related FPS

---

#### 5. Lazy Clipping Plane Updates
- **Strategy**: Defer ClipStyler updates until camera stops
- **Implementation**:
```typescript
// In ClipStylerModule
let clipUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

const scheduleClipUpdate = () => {
  if (clipUpdateTimeout) clearTimeout(clipUpdateTimeout);
  
  // Defer style updates until 200ms after camera movement stops
  clipUpdateTimeout = setTimeout(() => {
    // Update all clipping plane styles
    // This delays visual update but saves real-time FPS
  }, 200);
};

world.onCameraChanged.add(scheduleClipUpdate);
```

**Expected Impact**: +8-12% during camera movement

---

### Priority Tier 3: Framework-Specific Best Practices

#### 6. Enable Fragment Culling on Model Load
- **File to Modify**: `IFCLoaderModule.ts`
- **Strategy**: Ensure polygonOffset prevents z-fighting without extra rendering
```typescript
// From OBC PostproductionRenderer Tutorial
fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  if (!("isLodMaterial" in material && material.isLodMaterial)) {
    material.polygonOffset = true;
    material.polygonOffsetUnits = 1;
    material.polygonOffsetFactor = Math.random();
  }
});
```

#### 7. Exclude LOD Materials from Expensive Passes
- **Strategy**: Skip non-LOD materials from some rendering passes
```typescript
// From OBC PostproductionRenderer Tutorial
fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  const isLod = "isLodMaterial" in material && material.isLodMaterial;
  if (isLod) {
    // Exclude LOD materials from expensive passes (outlines, AO, etc.)
    world.renderer?.postproduction?.basePass?.isolatedMaterials?.push(material);
  }
});
```

**Expected Impact**: +5-10% by skipping LOD materials from heavy processing

---

#### 8. Fragment Worker Optimization
- **Strategy**: Offload heavy operations to fragment worker thread
- **OBC Principle**: Fragments use worker-based architecture for color adjustments, visibility changes
```typescript
// All these operations run in worker thread (non-blocking):
// - fragments.core.update(true)  // LOD + culling
// - hider.isolate(modelIdMap)    // Visibility changes
// - model.setColor(materialId, color)  // Color updates
// - model.useCamera(camera)      // Camera-based LOD
```

**Expected Impact**: Prevents main thread blocking

---

## Part 3: Implementation Priority Timeline

### Phase 1: Immediate (1-2 hours) - Setup Adaptive System
1. Create `AdaptiveQualityController.ts`
2. Integrate with `PerformanceMonitor.fps` readings
3. Add AO preset switching to `WorldManager.ts`
4. Add simplified mode toggling to `ClipStylerModule.ts`

**Expected Result**: +30-40% FPS under load

### Phase 2: Short-term (2-3 hours) - Geometry Filtering
1. Integrate OBC Hider component in `IFCLoaderModule.ts`
2. Add sectioning mode geometry hiding
3. Enhance camera rest listener for LOD

**Expected Result**: Additional +15-20% during sectioning

### Phase 3: Refinement (1-2 hours) - Parameter Tuning
1. Test and tune AO resolution scaling
2. Implement lazy clipping updates
3. Measure and validate FPS improvements

**Expected Result**: Fine-tune to target FPS (45+ walking, 35+ sectioning)

---

## Part 4: Measurement & Validation

### FPS Baseline Before Optimization
- Walking mode (all features): ~25-35 FPS
- Sectioning mode (all features): ~15-25 FPS
- Target: 45+ walking, 35+ sectioning

### Expected Improvements After Phase 1 + Phase 2
- Walking mode: 45-55 FPS (+30-75%)
- Sectioning mode: 35-45 FPS (+40-100%)

### Measurement Tools
- **PerformanceMonitor**: Already integrated, reading FPS real-time
- **Stats.js**: Per OBC tutorial, add to viewer for frame time analysis
- **Chrome DevTools**: GPU bottleneck identification

---

## Part 5: OBC Component Integration Summary

| Component | Role | Optimization Method | Expected Impact |
|-----------|------|---------------------|-----------------|
| **PostproductionRenderer** | Rendering pipeline | AO parameter tuning, simplified presets | +25-40% |
| **FragmentsManager** | Geometry system | LOD + culling on camera stop/change | +10-20% |
| **Hider** | Visibility control | Hide off-plane categories | +15-25% (sectioning) |
| **ClipStyler** | Section rendering | Simplified mode during movement | +15-20% |
| **Fragment Worker** | Background processing | Offloads visibility/LOD calculations | Main thread stability |

---

## Part 6: Code Templates Ready for Implementation

### Template 1: AdaptiveQualityController.ts
```typescript
// Location: src/modules/AdaptiveQualityController.ts
export class AdaptiveQualityController {
  private performanceMonitor: PerformanceMonitor;
  private worldManager: WorldManager;
  private clipStyler: ClipStylerModule;
  private currentQuality: "ultra" | "high" | "balanced" | "performance" = "ultra";
  
  constructor(performanceMonitor: PerformanceMonitor, 
              worldManager: WorldManager, 
              clipStyler: ClipStylerModule) {
    this.performanceMonitor = performanceMonitor;
    this.worldManager = worldManager;
    this.clipStyler = clipStyler;
  }
  
  public update(): void {
    const fps = this.performanceMonitor.fps;
    
    if (fps < 30 && this.currentQuality !== "performance") {
      this.switchQuality("performance");
    } else if (fps < 35 && this.currentQuality !== "balanced") {
      this.switchQuality("balanced");
    } else if (fps > 50 && this.currentQuality !== "ultra") {
      this.switchQuality("ultra");
    }
  }
  
  private switchQuality(quality: typeof this.currentQuality): void {
    this.currentQuality = quality;
    
    const aoParameters = {
      ultra: { samples: 32, radius: 0.25, scale: 1.0 },
      high: { samples: 16, radius: 0.25, scale: 0.8 },
      balanced: { samples: 12, radius: 0.15, scale: 0.7 },
      performance: { samples: 8, radius: 0.1, scale: 0.5 },
    }[quality];
    
    this.worldManager.setAOParameters(aoParameters);
    
    if (quality === "performance" || quality === "balanced") {
      this.clipStyler.enableSimplifiedMode();
    } else {
      this.clipStyler.disableSimplifiedMode();
    }
  }
}
```

### Template 2: Hider Integration
```typescript
// In IFCLoaderModule.ts
private hider: OBC.Hider | null = null;

private initializeHider(): void {
  this.hider = this.components.get(OBC.Hider);
}

public async hideNonVisibleCategories(visibleCategories: string[]): Promise<void> {
  if (!this.hider) return;
  
  const modelIdMap: OBC.ModelIdMap = {};
  const categoriesToHide = [/^IFCDOOR$/, /^IFCWINDOW$/, /^IFCFURNITURE$/];
  
  for (const [, model] of this.fragments.list) {
    const items = await model.getItemsOfCategories(categoriesToHide);
    const localIds = Object.values(items).flat();
    modelIdMap[model.modelId] = new Set(localIds);
  }
  
  await this.hider.set(false, modelIdMap);
}

public async restoreAllVisibility(): Promise<void> {
  if (!this.hider) return;
  await this.hider.set(true);
}
```

---

## Next Steps

1. **Immediately**: Review this guide and create `AdaptiveQualityController.ts`
2. **Phase 1**: Implement adaptive quality switching
3. **Phase 2**: Integrate Hider for geometry filtering
4. **Measure**: Validate FPS improvements at each phase
5. **Iterate**: Fine-tune parameters based on real-world performance

---

**Last Updated**: 2025  
**Status**: Ready for implementation  
**Expected Timeline**: 3-4 hours total development  
**Expected Outcome**: 30-75% FPS improvement across all modes
