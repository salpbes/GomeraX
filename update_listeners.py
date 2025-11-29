
import os
import re

file_path = '/Users/yagmurbesher/Documents/sources/OBC-IFCViewer/src/modules/PropertiesPanelModule.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Pattern to match the entire isolateBtns block
# It starts with: // Isolate functionality
# And ends before: /**
#                   * Counts meshes in a model
#                   */

start_marker = "// Isolate functionality"
end_marker = "/**\n   * Counts meshes in a model"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Could not find the block to replace.")
    exit(1)

# The new code to insert
new_code = """    // Find functionality (Hide others)
    const findBtns = this.treeContainer.querySelectorAll('.find-btn');
    findBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLElement;
        const content = button.closest('.tree-node-content') as HTMLElement;
        if (!content) return;

        // Toggle find state
        const isFound = button.classList.contains('active-find');
        
        // Reset all isolation states
        this.resetIsolationStates();

        const modelId = content.dataset.modelId;
        const model = modelId ? this.fragmentsManager?.list.get(modelId) : null;
        const hider = this.worldManager.getComponents().get(OBC.Hider);

        // If already found, we want to exit (Show All)
        if (isFound) {
          this.showAll(model, hider);
          return;
        }

        // Otherwise, activate find
        button.classList.add('active-find');
        content.classList.add('node-found');
        button.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>';

        const idsToIsolate = this.getIdsFromContent(content);

        if (modelId && idsToIsolate.length > 0 && model && hider) {
           hider.isolate({ [modelId]: new Set(idsToIsolate) });
           this.zoomToElements(model, idsToIsolate);
        }
      });
    });

    // Ghost functionality (Isolate with transparency)
    const ghostBtns = this.treeContainer.querySelectorAll('.ghost-btn');
    ghostBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLElement;
        const content = button.closest('.tree-node-content') as HTMLElement;
        if (!content) return;

        // Toggle ghost state
        const isGhost = button.classList.contains('active-ghost');
        
        // Reset all isolation states
        this.resetIsolationStates();

        const modelId = content.dataset.modelId;
        const model = modelId ? this.fragmentsManager?.list.get(modelId) : null;
        const hider = this.worldManager.getComponents().get(OBC.Hider);
        const highlighter = this.highlighter;

        // If already ghosted, we want to exit (Show All)
        if (isGhost) {
          this.showAll(model, hider);
          return;
        }

        // Otherwise, activate ghost
        button.classList.add('active-ghost');
        content.classList.add('node-ghost');
        // button.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>';

        const idsToIsolate = this.getIdsFromContent(content);

        if (modelId && idsToIsolate.length > 0 && model && hider && highlighter) {
            try {
              // Get all items in the model
              let allIds: number[] = [];
              
              // Robust way to get all item IDs
              // @ts-ignore
              if (model.itemTypes && typeof model.itemTypes.keys === 'function') {
                 // @ts-ignore
                 allIds = Array.from(model.itemTypes.keys());
              } else if ((model as any).ids instanceof Set) {
                 allIds = Array.from((model as any).ids);
              } else if ((model as any).items instanceof Map) {
                 allIds = Array.from((model as any).items.keys());
              } else {
                 // Fallback: try getAllItemsWithGeometry
                 try {
                    const allItems = await (model as any).getAllItemsWithGeometry();
                    if (Array.isArray(allItems)) {
                        allIds = allItems;
                    } else if (allItems instanceof Set) {
                        allIds = Array.from(allItems);
                    } else if (typeof allItems === 'object') {
                        allIds = Object.values(allItems).flat() as number[];
                    }
                 } catch (e) {
                    console.warn('Could not get all items with geometry', e);
                 }
              }
              
              if (allIds.length > 0) {
                console.log(`👻 Ghost Mode: Found ${allIds.length} total items, isolating ${idsToIsolate.length} items`);
                const others = allIds.filter(id => !idsToIsolate.includes(id));
                
                // 1. Hide "others" (original meshes)
                hider.set(false, { [modelId]: new Set(others) });
                
                // 2. Ensure "selection" is visible (original meshes)
                hider.set(true, { [modelId]: new Set(idsToIsolate) });
                
                // 3. Highlight "others" with translucent style
                highlighter.clear('translucent');
                highlighter.highlightByID('translucent', { [modelId]: new Set(others) });
                
                // 4. Highlight "selection" with select style
                highlighter.clear('select');
                highlighter.highlightByID('select', { [modelId]: new Set(idsToIsolate) });
              } else {
                // Fallback if we can't get all IDs
                hider.isolate({ [modelId]: new Set(idsToIsolate) });
              }
            } catch (err) {
              console.warn('Error in ghost isolation:', err);
              hider.isolate({ [modelId]: new Set(idsToIsolate) });
            }
            
            this.zoomToElements(model, idsToIsolate);
        }
      });
    });
  }

  /**
   * Helper to reset all isolation states
   */
  private resetIsolationStates(): void {
    if (!this.treeContainer) return;
    
    // Reset find buttons
    this.treeContainer.querySelectorAll('.find-btn').forEach(b => {
      b.classList.remove('active-find');
      b.innerHTML = '<i class="fas fa-search"></i>';
    });
    
    // Reset ghost buttons
    this.treeContainer.querySelectorAll('.ghost-btn').forEach(b => {
      b.classList.remove('active-ghost');
      // b.innerHTML = '<i class="fas fa-cube"></i>';
    });
    
    // Reset node styles
    this.treeContainer.querySelectorAll('.node-found').forEach(node => {
      node.classList.remove('node-found');
    });
    this.treeContainer.querySelectorAll('.node-ghost').forEach(node => {
      node.classList.remove('node-ghost');
    });
  }

  /**
   * Helper to show all elements
   */
  private async showAll(model: any, hider: any): Promise<void> {
    if (model && hider) {
      // Show everything
      hider.set(true); // true = visible
      
      // Clear highlights
      if (this.highlighter) {
        this.highlighter.clear('select');
        this.highlighter.clear('translucent');
      }
      
      // Reset camera to fit whole model
      if (this.worldManager.world?.camera?.controls) {
         const bbox = await (model as any).getMergedBox(); // Get full model box
         if (bbox && !bbox.isEmpty()) {
           await this.worldManager.world.camera.controls.fitToBox(bbox, true);
         }
      }
    }
  }

  /**
   * Helper to get IDs from tree node content
   */
  private getIdsFromContent(content: HTMLElement): number[] {
    let ids: number[] = [];

    // Case 1: Category group OR Spatial node (has data-ids) - PREFER THIS
    if (content.dataset.ids) {
      ids = content.dataset.ids.split(',')
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));
    }
    // Case 2: Single element (fallback if no data-ids)
    else if (content.dataset.localId) {
      ids.push(parseInt(content.dataset.localId, 10));
    } 
    // Case 3: Fallback for Spatial node without data-ids
    else {
      const childElements = content.parentElement?.querySelectorAll('.element-node .tree-node-content[data-local-id]');
      childElements?.forEach(el => {
        const localId = (el as HTMLElement).dataset.localId;
        if (localId) ids.push(parseInt(localId, 10));
      });
    }
    return ids;
  }

  /**
   * Helper to zoom to elements
   */
  private async zoomToElements(model: any, ids: number[]): Promise<void> {
    if (this.worldManager.world?.camera?.controls) {
       // Use getMergedBox
       const bbox = await (model as any).getMergedBox(ids);
       if (bbox && !bbox.isEmpty()) {
         // Calculate isometric position
         const center = new THREE.Vector3();
         bbox.getCenter(center);
         const size = new THREE.Vector3();
         bbox.getSize(size);
         const maxDim = Math.max(size.x, size.y, size.z);
         const dist = maxDim * 1.5;
         
         // Isometric vector (1, 1, 1)
         const isoVector = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist);
         const cameraPos = center.clone().add(isoVector);
         
         // Set camera position and target
         await this.worldManager.world.camera.controls.setLookAt(
           cameraPos.x, cameraPos.y, cameraPos.z,
           center.x, center.y, center.z,
           true
         );
       }
    }
  }
"""

# Replace the block
new_content = content[:start_idx] + new_code + "\n\n  " + content[end_idx:]

with open(file_path, 'w') as f:
    f.write(new_content)

print("Replacement done.")
