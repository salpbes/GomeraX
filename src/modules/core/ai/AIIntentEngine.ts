import type { AIBimActions } from './AIBimActions';
import type { ConversationContext } from './ConversationContext';

export class AIIntentEngine {
  private classifier: any = null;
  private isModelLoading: boolean = false;

  constructor(private actions: AIBimActions, private context: ConversationContext) {}

  public async loadModel(onProgress?: (progress: number) => void): Promise<void> {
    if (this.classifier || this.isModelLoading) return;
    
    this.isModelLoading = true;
    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      
      if (env.backends?.onnx?.wasm) {
        (env.backends.onnx.wasm as any).proxy = false;
        (env.backends.onnx.wasm as any).numThreads = 1;
      }

      this.classifier = await pipeline('zero-shot-classification', 'Xenova/distilbert-base-uncased-mnli', {
        progress_callback: (data: any) => {
          if (data.status === 'progress' && onProgress) {
            onProgress(data.progress);
          }
        }
      });
      console.log('🤖 AI Model loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load AI model:', error);
      this.classifier = null;
    } finally {
      this.isModelLoading = false;
    }
  }

  public getIsLoading(): boolean {
    return this.isModelLoading;
  }

  public hasModel(): boolean {
    return this.classifier !== null;
  }

  public async processWithAI(command: string): Promise<string> {
    if (!this.classifier) return "I'm not ready yet.";

    const lowerCommand = command.toLowerCase();

    try {
      const actions = [
        'select elements', 'hide elements', 'show elements', 'isolate elements', 'zoom to elements', 'count elements', 
        'color by type', 'add clipping plane', 'clear selection',
        'zoom in', 'zoom out', 'fit everything', 'rotate view', 'top view', 'isometric view', 'front view'
      ];
      
      const actionResult = await this.classifier(command, actions);
      const action = actionResult.labels[0];
      const actionScore = actionResult.scores[0];

      // 1. Handle View/Global Actions first (these don't need element type classification)
      if (actionScore > 0.4) {
        if (action === 'color by type') {
          await this.actions.colorByType();
          return "AI detected you want to see colors. I've toggled the color splash view.";
        }
        if (action === 'add clipping plane') {
          await this.actions.addClippingPlane();
          return "AI detected you want to cut the model. I've added a clipping plane.";
        }
        if (action === 'clear selection') {
          await this.actions.clearSelection();
          return "AI detected you want to clear selection. Done!";
        }
        if (action === 'zoom in') {
          await this.actions.zoom(2);
          return "AI detected you want to zoom in. Done!";
        }
        if (action === 'zoom out') {
          await this.actions.zoom(-2);
          return "AI detected you want to zoom out. Done!";
        }
        if (action === 'fit everything' || lowerCommand.includes('fit') || lowerCommand.includes('screen')) {
          await this.actions.fitAll();
          return "AI detected you want to fit the view. Done!";
        }
        if (action === 'rotate view') {
          await this.actions.rotate(90);
          return "AI detected you want to rotate the view. Done!";
        }
        if (action === 'top view' || (action === 'show elements' && lowerCommand.includes('top'))) {
          await this.actions.setStandardView('top');
          return "AI detected you want the top view. Done!";
        }
        if (action === 'isometric view' || (action === 'show elements' && lowerCommand.includes('iso'))) {
          await this.actions.setStandardView('iso');
          return "AI detected you want the isometric view. Done!";
        }
        if (action === 'front view' || (action === 'show elements' && lowerCommand.includes('front'))) {
          await this.actions.setStandardView('front');
          return "AI detected you want the front view. Done!";
        }
      }

      // 2. Handle Element-specific Actions (these need type classification)
      const types = ['wall', 'window', 'door', 'slab', 'column', 'beam', 'stair', 'furniture', 'pipe', 'duct'];
      const typeResult = await this.classifier(command, types);
      const typeLabel = typeResult.labels[0];
      const typeScore = typeResult.scores[0];

      if (actionScore > 0.25 && typeScore > 0.25) {
        const typeMap: Record<string, string> = {
          'wall': 'IFCWALL',
          'window': 'IFCWINDOW',
          'door': 'IFCDOOR',
          'slab': 'IFCSLAB',
          'column': 'IFCCOLUMN',
          'beam': 'IFCBEAM',
          'stair': 'IFCSTAIR',
          'furniture': 'IFCFURNISHINGELEMENT',
          'pipe': 'IFCPIPESEGMENT',
          'duct': 'IFCDUCTSEGMENT'
        };

        const ifcType = typeMap[typeLabel];
        const label = typeLabel + 's';

        if (action === 'select elements') {
          const count = await this.actions.selectByType(ifcType);
          this.context.setLastSelection([typeLabel], count, await this.actions.getIdsByType(ifcType));
          this.context.setLastAction('select', [typeLabel], count);
          return `AI detected you want to select ${label}. I've selected ${count} for you.`;
        } else if (action === 'hide elements') {
          const count = await this.actions.setVisibilityByType(ifcType, false);
          this.context.setLastAction('hide', [typeLabel], count);
          return `AI detected you want to hide ${label}. I've hidden ${count}.`;
        } else if (action === 'show elements') {
          const count = await this.actions.setVisibilityByType(ifcType, true);
          this.context.setLastAction('show', [typeLabel], count);
          return `AI detected you want to show ${label}. I've shown ${count}.`;
        } else if (action === 'isolate elements') {
          const count = await this.actions.isolateByType(ifcType);
          this.context.setLastAction('isolate', [typeLabel], count);
          return `AI detected you want to isolate ${label}. I've isolated ${count}.`;
        } else if (action === 'zoom to elements') {
          const count = await this.actions.zoomToType(ifcType);
          this.context.setLastAction('zoom', [typeLabel], count);
          return `AI detected you want to focus on ${label}. I've zoomed to ${count} elements.`;
        } else if (action === 'count elements') {
          const idsByModel = await this.actions.getIdsByType(ifcType);
          let total = 0;
          idsByModel.forEach(ids => total += ids.size);
          this.context.setLastAction('count', [typeLabel], total);
          return `AI detected you want to count ${label}. There are ${total} in the model.`;
        }
      }

      return "I'm not 100% sure what you want. Could you try rephrasing? For example: 'Can you show me all the walls?'";
    } catch (error) {
      console.error('AI Processing error:', error);
      return "I had a little brain freeze while processing that. Try using a simpler command!";
    }
  }
}
