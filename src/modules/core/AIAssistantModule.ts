import * as OBC from '@thatopen/components';
import type { IFCViewer } from '../../IFCViewer';
import { AIBimActions } from './ai/AIBimActions';
import { AIRuleEngine } from './ai/AIRuleEngine';
import { AIIntentEngine } from './ai/AIIntentEngine';

export class AIAssistantModule {
  private actions: AIBimActions;
  private ruleEngine: AIRuleEngine;
  private intentEngine: AIIntentEngine;

  constructor(private viewer: IFCViewer) {
    const components = viewer.worldManager.getComponents();
    this.actions = new AIBimActions(viewer);
    this.ruleEngine = new AIRuleEngine(this.actions, components);
    this.intentEngine = new AIIntentEngine(this.actions);
  }

  /**
   * Pre-loads the AI model
   */
  public async loadModel(onProgress?: (progress: number) => void): Promise<void> {
    await this.intentEngine.loadModel(onProgress);
  }

  /**
   * Processes a natural language command
   * @param command The command string from the user
   * @returns A response object with text and AI flag
   */
  public async processCommand(command: string): Promise<{ text: string, isAI: boolean }> {
    const lowerCommand = command.toLowerCase().trim();

    // 1. Try local rule-based matching first (fastest and supports multiple types)
    const actionKeywords = ['select', 'show', 'hide', 'isolate', 'unhide', 'zoom', 'focus', 'count', 'how many'];
    const typeKeywords = ['wall', 'window', 'door', 'slab', 'floor', 'column', 'pillar', 'beam', 'stair', 'member', 'furniture', 'pipe', 'duct'];
    
    const hasAction = actionKeywords.some(k => lowerCommand.includes(k));
    const hasType = typeKeywords.some(k => lowerCommand.includes(k));

    if (hasAction && hasType) {
      const result = await this.ruleEngine.handleTypeCommand(lowerCommand);
      if (result !== "I couldn't identify the element type you're looking for.") {
        return { text: result, isAI: false };
      }
    }

    if (lowerCommand.includes('reset') || lowerCommand.includes('show everything') || lowerCommand.includes('unhide everything')) {
      await this.actions.resetView();
      return { text: "I've reset the view for you. Everything is visible and selection is cleared.", isAI: false };
    }

    if (lowerCommand.includes('hide everything') || lowerCommand.includes('hide all elements')) {
      await this.actions.hideEverything();
      return { text: "I've hidden everything in the model.", isAI: false };
    }

    if (lowerCommand.includes('clear selection') || lowerCommand.includes('deselect')) {
      await this.actions.clearSelection();
      return { text: "I've cleared the selection for you.", isAI: false };
    }

    if (lowerCommand.includes('color by type') || lowerCommand.includes('show colors') || lowerCommand.includes('toggle colors')) {
      await this.actions.colorByType();
      return { text: "I've toggled the color splash view for you.", isAI: false };
    }

    if (lowerCommand.includes('add clip') || lowerCommand.includes('section') || lowerCommand.includes('cut model')) {
      await this.actions.addClippingPlane();
      return { text: "I've added a clipping plane. You can move it to see inside the model.", isAI: false };
    }

    if (lowerCommand.includes('zoom in')) {
      await this.actions.zoom(2);
      return { text: "Zoomed in for you.", isAI: false };
    }

    if (lowerCommand.includes('zoom out')) {
      await this.actions.zoom(-2);
      return { text: "Zoomed out for you.", isAI: false };
    }

    if (lowerCommand.includes('fit view') || lowerCommand.includes('view fit') || lowerCommand.includes('show all') || lowerCommand.includes('fit everything') || lowerCommand.includes('fit to screen')) {
      await this.actions.fitAll();
      return { text: "I've fitted the view to the entire model.", isAI: false };
    }

    if (lowerCommand.includes('rotate')) {
      await this.actions.rotate(90);
      return { text: "Rotated the view by 90 degrees.", isAI: false };
    }

    if (lowerCommand.includes('top view') || lowerCommand.includes('top down') || (lowerCommand.includes('from') && lowerCommand.includes('top'))) {
      await this.actions.setStandardView('top');
      return { text: "Switched to top view.", isAI: false };
    }

    if (lowerCommand.includes('isometric') || lowerCommand.includes('iso view') || (lowerCommand.includes('from') && lowerCommand.includes('iso'))) {
      await this.actions.setStandardView('iso');
      return { text: "Switched to isometric view.", isAI: false };
    }

    if (lowerCommand.includes('front view') || (lowerCommand.includes('from') && lowerCommand.includes('front'))) {
      await this.actions.setStandardView('front');
      return { text: "Switched to front view.", isAI: false };
    }

    if (lowerCommand.includes('help') || lowerCommand === '?') {
      return { text: "You can ask me to:\n- 'Select walls and windows'\n- 'Hide all doors'\n- 'Zoom to columns'\n- 'How many slabs are there?'\n- 'Isolate all pipes'\n- 'Color by type'\n- 'Add a section'\n- 'Zoom in/out', 'Fit view', 'Rotate'\n- 'Top view', 'Isometric view'\n- 'Reset view' (clears selection, isolation, and sections)\n- 'Clear selection'", isAI: false };
    }

    // 2. If rules fail, try the AI model
    if (!this.intentEngine.hasModel() && !this.intentEngine.getIsLoading()) {
      return { text: "I'm still warming up my brain. Please try again in a few seconds, or use simple commands like 'Select all walls'.", isAI: false };
    }

    if (this.intentEngine.getIsLoading()) {
      return { text: "I'm currently downloading my AI model (this only happens once). Please wait a moment...", isAI: false };
    }

    const aiResponse = await this.intentEngine.processWithAI(command);
    return { text: aiResponse, isAI: true };
  }
}
