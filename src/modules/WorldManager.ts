/**
 * World Manager Module
 * 
 * This module handles the creation and management of the 3D world environment.
 * It sets up:
 * - Scene: The 3D container where all objects live
 * - Camera: The viewpoint from which we see the scene (Orthographic/Perspective)
 * - Renderer: The engine that draws the 3D scene to the canvas (with postproduction effects)
 * - Grid: Visual reference grid in the scene
 * - Lights: Illumination for the 3D objects
 * - Postproduction: Advanced rendering effects (AO, outlines, etc.)
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';

export class WorldManager {
  private components: OBC.Components;
  public world: OBC.World | null = null;
  private grid: OBC.SimpleGrid | null = null;
  private headlight: THREE.DirectionalLight | null = null;

  constructor() {
    // Initialize the main components instance
    // This is the central hub for all OBC components
    this.components = new OBC.Components();
  }

  /**
   * Creates and initializes the 3D world
   * @param container - The HTML element where the 3D scene will be rendered
   * @returns The created world instance
   */
  public async createWorld(container: HTMLElement): Promise<OBC.World> {
    // Get the Worlds manager component
    const worlds = this.components.get(OBC.Worlds);

    // Create a new world with PostproductionRenderer for advanced graphics
    this.world = worlds.create<
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBF.PostproductionRenderer
    >();

    // Initialize the scene with default setup (lights, background, etc.)
    this.world.scene = new OBC.SimpleScene(this.components);
    const simpleScene = this.world.scene as OBC.SimpleScene;
    simpleScene.setup();
    
    // Make background transparent (optional - can be customized)
    const sceneThree = simpleScene.three as THREE.Scene;
    sceneThree.background = new THREE.Color(0x202932);

    // Setup the PostproductionRenderer for advanced graphics
    this.world.renderer = new OBF.PostproductionRenderer(this.components, container);

    // Setup the camera (after renderer is created)
    this.world.camera = new OBC.OrthoPerspectiveCamera(this.components);
    
    // Add a headlight (directional light attached to camera) to ensure visibility from all angles
    // This fixes the issue where one side of a corridor is dark
    this.headlight = new THREE.DirectionalLight(0xffffff, 0.5);
    this.headlight.position.set(0, 0, 1); // Pointing forward from camera
    this.world.camera.three.add(this.headlight);
    sceneThree.add(this.world.camera.three); // Add camera to scene so the light works

    // Initialize all components (must be done before enabling postproduction or camera controls)
    await this.components.init();
    
    // Enable postproduction effects (after components.init())
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    renderer.postproduction.enabled = true;
    
    // Set postproduction style to COLOR_PEN (shows outlines with color)
    // PostproductionAspect: 0=COLOR, 1=PEN, 2=PEN_SHADOWS, 3=COLOR_PEN, 4=COLOR_SHADOWS, 5=COLOR_PEN_SHADOWS
    renderer.postproduction.style = 4; // Cast shadow effect like Revit
    
    // Set initial camera position and target (after components.init())
    const camera = this.world.camera as OBC.OrthoPerspectiveCamera;
    await camera.controls.setLookAt(78, 20, -2.2, 26, -4, 25);

    // Add a visual grid to the scene for reference
    const grids = this.components.get(OBC.Grids);
    this.grid = grids.create(this.world);

    console.log('✅ World created successfully');
    return this.world;
  }

  /**
   * Updates the scene background color
   * @param color - THREE.js Color object or hex string
   */
  public setBackgroundColor(color: THREE.Color | string): void {
    if (!this.world?.scene) return;
    
    const sceneThree = this.world.scene.three as THREE.Scene;
    if (typeof color === 'string') {
      sceneThree.background = new THREE.Color(color);
    } else {
      sceneThree.background = color;
    }
  }

  /**
   * Updates lighting intensity
   * @param directional - Intensity of directional light (0-10)
   * @param ambient - Intensity of ambient light (0-5)
   */
  public setLightingIntensity(directional: number, ambient: number): void {
    if (!this.world?.scene) return;
    
    const simpleScene = this.world.scene as OBC.SimpleScene;
    simpleScene.config.directionalLight.intensity = directional;
    simpleScene.config.ambientLight.intensity = ambient;

    // Update headlight intensity (keep it proportional, e.g., 50% of main directional)
    if (this.headlight) {
      this.headlight.intensity = directional * 0.5;
    }
  }

  /**
   * Gets the components instance for use by other modules
   */
  public getComponents(): OBC.Components {
    return this.components;
  }

  /**
   * Sets the camera navigation mode
   * @param mode - Navigation mode: "Orbit" (default 3D), "FirstPerson" (walk through), or "Plan" (2D)
   */
  public async setNavigationMode(mode: "Orbit" | "FirstPerson" | "Plan"): Promise<void> {
    if (!this.world?.camera) return;
    const camera = this.world.camera as OBC.OrthoPerspectiveCamera;
    await camera.set(mode);
    console.log(`✅ Navigation mode set to: ${mode}`);
  }

  /**
   * Gets the current camera navigation mode
   * @returns Current navigation mode
   */
  public getNavigationMode(): "Orbit" | "FirstPerson" | "Plan" | null {
    if (!this.world?.camera) return null;
    const camera = this.world.camera as OBC.OrthoPerspectiveCamera;
    return camera.mode.id as "Orbit" | "FirstPerson" | "Plan";
  }

  /**
   * Toggles grid visibility
   * @param visible - True to show grid, false to hide
   */
  public setGridVisible(visible: boolean): void {
    if (!this.grid) return;
    this.grid.three.visible = visible;
    console.log(`✅ Grid ${visible ? 'shown' : 'hidden'}`);
  }

  /**
   * Gets current grid visibility state
   * @returns True if grid is visible, false otherwise
   */
  public isGridVisible(): boolean {
    if (!this.grid) return false;
    return this.grid.three.visible;
  }

  /**
   * Toggles Ambient Occlusion effect only (keeps other postproduction effects active)
   * @param enabled - True to enable AO, false to disable
   */
  public setAmbientOcclusion(enabled: boolean): void {
    if (!this.world?.renderer) return;
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    
    // Toggle only the AO pass, not all postproduction
    const aoPass = (renderer.postproduction as any).aoPass;
    if (aoPass) {
      aoPass.enabled = enabled;
    }
    
    console.log(`✅ Ambient Occlusion ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Gets current Ambient Occlusion state
   * @returns True if AO is enabled, false otherwise
   */
  public isAmbientOcclusionEnabled(): boolean {
    if (!this.world?.renderer) return false;
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    const aoPass = (renderer.postproduction as any).aoPass;
    return aoPass ? aoPass.enabled : false;
  }

  /**
   * Updates Ambient Occlusion parameters
   * @param params - AO parameters (radius, samples, etc.)
   */
  public updateAOParameters(params: {
    radius?: number;
    distanceExponent?: number;
    thickness?: number;
    scale?: number;
    samples?: number;
    distanceFallOff?: number;
    screenSpaceRadius?: boolean;
  }): void {
    if (!this.world?.renderer) return;
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    
    // Update GTAO material parameters
    const aoPass = renderer.postproduction.aoPass;
    if (aoPass && aoPass.updateGtaoMaterial) {
      aoPass.updateGtaoMaterial(params);
      console.log('✅ AO parameters updated');
    }
  }

  /**
   * Enables/disables selection outlines effect
   * @param enabled - True to enable outlines, false to disable
   */
  public setOutlinesEnabled(enabled: boolean): void {
    if (!this.world?.renderer) return;
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    renderer.postproduction.outlinesEnabled = enabled;
    console.log(`✅ Selection outlines ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Checks if selection outlines are enabled
   * @returns True if outlines are enabled
   */
  public isOutlinesEnabled(): boolean {
    if (!this.world?.renderer) return false;
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    return renderer.postproduction.outlinesEnabled;
  }

  /**
   * Sets the outline color and thickness
   * @param color - Hex color string (e.g., '#BCF124' for green) or THREE.Color
   * @param thickness - Thickness of the outline (default: 3)
   */
  public setOutlineStyle(color: string | THREE.Color, thickness: number = 3): void {
    if (!this.world?.renderer) return;
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    
    const threeColor = typeof color === 'string' ? new THREE.Color(color) : color;
    const outlinePass = renderer.postproduction.outlinePass;
    outlinePass.outlineColor = threeColor;
    outlinePass.thickness = thickness;
    
    console.log(`✅ Outline style set: color=#${threeColor.getHexString()}, thickness=${thickness}`);
  }

  /**
   * Sets the postproduction visual style
   * @param style - PostproductionAspect enum value (COLOR, PEN, COLOR_PEN, etc.)
   */
  public setPostproductionStyle(style: number): void {
    if (!this.world?.renderer) return;
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    renderer.postproduction.style = style;
    console.log(`✅ Postproduction style set to: ${style}`);
  }

  /**
   * Configures the global edge detection (Pen) effect
   * @param color - Color of the edges (hex number, e.g. 0x000000)
   * @param opacity - Opacity of the edges (0-1)
   * @param tolerance - Sensitivity of edge detection (default 1)
   */
  public setGlobalEdgeSettings(color: number = 0x000000, opacity: number = 1, tolerance: number = 1): void {
    if (!this.world?.renderer) return;
    const renderer = this.world.renderer as OBF.PostproductionRenderer;
    
    // Access custom effects (using any to bypass potential type missing)
    const effects = (renderer.postproduction as any).customEffects;
    if (effects) {
      if (effects.outlineColor !== undefined) effects.outlineColor = color;
      if (effects.outlineOpacity !== undefined) effects.outlineOpacity = opacity;
      if (effects.tolerance !== undefined) effects.tolerance = tolerance;
      console.log('✅ Global edge settings updated');
    }
  }

  /**
   * Cleanup method - MUST be called when disposing the viewer
   * This prevents memory leaks by properly disposing Three.js resources
   */
  public dispose(): void {
    if (this.world) {
      this.world.dispose();
    }
    this.components.dispose();
    console.log('✅ World disposed successfully');
  }
}
