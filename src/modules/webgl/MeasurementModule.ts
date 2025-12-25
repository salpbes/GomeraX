/**
 * MEASUREMENT MODULE (The "Tape Measure")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is your digital toolbox for measuring things. You can click two 
 * points to see the distance, click multiple points to find an area, or 
 * even calculate the volume of a space.
 * 
 * HOW IT CONNECTS:
 * - WorldManager: Uses the 3D scene to detect where you are clicking.
 * - ToolbarHandlers: Activated when you click the ruler icon on the menu.
 * --------------------------------------------------------------------------------
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { WorldManager } from './WorldManager';
import { ClipperModule } from './ClipperModule';

export enum MeasurementMode {
  LENGTH = 'LENGTH',
  AREA = 'AREA',
  VOLUME = 'VOLUME',
  DISABLED = 'DISABLED'
}

export class MeasurementModule {
  private components: OBC.Components;
  private world: OBC.World | null = null;
  private lengthMeasurer: OBF.LengthMeasurement | null = null;
  private areaMeasurer: OBF.AreaMeasurement | null = null;
  private volumeMeasurer: OBF.VolumeMeasurement | null = null;
  private currentMode: MeasurementMode = MeasurementMode.DISABLED;
  private container: HTMLElement | null = null;
  private measurementColor: THREE.Color = new THREE.Color('#FF0000'); // Bright red for maximum visibility
  private clipperModule: ClipperModule | null = null;
  
  // Visual enhancement features
  private snapIndicator: THREE.Mesh | null = null;
  private perpendicularGuides: THREE.Group | null = null;
  private showPerpendicularGuides: boolean = true;
  private lastMeasurementPoint: THREE.Vector3 | null = null;
  
  // Store markers by measurement ID (line.id) for cleanup
  private markersByMeasurement: Map<string, THREE.Mesh[]> = new Map();

  constructor(worldManager: WorldManager) {
    this.components = worldManager.getComponents();
    this.createSnapIndicator();
    this.createPerpendicularGuides();
  }

  /**
   * Creates a visual snap indicator (bright square marker)
   */
  private createSnapIndicator(): void {
    // Create a bright square geometry for snap indicator
    const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00FF00, // Bright green
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      alphaToCoverage: true
    });
    
    this.snapIndicator = new THREE.Mesh(geometry, material);
    this.snapIndicator.visible = false;
    this.snapIndicator.renderOrder = 9999; // Render on top
    console.log('✅ Snap indicator created (green 0.15 unit cube)');
  }

  /**
   * Creates perpendicular guide lines
   */
  private createPerpendicularGuides(): void {
    this.perpendicularGuides = new THREE.Group();
    
    // Create X-axis guide (red) - much more visible
    const xGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-10000, 0, 0),
      new THREE.Vector3(10000, 0, 0)
    ]);
    const xMaterial = new THREE.LineBasicMaterial({
      color: 0xFF0000,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      linewidth: 3,
      alphaToCoverage: true
    });
    const xLine = new THREE.Line(xGeometry, xMaterial);
    xLine.renderOrder = 9998;
    
    // Create Y-axis guide (green)
    const yGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -10000, 0),
      new THREE.Vector3(0, 10000, 0)
    ]);
    const yMaterial = new THREE.LineBasicMaterial({
      color: 0x00FF00,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      linewidth: 3,
      alphaToCoverage: true
    });
    const yLine = new THREE.Line(yGeometry, yMaterial);
    yLine.renderOrder = 9998;
    
    // Create Z-axis guide (blue)
    const zGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -10000),
      new THREE.Vector3(0, 0, 10000)
    ]);
    const zMaterial = new THREE.LineBasicMaterial({
      color: 0x0000FF,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      linewidth: 3,
      alphaToCoverage: true
    });
    const zLine = new THREE.Line(zGeometry, zMaterial);
    zLine.renderOrder = 9998;
    
    this.perpendicularGuides.add(xLine, yLine, zLine);
    this.perpendicularGuides.visible = false;
    this.perpendicularGuides.renderOrder = 9998;
    console.log('✅ Perpendicular guides created (RGB axis lines)');
  }

  /**
   * Initializes the measurement module
   */
  public async initialize(world: OBC.World, container: HTMLElement): Promise<void> {
    this.world = world;
    this.container = container;

    // Add visual indicators to the scene
    if (this.snapIndicator && world.scene && world.scene.three) {
      world.scene.three.add(this.snapIndicator);
      console.log('✅ Snap indicator added to scene');
    } else {
      console.warn('⚠️ Could not add snap indicator to scene');
    }
    if (this.perpendicularGuides && world.scene && world.scene.three) {
      world.scene.three.add(this.perpendicularGuides);
      console.log('✅ Perpendicular guides added to scene');
      console.log('   Guides children count:', this.perpendicularGuides.children.length);
    } else {
      console.warn('⚠️ Could not add perpendicular guides to scene');
    }

    // Initialize all measurement components
    await this.initializeLengthMeasurement();
    await this.initializeAreaMeasurement();
    await this.initializeVolumeMeasurement();

    // Set default visual appearance - thicker lines for better visibility
    this.setLineWidth(3); // Default line width is 1, we're making it 3x thicker

    // Setup event listeners
    this.setupEventListeners();
    
    // Setup mouse tracking for snap indicator
    this.setupMouseTracking();

    console.log('✅ Measurement module initialized with visual enhancements');
  }

  /**
   * Sets the clipper module reference for disabling it during measurements
   */
  public setClipperModule(clipper: ClipperModule): void {
    this.clipperModule = clipper;
    console.log('✅ Clipper module reference set in MeasurementModule');
  }

  /**
   * Initialize Length Measurement Component
   */
  private async initializeLengthMeasurement(): Promise<void> {
    if (!this.world) return;

    this.lengthMeasurer = this.components.get(OBF.LengthMeasurement);
    this.lengthMeasurer.world = this.world;
    this.lengthMeasurer.color = this.measurementColor;
    this.lengthMeasurer.enabled = false;
    this.lengthMeasurer.snappings = [FRAGS.SnappingClass.POINT];

    // Customize visual appearance
    if (this.lengthMeasurer.linesMaterial) {
      const material = this.lengthMeasurer.linesMaterial as any;
      material.linewidth = 10; // Attempt to set width (won't work due to WebGL limitations)
      material.opacity = 1.0;
      material.transparent = false;
      material.depthTest = false; // Make it always visible on top, even behind objects
      material.depthWrite = false;
      material.needsUpdate = true;
    }

    // Add event listener for new measurements
    this.lengthMeasurer.list.onItemAdded.add((line) => {
      console.log(`📏 Length measurement created: ${line.value.toFixed(2)} units`);
      
      // Customize endpoint markers to be square
      this.customizeEndpointMarkers(line);
      
      // Add X, Y, Z component labels - use timeout to wait for OBC label creation
      setTimeout(() => {
        this.addComponentLabels(line);
      }, 100);
      
      // Optional: Zoom to the measurement
      if (this.world?.camera?.controls) {
        const center = new THREE.Vector3();
        line.getCenter(center);
        const radius = line.distance() / 3;
        const sphere = new THREE.Sphere(center, radius);
        this.world.camera.controls.fitToSphere(sphere, true);
      }
    });

    console.log('✅ Length measurement initialized');
  }

  /**
   * Customize endpoint markers to be bright square boxes instead of circles
   */
  private customizeEndpointMarkers(line: any): void {
    try {
      const lineObj = line as any;
      
      // Create square box geometry for endpoints
      const createSquareMarker = (position: THREE.Vector3): THREE.Mesh => {
        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const material = new THREE.MeshBasicMaterial({
          color: 0xFF0000, // Bright red
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false
        });
        
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.renderOrder = 9999;
        return marker;
      };

      const markers: THREE.Mesh[] = [];

      // Try to replace existing endpoint markers with square boxes
      if (lineObj.start && this.world?.scene?.three) {
        const startMarker = createSquareMarker(lineObj.start);
        this.world.scene.three.add(startMarker);
        markers.push(startMarker);
        console.log('✅ Added square start marker');
      }
      
      if (lineObj.end && this.world?.scene?.three) {
        const endMarker = createSquareMarker(lineObj.end);
        this.world.scene.three.add(endMarker);
        markers.push(endMarker);
        console.log('✅ Added square end marker');
      }

      // Store markers in Map using line.id as key
      if (lineObj.id) {
        this.markersByMeasurement.set(lineObj.id, markers);
        console.log(`📍 Stored ${markers.length} markers with ID: ${lineObj.id}`);
      } else {
        console.warn('⚠️ Line object has no id property');
      }

      // Make the original endpoint markers bigger if they exist
      if (lineObj.endpointA) {
        lineObj.endpointA.scale.set(5, 5, 5);
        console.log('✅ Scaled endpointA to 5x');
      }
      if (lineObj.endpointB) {
        lineObj.endpointB.scale.set(5, 5, 5);
        console.log('✅ Scaled endpointB to 5x');
      }
      
    } catch (error) {
      console.warn('Could not customize endpoint markers:', error);
    }
  }

  /**
   * Add X, Y, Z component labels to a measurement
   */
  private addComponentLabels(line: any): void {
    try {
      const lineObj = line as any;
      
      console.log('🔍 addComponentLabels called');
      console.log('🔍 Line object properties:', Object.keys(lineObj));
      console.log('🔍 Line ID:', lineObj.id);
      
      // Calculate X, Y, Z components
      if (lineObj.start && lineObj.end) {
        const start = lineObj.start as THREE.Vector3;
        const end = lineObj.end as THREE.Vector3;
        
        const deltaX = Math.abs(end.x - start.x);
        const deltaY = Math.abs(end.y - start.y);
        const deltaZ = Math.abs(end.z - start.z);
        
        console.log(`📊 Components: X=${deltaX.toFixed(2)}, Y=${deltaY.toFixed(2)}, Z=${deltaZ.toFixed(2)}`);
        
        // Get the current unit from the measurement component
        const unit = this.lengthMeasurer?.units || 'm';
        
        // Try to find the OBC label in the scene by searching for CSS2D objects
        let labelFound = false;
        
        if (this.world?.scene?.three) {
          // Search through all scene children for CSS2D labels
          this.world.scene.three.traverse((child: any) => {
            // Check if this is a label object (CSS2DObject or similar)
            if (child.isCSS2DObject || child.type === 'CSS2DObject') {
              console.log('🔍 Found CSS2D object:', child);
              
              // Check if the label element exists and contains our measurement value
              if (child.element) {
                const elementText = child.element.textContent || '';
                const measurementValue = line.value.toFixed(2);
                
                console.log('🔍 CSS2D element text:', elementText);
                console.log('🔍 Looking for value:', measurementValue);
                
                // If this label contains our measurement value, modify it
                if (elementText.includes(measurementValue) && !child._componentsAdded) {
                  console.log('✅ Found matching label for this measurement!');
                  
                  const element = child.element;
                  const originalHTML = element.innerHTML;
                  
                  // Wrap original content and add X, Y, Z components
                  element.innerHTML = `
                    <div style="font-family: monospace; text-align: center; pointer-events: none;">
                      ${originalHTML}
                      <div style="margin-top: 4px; font-size: 10px;">
                        <div style="color: #00ff00; margin: 1px 0;">X: ${deltaX.toFixed(2)} ${unit}</div>
                        <div style="color: #ffff00; margin: 1px 0;">Y: ${deltaZ.toFixed(2)} ${unit}</div>
                        <div style="color: #00ffff; margin: 1px 0;">Z: ${deltaY.toFixed(2)} ${unit}</div>
                      </div>
                    </div>
                  `;
                  
                  // Mark this label as modified to avoid duplicate additions
                  child._componentsAdded = true;
                  labelFound = true;
                  
                  console.log('✅ Successfully modified OBC label with X,Y,Z components');
                }
              }
            }
          });
        }
        
        if (!labelFound) {
          console.warn('⚠️ Could not find OBC label element, falling back to sprite');
          // Fallback: create sprite as before
          const center = new THREE.Vector3();
          center.addVectors(start, end).multiplyScalar(0.5);
          center.y -= 0.3;
          
          const label = this.createTextSprite(deltaX, deltaY, deltaZ, unit);
          label.position.copy(center);
          
          if (this.world?.scene?.three) {
            this.world.scene.three.add(label);
            if (!lineObj._customLabels) lineObj._customLabels = [];
            lineObj._customLabels.push(label);
            console.log('✅ Added X, Y, Z component label as sprite (fallback)');
          }
        }
      } else {
        console.warn('⚠️ Start or end point missing');
      }
      
    } catch (error) {
      console.warn('❌ Could not add component labels:', error);
    }
  }

  /**
   * Create a text sprite for labels with colored components in a stacked column
   */
  private createTextSprite(deltaX: number, deltaY: number, deltaZ: number, unit: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    
    // Set canvas size for vertical stacking
    canvas.width = 200;
    canvas.height = 90;
    
    // Configure text style - smaller font
    context.font = 'Bold 16px monospace';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    
    // Clear canvas - fully transparent
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw colored text components vertically
    const x = 5;
    let y = 5;
    const lineHeight = 28;
    
    // X component (green)
    context.fillStyle = '#00ff00';
    context.fillText(`X: ${deltaX.toFixed(2)} ${unit}`, x, y);
    y += lineHeight;
    
    // Y component (red)
    context.fillStyle = '#ff6b6b';
    context.fillText(`Y: ${deltaY.toFixed(2)} ${unit}`, x, y);
    y += lineHeight;
    
    // Z component (blue)
    context.fillStyle = '#4dabf7';
    context.fillText(`Z: ${deltaZ.toFixed(2)} ${unit}`, x, y);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create sprite material with no background
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 1.0,
      sizeAttenuation: true // Scale with distance
    });
    
    // Create sprite
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.5, 0.45, 1); // Smaller scale for compact display
    sprite.renderOrder = 9997; // Render on top
    
    return sprite;
  }

  /**
   * Initialize Area Measurement Component
   */
  private async initializeAreaMeasurement(): Promise<void> {
    if (!this.world) return;

    this.areaMeasurer = this.components.get(OBF.AreaMeasurement);
    this.areaMeasurer.world = this.world;
    this.areaMeasurer.color = this.measurementColor;
    this.areaMeasurer.enabled = false;

    // Customize visual appearance
    if (this.areaMeasurer.linesMaterial) {
      this.areaMeasurer.linesMaterial.linewidth = 3; // Make lines thicker
    }

    // Add event listener for new measurements
    this.areaMeasurer.list.onItemAdded.add((area) => {
      console.log(`📐 Area measurement created: ${area.value.toFixed(2)} sq units`);
    });

    console.log('✅ Area measurement initialized');
  }

  /**
   * Initialize Volume Measurement Component
   */
  private async initializeVolumeMeasurement(): Promise<void> {
    if (!this.world) return;

    this.volumeMeasurer = this.components.get(OBF.VolumeMeasurement);
    this.volumeMeasurer.world = this.world;
    this.volumeMeasurer.color = this.measurementColor;
    this.volumeMeasurer.enabled = false;

    // Customize visual appearance
    if (this.volumeMeasurer.linesMaterial) {
      this.volumeMeasurer.linesMaterial.linewidth = 3; // Make lines thicker
    }

    // Add event listener for new measurements
    this.volumeMeasurer.list.onItemAdded.add(async (volume) => {
      const value = await volume.getValue();
      console.log(`📦 Volume measurement created: ${value.toFixed(2)} cubic units`);
    });

    console.log('✅ Volume measurement initialized');
  }

  /**
   * Setup event listeners for measurement interactions
   */
  private setupEventListeners(): void {
    if (!this.container) return;

    // Double-click to create measurement
    this.container.addEventListener('dblclick', () => {
      this.createMeasurement();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (event) => {
      // Delete measurement with Delete or Backspace
      if (event.code === 'Delete' || event.code === 'Backspace') {
        this.deleteCurrentMeasurement();
      }

      // Finish area/volume measurement with Enter
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        this.endAreaOrVolumeMeasurement();
      }

      // Escape to cancel current measurement
      if (event.code === 'Escape') {
        this.cancelCurrentMeasurement();
      }
    });

    console.log('✅ Measurement event listeners setup');
  }

  /**
   * Setup mouse tracking for snap indicator and perpendicular guides
   */
  private setupMouseTracking(): void {
    if (!this.container || !this.world) return;

    console.log('🔧 Setting up mouse tracking for visual indicators...');

    this.container.addEventListener('mousemove', (event) => {
      // Always show indicators when a measurement mode is active
      if (this.currentMode === MeasurementMode.DISABLED) {
        this.hideSnapIndicator();
        this.hidePerpendicularGuides();
        return;
      }

      // Get mouse position in normalized device coordinates
      const rect = this.container!.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycast to find intersection point
      const raycaster = new THREE.Raycaster();
      const camera = this.world!.camera;
      
      if (camera && camera.three) {
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera.three);
        
        // Get all meshes in the scene
        const scene = this.world!.scene?.three;
        if (!scene) {
          console.warn('⚠️ No scene found for raycasting');
          return;
        }

        const intersects = raycaster.intersectObjects(scene.children, true);
        
        if (intersects.length > 0) {
          const point = intersects[0].point;
          this.showSnapIndicator(point);
          
          // Show perpendicular guides when in length measurement mode
          if (this.currentMode === MeasurementMode.LENGTH && this.showPerpendicularGuides) {
            this.updatePerpendicularGuides(point);
          } else {
            this.hidePerpendicularGuides();
          }
        } else {
          this.hideSnapIndicator();
          this.hidePerpendicularGuides();
        }
      }
    });

    console.log('✅ Mouse tracking setup complete');
  }

  /**
   * Show snap indicator at the given position
   */
  private showSnapIndicator(position: THREE.Vector3): void {
    if (!this.snapIndicator) {
      console.warn('⚠️ Snap indicator not initialized');
      return;
    }
    
    this.snapIndicator.position.copy(position);
    
    if (!this.snapIndicator.visible) {
      console.log('🟢 Showing snap indicator at:', position);
    }
    this.snapIndicator.visible = true;
    
    // Pulse animation for visibility
    const scale = 1 + Math.sin(Date.now() * 0.01) * 0.3;
    this.snapIndicator.scale.set(scale, scale, scale);
  }

  /**
   * Hide snap indicator
   */
  private hideSnapIndicator(): void {
    if (this.snapIndicator) {
      this.snapIndicator.visible = false;
    }
  }

  /**
   * Update perpendicular guide lines position
   */
  private updatePerpendicularGuides(position: THREE.Vector3): void {
    if (!this.perpendicularGuides) {
      console.warn('⚠️ Perpendicular guides not initialized');
      return;
    }
    
    this.perpendicularGuides.position.copy(position);
    
    if (!this.perpendicularGuides.visible) {
      console.log('📐 Showing perpendicular guides at:', position);
    }
    this.perpendicularGuides.visible = true;
    this.lastMeasurementPoint = position.clone();
  }

  /**
   * Hide perpendicular guides
   */
  private hidePerpendicularGuides(): void {
    if (this.perpendicularGuides) {
      this.perpendicularGuides.visible = false;
    }
  }

  /**
   * Toggle perpendicular guides on/off
   */
  public togglePerpendicularGuides(): void {
    this.showPerpendicularGuides = !this.showPerpendicularGuides;
    if (!this.showPerpendicularGuides) {
      this.hidePerpendicularGuides();
    }
    console.log(`📐 Perpendicular guides ${this.showPerpendicularGuides ? 'enabled' : 'disabled'}`);
  }

  /**
   * Sets the measurement mode
   */
  public setMode(mode: MeasurementMode): void {
    // Disable clipper when activating any measurement mode
    if (mode !== MeasurementMode.DISABLED && this.clipperModule) {
      const wasClipperEnabled = this.clipperModule.getEnabled();
      if (wasClipperEnabled) {
        this.clipperModule.setEnabled(false);
        console.log('✂️ Clipper disabled automatically (measurement mode active)');
      }
    }

    // Disable all measurers first
    if (this.lengthMeasurer) this.lengthMeasurer.enabled = false;
    if (this.areaMeasurer) this.areaMeasurer.enabled = false;
    if (this.volumeMeasurer) this.volumeMeasurer.enabled = false;

    this.currentMode = mode;

    // Enable the selected measurer
    switch (mode) {
      case MeasurementMode.LENGTH:
        if (this.lengthMeasurer) {
          this.lengthMeasurer.enabled = true;
          console.log('📏 Length measurement mode enabled');
        }
        break;
      case MeasurementMode.AREA:
        if (this.areaMeasurer) {
          this.areaMeasurer.enabled = true;
          console.log('📐 Area measurement mode enabled');
        }
        break;
      case MeasurementMode.VOLUME:
        if (this.volumeMeasurer) {
          this.volumeMeasurer.enabled = true;
          console.log('📦 Volume measurement mode enabled');
        }
        break;
      case MeasurementMode.DISABLED:
        console.log('🚫 Measurement disabled');
        break;
    }
  }

  /**
   * Gets the current measurement mode
   */
  public getMode(): MeasurementMode {
    return this.currentMode;
  }

  /**
   * Creates a measurement based on the current mode
   */
  private createMeasurement(): void {
    switch (this.currentMode) {
      case MeasurementMode.LENGTH:
        if (this.lengthMeasurer) {
          this.lengthMeasurer.create();
        }
        break;
      case MeasurementMode.AREA:
        if (this.areaMeasurer) {
          this.areaMeasurer.create();
        }
        break;
      case MeasurementMode.VOLUME:
        if (this.volumeMeasurer) {
          this.volumeMeasurer.create();
        }
        break;
    }
  }

  /**
   * Deletes the measurement under the cursor
   */
  private deleteCurrentMeasurement(): void {
    switch (this.currentMode) {
      case MeasurementMode.LENGTH:
        if (this.lengthMeasurer) {
          // Store all current measurements before delete
          const measurementsBefore = new Set(this.lengthMeasurer.list);
          console.log(`📊 Measurements before delete: ${measurementsBefore.size}`);
          
          // Trigger the delete
          this.lengthMeasurer.delete();
          
          // After a brief delay, compare to find which was deleted
          setTimeout(() => {
            const measurementsAfter = this.lengthMeasurer?.list;
            console.log(`📊 Measurements after delete: ${measurementsAfter?.size}`);
            
            // Find the deleted measurement by comparing sets
            measurementsBefore.forEach((measurement) => {
              if (!measurementsAfter?.has(measurement)) {
                console.log(`🗑️ Found deleted measurement, cleaning up`);
                const lineObj = measurement as any;
                if (lineObj.id && this.markersByMeasurement.has(lineObj.id)) {
                  const markers = this.markersByMeasurement.get(lineObj.id)!;
                  console.log(`🗑️ Cleaning up ${markers.length} markers with ID: ${lineObj.id}`);
                  
                  for (const marker of markers) {
                    if (this.world?.scene?.three) {
                      this.world.scene.three.remove(marker);
                      marker.geometry.dispose();
                      (marker.material as THREE.Material).dispose();
                    }
                  }
                  
                  this.markersByMeasurement.delete(lineObj.id);
                  console.log('✅ Custom markers cleaned up');
                }
              }
            });
          }, 50);
        }
        break;
      case MeasurementMode.AREA:
        if (this.areaMeasurer) {
          console.log('🗑️ Deleting area measurement');
          this.areaMeasurer.delete();
        }
        break;
      case MeasurementMode.VOLUME:
        if (this.volumeMeasurer) {
          console.log('🗑️ Deleting volume measurement');
          this.volumeMeasurer.delete();
        }
        break;
    }
  }

  /**
   * Ends area or volume measurement creation
   */
  private endAreaOrVolumeMeasurement(): void {
    if (this.currentMode === MeasurementMode.AREA && this.areaMeasurer) {
      this.areaMeasurer.endCreation();
    } else if (this.currentMode === MeasurementMode.VOLUME && this.volumeMeasurer) {
      this.volumeMeasurer.endCreation();
    }
  }

  /**
   * Cancels the current measurement creation
   */
  private cancelCurrentMeasurement(): void {
    if (this.currentMode === MeasurementMode.AREA && this.areaMeasurer) {
      this.areaMeasurer.cancelCreation();
    } else if (this.currentMode === MeasurementMode.VOLUME && this.volumeMeasurer) {
      this.volumeMeasurer.cancelCreation();
    }
  }

  /**
   * Clears all measurements
   */
  public clearAll(): void {
    // Clean up all custom markers from the Map
    if (this.world?.scene?.three && this.markersByMeasurement.size > 0) {
      console.log(`🧹 Cleaning up ${this.markersByMeasurement.size} measurements with custom markers`);
      
      for (const [id, markers] of this.markersByMeasurement.entries()) {
        console.log(`🗑️ Removing ${markers.length} markers for measurement: ${id}`);
        for (const marker of markers) {
          this.world.scene.three.remove(marker);
          marker.geometry.dispose();
          (marker.material as THREE.Material).dispose();
        }
      }
      
      // Clear the entire map
      this.markersByMeasurement.clear();
      console.log('✅ All custom markers cleaned up');
    }
    
    // Clear all measurements from OBC
    if (this.lengthMeasurer) {
      this.lengthMeasurer.list.clear();
    }
    if (this.areaMeasurer) {
      this.areaMeasurer.list.clear();
    }
    if (this.volumeMeasurer) {
      this.volumeMeasurer.list.clear();
    }
    console.log('🗑️ All measurements cleared');
  }

  /**
   * Clears measurements for a specific mode
   */
  public clearMode(mode: MeasurementMode): void {
    switch (mode) {
      case MeasurementMode.LENGTH:
        if (this.lengthMeasurer) {
          this.lengthMeasurer.list.clear();
        }
        break;
      case MeasurementMode.AREA:
        if (this.areaMeasurer) {
          this.areaMeasurer.list.clear();
        }
        break;
      case MeasurementMode.VOLUME:
        if (this.volumeMeasurer) {
          this.volumeMeasurer.list.clear();
        }
        break;
    }
    console.log(`🗑️ ${mode} measurements cleared`);
  }

  /**
   * Gets all length measurements
   */
  public getAllLengths(): number[] {
    if (!this.lengthMeasurer) return [];
    
    const lengths: number[] = [];
    for (const line of this.lengthMeasurer.list) {
      lengths.push(line.value);
    }
    return lengths;
  }

  /**
   * Gets all area measurements
   */
  public getAllAreas(): number[] {
    if (!this.areaMeasurer) return [];
    
    const areas: number[] = [];
    for (const area of this.areaMeasurer.list) {
      areas.push(area.value);
    }
    return areas;
  }

  /**
   * Gets all volume measurements
   */
  public async getAllVolumes(): Promise<number[]> {
    if (!this.volumeMeasurer) return [];
    
    const volumes: number[] = [];
    for (const volume of this.volumeMeasurer.list) {
      const value = await volume.getValue();
      volumes.push(value);
    }
    return volumes;
  }

  /**
   * Gets measurement counts
   */
  public getMeasurementCounts(): { length: number; area: number; volume: number } {
    return {
      length: this.lengthMeasurer?.list.size || 0,
      area: this.areaMeasurer?.list.size || 0,
      volume: this.volumeMeasurer?.list.size || 0,
    };
  }

  /**
   * Sets the color for measurements
   */
  public setColor(color: string | THREE.Color): void {
    const newColor = typeof color === 'string' ? new THREE.Color(color) : color;
    this.measurementColor = newColor;

    if (this.lengthMeasurer) this.lengthMeasurer.color = newColor;
    if (this.areaMeasurer) this.areaMeasurer.color = newColor;
    if (this.volumeMeasurer) this.volumeMeasurer.color = newColor;
  }

  /**
   * Sets the line width for all measurements
   * Note: WebGL linewidth support is limited. This may not work on all browsers/platforms.
   */
  public setLineWidth(width: number): void {
    console.log(`📏 Attempting to set measurement line width to: ${width}`);
    
    if (this.lengthMeasurer && this.lengthMeasurer.linesMaterial) {
      const material = this.lengthMeasurer.linesMaterial as any;
      const props = Object.keys(material);
      console.log('Length material properties:', props);
      console.log('Material type:', material.type);
      console.log('Current linewidth:', material.linewidth);
      
      // Try different properties
      if (material.linewidth !== undefined) {
        material.linewidth = width;
        console.log('✅ Set linewidth to:', width);
      }
      if (material.resolution !== undefined) {
        // For Line2Material, resolution affects rendering
        material.resolution.set(window.innerWidth, window.innerHeight);
        console.log('✅ Updated resolution');
      }
      if (material.thickness !== undefined) {
        material.thickness = width;
        console.log('✅ Set thickness to:', width);
      }
      if (material.lineWidth !== undefined) {
        material.lineWidth = width;
        console.log('✅ Set lineWidth (capital W) to:', width);
      }
      material.needsUpdate = true;
    }
    
    if (this.areaMeasurer && this.areaMeasurer.linesMaterial) {
      const material = this.areaMeasurer.linesMaterial as any;
      if (material.linewidth !== undefined) material.linewidth = width;
      if (material.thickness !== undefined) material.thickness = width;
      if (material.lineWidth !== undefined) material.lineWidth = width;
      material.needsUpdate = true;
    }
    
    if (this.volumeMeasurer && this.volumeMeasurer.linesMaterial) {
      const material = this.volumeMeasurer.linesMaterial as any;
      if (material.linewidth !== undefined) material.linewidth = width;
      if (material.thickness !== undefined) material.thickness = width;
      if (material.lineWidth !== undefined) material.lineWidth = width;
      material.needsUpdate = true;
    }
  }

  /**
   * Sets the unit for length measurements
   */
  public setLengthUnit(unit: 'mm' | 'cm' | 'm' | 'km'): void {
    if (this.lengthMeasurer) {
      this.lengthMeasurer.units = unit;
      console.log(`📏 Length unit set to: ${unit}`);
    }
  }

  /**
   * Sets the unit for area measurements
   */
  public setAreaUnit(unit: 'mm2' | 'cm2' | 'm2' | 'km2'): void {
    if (this.areaMeasurer) {
      this.areaMeasurer.units = unit;
      console.log(`📐 Area unit set to: ${unit}`);
    }
  }

  /**
   * Sets the unit for volume measurements
   */
  public setVolumeUnit(unit: 'mm3' | 'cm3' | 'm3' | 'km3'): void {
    if (this.volumeMeasurer) {
      this.volumeMeasurer.units = unit;
      console.log(`📦 Volume unit set to: ${unit}`);
    }
  }

  /**
   * Gets available units for length measurements
   */
  public getLengthUnits(): string[] {
    return this.lengthMeasurer?.unitsList || [];
  }

  /**
   * Gets available units for area measurements
   */
  public getAreaUnits(): string[] {
    return this.areaMeasurer?.unitsList || [];
  }

  /**
   * Gets available units for volume measurements
   */
  public getVolumeUnits(): string[] {
    return this.volumeMeasurer?.unitsList || [];
  }

  /**
   * Exports all measurements to JSON
   */
  public async exportMeasurements(): Promise<string> {
    const data = {
      timestamp: new Date().toISOString(),
      measurements: {
        length: {
          unit: this.lengthMeasurer?.units || 'm',
          values: this.getAllLengths(),
          count: this.getAllLengths().length,
        },
        area: {
          unit: this.areaMeasurer?.units || 'm²',
          values: this.getAllAreas(),
          count: this.getAllAreas().length,
        },
        volume: {
          unit: this.volumeMeasurer?.units || 'm³',
          values: await this.getAllVolumes(),
          count: (await this.getAllVolumes()).length,
        },
      },
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Displays rectangular dimensions for length measurements
   */
  public displayRectangularDimensions(): void {
    if (!this.lengthMeasurer) return;
    
    for (const dimension of this.lengthMeasurer.lines) {
      dimension.displayRectangularDimensions();
    }
    console.log('📐 Rectangular dimensions displayed');
  }

  /**
   * Hides rectangular dimensions for length measurements
   */
  public hideRectangularDimensions(): void {
    if (!this.lengthMeasurer) return;
    
    for (const dimension of this.lengthMeasurer.lines) {
      dimension.rectangleDimensions.clear();
    }
    console.log('🚫 Rectangular dimensions hidden');
  }

  /**
   * Cleanup and dispose resources
   */
  public dispose(): void {
    this.clearAll();
    this.setMode(MeasurementMode.DISABLED);
    
    // Clean up visual indicators
    if (this.snapIndicator && this.world?.scene?.three) {
      this.world.scene.three.remove(this.snapIndicator);
      this.snapIndicator.geometry.dispose();
      (this.snapIndicator.material as THREE.Material).dispose();
      this.snapIndicator = null;
    }
    
    if (this.perpendicularGuides && this.world?.scene?.three) {
      this.world.scene.three.remove(this.perpendicularGuides);
      this.perpendicularGuides.children.forEach((child) => {
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.perpendicularGuides = null;
    }
    
    // Clean up custom markers and labels (sprites)
    if (this.lengthMeasurer) {
      for (const line of this.lengthMeasurer.list) {
        const lineObj = line as any;
        
        // Clean up markers
        if (lineObj._customMarkers && this.world?.scene?.three) {
          for (const marker of lineObj._customMarkers) {
            this.world.scene.three.remove(marker);
            marker.geometry.dispose();
            (marker.material as THREE.Material).dispose();
          }
          lineObj._customMarkers = [];
        }
        
        // Clean up labels (sprites)
        if (lineObj._customLabels && this.world?.scene?.three) {
          for (const label of lineObj._customLabels) {
            this.world.scene.three.remove(label);
            if (label.material) {
              if (label.material.map) {
                label.material.map.dispose();
              }
              label.material.dispose();
            }
          }
          lineObj._customLabels = [];
        }
      }
    }
    
    console.log('🗑️ Measurement module disposed');
  }
}
