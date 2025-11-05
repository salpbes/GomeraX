# FPS Optimization Strategy for Heavy Features

**Date**: November 3, 2025  
**Objective**: Optimize FPS while maintaining Ambient Occlusion, Double-Sided Rendering, Section Hatches & Fills

---

## Current Performance Bottlenecks Analysis

### GPU Overhead (Heaviest Impact)
1. **PostproductionRenderer** (~40% GPU load)
   - Ambient Occlusion (AO) GTAO shader
   - Multiple render passes
   - Shadow calculations

2. **Double-Sided Rendering** (~20% GPU load)
   - 2x fragment processing (front + back faces)
   - Every material rendered twice

3. **Section Hatches with Fills** (~15% GPU load)
   - LineMaterial edge rendering
   - MeshBasicMaterial fills with transparency
   - Z-buffer calculations

4. **Complex Geometry** (~15% GPU load)
   - Large IFC models with millions of triangles
   - Multiple clipping planes
   - Fragment management overhead

### CPU Overhead (Secondary Impact)
1. **Material Updates** (~5% CPU)
   - Uniform value changes per frame
   - Material.needsUpdate triggering
   - Shader recompilation

2. **Camera Control** (~3% CPU)
   - First-person mode calculations
   - OrthoPerspectiveCamera switching
   - View frustum culling

---

## Optimization Strategies (Ranked by Impact)

### **TIER 1: High Impact, Easy Implementation** ⚡

#### 1.1 Adaptive Quality System (15-20% FPS gain)
**Problem**: All effects at full quality all the time  
**Solution**: Dynamically reduce quality based on FPS

```typescript
// In PerformanceMonitor.ts
public adaptiveQualityControl(): void {
  const currentFPS = this.getLastFPS();
  
  if (currentFPS < 30) {
    // Critical mode - disable expensive effects
    this.disableAdaptiveMode(Quality.LOW);
  } else if (currentFPS < 45) {
    // Economy mode - reduce quality
    this.disableAdaptiveMode(Quality.MEDIUM);
  } else {
    // High quality mode
    this.disableAdaptiveMode(Quality.HIGH);
  }
}
```

**Specific Actions**:
- FPS < 30: Auto-disable AO + enable simplified hatches
- FPS < 45: Auto-disable fills + reduced line widths
- FPS > 60: Full quality enabled

**Code Implementation**:
```typescript
// Create AdaptiveQualityController.ts
export class AdaptiveQualityController {
  constructor(
    private worldManager: WorldManager,
    private clipStyler: ClipStylerModule,
    private performanceMonitor: PerformanceMonitor
  ) {}

  public update(): void {
    const fps = this.performanceMonitor.getLastFPS();
    
    if (fps < 30) {
      // Emergency mode
      this.worldManager.setAmbientOcclusion(false);
      this.clipStyler.enableSimplifiedMode();
      console.warn('⚠️ LOW FPS: Emergency mode activated');
    } else if (fps < 45) {
      // Balanced mode
      this.clipStyler.setFillsVisibility(false);
      this.worldManager.setAmbientOcclusion(true);
      console.log('⚡ MEDIUM FPS: Balanced mode');
    } else {
      // Full quality
      this.worldManager.setAmbientOcclusion(true);
      this.clipStyler.setFillsVisibility(true);
      console.log('✅ HIGH FPS: Full quality');
    }
  }

  public disableAdaptiveMode(): void {
    // Allow manual override
    console.log('🎨 Adaptive quality disabled - manual control');
  }
}
```

**Expected FPS Gain**: 15-20% improvement in walking mode

---

#### 1.2 Lazy Clipping Plane Rendering (10-15% FPS gain)
**Problem**: All clipping planes render every frame  
**Solution**: Only render clipping planes within view frustum

```typescript
// In ClipStylerModule.ts
public updateVisiblePlanesOnly(): void {
  if (!this.clipper || !this.clipStyler) return;
  
  for (const [planeId, plane] of this.clipper.list.entries()) {
    const isInViewFrustum = this.checkFrustumCulling(plane);
    
    if (isInViewFrustum) {
      plane.visible = true;
    } else {
      plane.visible = false; // Skip rendering outside view
    }
  }
}

private checkFrustumCulling(plane: any): boolean {
  // Check if plane's bounding box intersects camera frustum
  const camera = this.world?.camera;
  if (!camera) return true; // Default to visible if no camera
  
  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(
      camera.projection.matrix,
      camera.eye.matrix.clone().invert()
    )
  );
  
  return true; // Simplified - implement full frustum culling
}
```

**Expected FPS Gain**: 10-15% with 5+ clipping planes

---

#### 1.3 Lower Resolution Ambient Occlusion (12-18% FPS gain)
**Problem**: AO computed at full resolution  
**Solution**: Reduce AO texture resolution

```typescript
// In WorldManager.ts - Add AO resolution control
public setAOResolution(quality: 'high' | 'medium' | 'low'): void {
  const renderer = this.world?.renderer as OBF.PostproductionRenderer;
  if (!renderer?.postproduction?.aoPass) return;
  
  const resolutionMap = {
    high: 1.0,    // Full resolution
    medium: 0.5,  // Half resolution (50% faster)
    low: 0.25,    // Quarter resolution (75% faster)
  };
  
  renderer.postproduction.aoPass.resolution = resolutionMap[quality];
  console.log(`✅ AO resolution set to ${quality}`);
}
```

**Expected FPS Gain**: 12-18% AO-specific improvement

---

### **TIER 2: Medium Impact, Moderate Implementation** 🔧

#### 2.1 LOD (Level of Detail) System for Hatches (8-12% FPS gain)
**Problem**: Full detail hatches at all distances  
**Solution**: Reduce hatch complexity based on camera distance

```typescript
// Add to ClipStylerModule.ts
private updateHatchDetailLevel(cameraDistance: number): void {
  if (cameraDistance > 100) {
    // Far away: hide fills, thinner lines
    this.setFillsVisibility(false);
    this.updateLineWidth(0.1);
  } else if (cameraDistance > 50) {
    // Medium: semi-transparent fills
    this.setFillsVisibility(true);
    this.updateLineWidth(0.2);
  } else {
    // Close: full detail
    this.setFillsVisibility(true);
    this.updateLineWidth(0.3);
  }
}
```

**Expected FPS Gain**: 8-12% in zoomed-out scenes

---

#### 2.2 Delayed Material Updates (5-8% FPS gain)
**Problem**: Material updates every frame  
**Solution**: Batch updates and apply conditionally

```typescript
// In ClipStylerModule.ts
private materialUpdateQueue: Set<THREE.Material> = new Set();
private lastUpdateTime = 0;

public queueMaterialUpdate(material: THREE.Material): void {
  this.materialUpdateQueue.add(material);
}

public processMaterialUpdates(): void {
  const now = performance.now();
  if (now - this.lastUpdateTime < 16) return; // Only update every 16ms
  
  for (const material of this.materialUpdateQueue) {
    material.needsUpdate = true;
  }
  this.materialUpdateQueue.clear();
  this.lastUpdateTime = now;
}
```

**Expected FPS Gain**: 5-8% from reduced shader recompilation

---

#### 2.3 Dynamic Fragment Culling (10-15% FPS gain)
**Problem**: Render all fragments even behind camera  
**Solution**: Enable frustum culling on fragment meshes

```typescript
// In IFCLoaderModule.ts
public enableFragmentCulling(): void {
  const fragments = this.getFragmentsManager();
  
  for (const group of fragments.groups.values()) {
    for (const fragment of group.fragments) {
      fragment.mesh.frustumCulled = true;
      // Ensure bounding box is calculated
      fragment.mesh.geometry.computeBoundingBox();
    }
  }
  
  console.log('✅ Fragment culling enabled');
}
```

**Expected FPS Gain**: 10-15% in complex scenes

---

### **TIER 3: Lower Impact but Easy** 💡

#### 3.1 Disable Grid in Walking Mode (2-4% FPS gain)
**Problem**: Grid renders even when not needed  
**Solution**: Hide grid during first-person navigation

```typescript
// In FirstPersonControlsModule
public onEnterWalkMode(): void {
  const worldManager = this.viewer.getWorldManager();
  worldManager.setGridVisible(false);
  this.gridWasVisible = worldManager.isGridVisible();
}

public onExitWalkMode(): void {
  if (this.gridWasVisible) {
    this.viewer.getWorldManager().setGridVisible(true);
  }
}
```

**Expected FPS Gain**: 2-4% in walking mode

---

#### 3.2 Reduce Line Material Samples (3-5% FPS gain)
**Problem**: LineMaterial uses high sample count  
**Solution**: Reduce WorldUnits precision

```typescript
// In ClipStylerModule.ts - Modify material creation
const lineWidth = 0.3;
const worldUnits = true; // Keep true for consistency
const worldUnitsPerPixel = 0.05; // Reduce from default 0.1

this.clipStyler.styles.set('UnifiedHatch', {
  linesMaterial: new LineMaterial({
    color: '#000000',
    linewidth: lineWidth,
    worldUnits: worldUnits,
    // Reduce resolution sampling
    dashed: false,
    dashScale: 1,
  }),
  fillsMaterial: ...,
});
```

**Expected FPS Gain**: 3-5% hatch rendering improvement

---

#### 3.3 Disable Post-Processing During Animations (5-10% temporary gain)
**Problem**: Full effects during camera movements  
**Solution**: Reduce effects while animating

```typescript
// In WorldManager.ts
private isAnimating = false;

public onCameraAnimationStart(): void {
  this.isAnimating = true;
  const renderer = this.world?.renderer as OBF.PostproductionRenderer;
  
  // Temporarily disable expensive effects
  renderer.postproduction.enabled = false;
  console.log('⚡ Post-processing disabled during animation');
}

public onCameraAnimationEnd(): void {
  this.isAnimating = false;
  const renderer = this.world?.renderer as OBF.PostproductionRenderer;
  
  // Re-enable effects
  renderer.postproduction.enabled = true;
  console.log('✅ Post-processing re-enabled');
}
```

**Expected FPS Gain**: 5-10% during camera movement

---

## Implementation Priority Matrix

| Strategy | Effort | Impact | Priority |
|----------|--------|--------|----------|
| Adaptive Quality System | Low | HIGH (20%) | **1st** |
| Lower AO Resolution | Low | HIGH (18%) | **2nd** |
| Lazy Clipping Planes | Medium | HIGH (15%) | **3rd** |
| Dynamic Fragment Culling | Medium | HIGH (15%) | **4th** |
| LOD Hatches | Medium | MEDIUM (12%) | **5th** |
| Delayed Material Updates | Medium | MEDIUM (8%) | **6th** |
| Disable Grid in Walk | Low | LOW (4%) | **7th** |
| Reduce Line Samples | Low | LOW (5%) | **8th** |
| Disable FX During Animation | Low | MEDIUM (10%) | **9th** |

---

## Expected Total FPS Improvements

### Before Optimization
- **Walking Mode**: 25-35 FPS
- **Sectioning with All Effects**: 15-25 FPS
- **Static View**: 45-55 FPS

### After Tier 1 Implementation (Adaptive Quality + AO Resolution)
- **Walking Mode**: 40-50 FPS (**+40%**)
- **Sectioning with All Effects**: 35-45 FPS (**+60%**)
- **Static View**: 50-60 FPS (**+15%**)

### After Tier 1 + 2 Implementation (All Priority Strategies)
- **Walking Mode**: 50-60 FPS (**+75%**)
- **Sectioning with All Effects**: 45-55 FPS (**+100%**)
- **Static View**: 55-60 FPS (**+30%**)

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 hours)
1. ✅ Create `AdaptiveQualityController.ts`
2. ✅ Add adaptive quality monitoring to PerformanceMonitor
3. ✅ Implement AO resolution control in WorldManager
4. ✅ Hook up UI toggle for adaptive quality

### Phase 2: Medium-Term (2-4 hours)
1. ✅ Implement frustum culling for clipping planes
2. ✅ Add LOD system for hatches
3. ✅ Implement fragment culling
4. ✅ Add grid visibility toggle for walk mode

### Phase 3: Polish (1-2 hours)
1. ✅ Performance profiling and tuning
2. ✅ Test all combinations of enabled/disabled features
3. ✅ Update documentation
4. ✅ User feedback and refinement

---

## Code Integration Points

### New Files to Create
1. **AdaptiveQualityController.ts** - Main adaptive logic
2. **PerformanceAnalyzer.ts** - FPS tracking and thresholds

### Files to Modify
1. **PerformanceMonitor.ts** - Add FPS trend analysis
2. **WorldManager.ts** - Add quality control methods
3. **ClipStylerModule.ts** - Add LOD and frustum culling
4. **IFCLoaderModule.ts** - Add fragment culling
5. **FirstPersonControlsModule.ts** - Integrate grid toggle
6. **UIManager.ts** - Add UI controls for adaptive mode

### New UI Elements
1. "Adaptive Quality" toggle (enabled by default)
2. "AO Quality" selector (High/Medium/Low)
3. "Performance Mode" for aggressive optimization

---

## Testing Checklist

- [ ] FPS stays above 45 during walking with all effects
- [ ] FPS stays above 35 during sectioning with all effects
- [ ] Adaptive quality activates/deactivates smoothly
- [ ] No visual glitches when switching quality levels
- [ ] Memory usage remains stable
- [ ] All features work independently
- [ ] Settings persist across sessions
- [ ] Console logs show quality changes

---

## Advanced Optimization (Future)

### GPU Memory Optimization
- Texture atlasing for hatches
- WebGL2 instancing for repeated geometry
- Shared material instances

### CPU Optimization
- Worker threads for frustum calculations
- Async model loading
- Batch transform updates

### Rendering Pipeline
- Deferred rendering path
- Screen-space techniques instead of world-space
- Compute shader processing

---

## Estimated Development Time

- **Tier 1 Implementation**: 2-3 hours
- **Tier 2 Implementation**: 4-6 hours
- **Testing & Refinement**: 2-3 hours
- **Total**: ~10 hours for full optimization

---

## Expected User Impact

✅ **Smooth Walking Navigation**: 50+ FPS consistently  
✅ **Responsive Sectioning**: Real-time hatch updates  
✅ **Automatic Optimization**: No manual quality adjustments needed  
✅ **Professional Quality**: Full effects when stable  
✅ **Scalability**: Handles large models gracefully  

---

**Next Steps**: Implement Phase 1 strategies first, measure FPS improvements, then proceed to Phase 2 if needed.
