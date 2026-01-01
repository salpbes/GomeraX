import * as OBC from '@thatopen/components';
import type { IFCViewer } from '../../IFCViewer';
import { AIBimActions } from './ai/AIBimActions';
import { AIRuleEngine } from './ai/AIRuleEngine';
import { AIIntentEngine } from './ai/AIIntentEngine';
import { ConversationContext } from './ai/ConversationContext';
import { ConversationalEngine } from './ai/ConversationalEngine';
import { WebLLMEngine, type BIMFunctionCall } from './ai/WebLLMEngine';

export class AIAssistantModule {
  private actions: AIBimActions;
  private ruleEngine: AIRuleEngine;
  private intentEngine: AIIntentEngine;
  private context: ConversationContext;
  private conversational: ConversationalEngine;
  private webLLM: WebLLMEngine;
  private useWebLLM: boolean = false;

  constructor(private viewer: IFCViewer) {
    const components = viewer.worldManager.getComponents();
    this.actions = new AIBimActions(viewer);
    this.context = new ConversationContext();
    this.ruleEngine = new AIRuleEngine(this.actions, components);
    this.intentEngine = new AIIntentEngine(this.actions, this.context);
    this.conversational = new ConversationalEngine(this.context);
    this.webLLM = new WebLLMEngine();
  }

  /**
   * Pre-loads the AI model
   */
  public async loadModel(onProgress?: (progress: number) => void): Promise<void> {
    await this.intentEngine.loadModel(onProgress);
  }

  /**
   * Initialize WebLLM (optional, user-activated)
   */
  public async initializeWebLLM(
    onProgress?: (progress: { text: string; progress: number }) => void
  ): Promise<void> {
    try {
      await this.webLLM.initialize(onProgress);
      this.useWebLLM = true;
      console.log("WebLLM initialized - conversational AI enabled!");
    } catch (error) {
      console.error("Failed to initialize WebLLM:", error);
      this.useWebLLM = false;
      throw error;
    }
  }

  /**
   * Check if WebLLM is available and ready
   */
  public isWebLLMReady(): boolean {
    return this.webLLM.isLoaded();
  }

  /**
   * Check if WebLLM is currently loading
   */
  public isWebLLMLoading(): boolean {
    return this.webLLM.isLoading();
  }

  /**
   * Toggle WebLLM usage on/off
   */
  public setUseWebLLM(use: boolean): void {
    this.useWebLLM = use && this.webLLM.isLoaded();
  }

  /**
   * Get WebLLM status
   */
  public getWebLLMStatus(): { ready: boolean; loading: boolean; enabled: boolean } {
    return {
      ready: this.webLLM.isLoaded(),
      loading: this.webLLM.isLoading(),
      enabled: this.useWebLLM,
    };
  }

  /**
   * Get WebLLM usage statistics (tokens/sec, latency, GPU info)
   */
  public async getWebLLMStats(): Promise<{
    gpu: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      prefillSpeed: string;
      decodeSpeed: string;
      latency: string;
    } | null;
  }> {
    if (!this.webLLM.isLoaded()) {
      return { gpu: "N/A", usage: null };
    }
    const gpu = await this.webLLM.getGPUInfo();
    const usage = this.webLLM.getUsageStats();
    return { gpu, usage };
  }

  /**
   * Processes a natural language command
   * Priority: WebLLM with Function Calling → Rule-based → AI Classification → Conversational
   * @param command The command string from the user
   * @param onStreamToken Optional callback for streaming responses (called for each token)
   * @returns A response object with text and AI flag
   */
  public async processCommand(
    command: string, 
    onStreamToken?: (token: string) => void
  ): Promise<{ text: string, isAI: boolean, contextInfo?: string[], actionExecuted?: string }> {
    const startTime = Date.now();
    
    // Resolve contextual references (e.g., "hide them", "zoom to it")
    const resolved = this.context.resolveContextualReferences(command);
    const commandToProcess = resolved.resolved;
    const lowerCommand = commandToProcess.toLowerCase().trim();

    // PRIORITY 1: WebLLM with Function Calling - AI decides which action to execute
    if (this.useWebLLM && this.webLLM.isLoaded()) {
      try {
        const bimContext = this.getBIMContext();
        
        // Use streaming for immediate feedback
        let streamedContent = '';
        const response = await this.webLLM.chatStreamWithActions(
          commandToProcess, 
          (token: string) => {
            streamedContent += token;
            // Only stream to UI if it's a text response (not an action)
            // We detect action pattern early to avoid showing it
            if (!streamedContent.includes('[ACTION:') && onStreamToken) {
              onStreamToken(token);
            }
          },
          bimContext, 
          true
        );
        
        // Check if AI returned a function call
        if (typeof response === 'object' && 'name' in response) {
          // AI decided to call a function - execute it
          const functionCall = response as BIMFunctionCall;
          console.log(`🤖 AI decided to call: ${functionCall.name}`, functionCall.arguments);
          
          const result = await this.executeBIMFunction(functionCall);
          
          // Generate a friendly response based on the action
          const textResponse = result.message;
          
          this.context.addEntry(command, textResponse, { 
            isAI: true, 
            executionTime: Date.now() - startTime,
            action: functionCall.name 
          });
          
          return { 
            text: textResponse, 
            isAI: true,
            contextInfo: resolved.usedContext ? resolved.contextInfo : undefined,
            actionExecuted: functionCall.name
          };
        } else {
          // AI returned a text response (conversational, no function call)
          const textResponse = response as string;
          
          this.context.addEntry(command, textResponse, { 
            isAI: true, 
            executionTime: Date.now() - startTime 
          });
          
          return { 
            text: textResponse, 
            isAI: true,
            contextInfo: resolved.usedContext ? resolved.contextInfo : undefined
          };
        }
      } catch (error) {
        console.error("WebLLM error, falling back to pattern matching:", error);
        // Continue to fallback methods
      }
    }

    // PRIORITY 2: Check if conversational (for fallback routing)
    const isConversational = this.conversational.isConversational(lowerCommand);
    
    if (isConversational) {
      // Use pre-written conversational responses
      const response = await this.conversational.getResponse(lowerCommand);
      this.context.addEntry(command, response, { isAI: true, executionTime: Date.now() - startTime });
      return { text: response, isAI: true };
    }

    // PRIORITY 3: Try local rule-based matching for BIM commands (fastest and supports multiple types)
    const actionKeywords = ['select', 'show', 'hide', 'isolate', 'unhide', 'zoom', 'focus', 'count', 'how many'];
    const typeKeywords = ['wall', 'window', 'door', 'slab', 'floor', 'column', 'pillar', 'beam', 'stair', 'member', 'furniture', 'pipe', 'duct'];
    
    const hasAction = actionKeywords.some(k => lowerCommand.includes(k));
    const hasType = typeKeywords.some(k => lowerCommand.includes(k));

    if (hasAction && hasType) {
      const result = await this.ruleEngine.handleTypeCommand(lowerCommand, this.context);
      if (result !== "I couldn't identify the element type you're looking for.") {
        const executionTime = Date.now() - startTime;
        this.context.addEntry(command, result, { isAI: false, executionTime });
        return { 
          text: result, 
          isAI: false, 
          contextInfo: resolved.usedContext ? resolved.contextInfo : undefined 
        };
      }
    }

    if (lowerCommand.includes('reset') || lowerCommand.includes('show everything') || lowerCommand.includes('unhide everything') || 
        lowerCommand.includes('normal view') || lowerCommand.includes('default view') || lowerCommand.includes('exit color') ||
        lowerCommand.includes('exit cluster') || lowerCommand.includes('back to normal') || lowerCommand.includes('go back')) {
      await this.actions.resetView();
      this.context.clear();
      // Also clear WebLLM conversation history for a fresh start
      if (this.webLLM.isLoaded()) {
        this.webLLM.clearHistory();
      }
      const response = "I've reset the view for you. Everything is visible, color splash and cluster modes are disabled, and selection is cleared.";
      this.context.addEntry(command, response, { action: 'reset', isAI: false });
      return { text: response, isAI: false };
    }

    if (lowerCommand.includes('hide everything') || lowerCommand.includes('hide all elements')) {
      await this.actions.hideEverything();
      return { text: "I've hidden everything in the model.", isAI: false };
    }

    if (lowerCommand.includes('clear selection') || lowerCommand.includes('deselect')) {
      await this.actions.clearSelection();
      this.context.setLastSelection([], 0, new Map());
      const response = "I've cleared the selection for you.";
      this.context.addEntry(command, response, { action: 'clear', isAI: false });
      return { text: response, isAI: false };
    }

    if (lowerCommand.includes('color by type') || lowerCommand.includes('show colors') || lowerCommand.includes('toggle colors') ||
        lowerCommand.includes('color elements') || lowerCommand.includes('color the elements') ||
        lowerCommand.includes('color by category') || lowerCommand.includes('colors by type') ||
        (lowerCommand.includes('color') && lowerCommand.includes('type')) ||
        (lowerCommand.includes('color') && lowerCommand.includes('category'))) {
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

    // PRIORITY 4: If rules fail, try the DistilBERT AI model
    if (!this.intentEngine.hasModel() && !this.intentEngine.getIsLoading()) {
      return { text: "I'm still warming up my brain. Please try again in a few seconds, or use simple commands like 'Select all walls'.", isAI: false };
    }

    if (this.intentEngine.getIsLoading()) {
      return { text: "I'm currently downloading my AI model (this only happens once). Please wait a moment...", isAI: false };
    }

    const aiResponse = await this.intentEngine.processWithAI(commandToProcess);
    const executionTime = Date.now() - startTime;
    this.context.addEntry(command, aiResponse, { isAI: true, executionTime });
    
    return { 
      text: aiResponse, 
      isAI: true,
      contextInfo: resolved.usedContext ? resolved.contextInfo : undefined
    };
  }

  /**
   * Execute a BIM function call from WebLLM
   */
  private async executeBIMFunction(functionCall: BIMFunctionCall): Promise<{ message: string; count?: number }> {
    const { name, arguments: args } = functionCall;
    
    console.log(`Executing BIM function: ${name}`, args);
    
    try {
      switch (name) {
        case 'selectElements': {
          const types = args.elementTypes as string[];
          let totalCount = 0;
          const countMap = new Map<string, number>();
          
          for (const type of types) {
            const count = await this.actions.selectByType(type);
            totalCount += count;
            if (count > 0) countMap.set(type, count);
          }
          
          // setLastSelection expects Map<string, Set<number>> but we only have counts
          // Pass an empty map since we don't have the actual element IDs here
          this.context.setLastSelection(types, totalCount, new Map());
          
          if (totalCount === 0) {
            return { message: `I couldn't find any ${types.join(', ')} in the model.`, count: 0 };
          }
          
          const typeDetails = Array.from(countMap.entries())
            .map(([type, count]) => `${count} ${type.replace('IFC', '').toLowerCase()}${count !== 1 ? 's' : ''}`)
            .join(', ');
          
          return { 
            message: `I've selected ${typeDetails} for you.`,
            count: totalCount
          };
        }
        
        case 'hideElements': {
          const types = args.elementTypes as string[];
          let totalCount = 0;
          
          for (const type of types) {
            const count = await this.actions.setVisibilityByType(type, false);
            totalCount += count;
          }
          
          if (totalCount === 0) {
            return { message: `I couldn't find any ${types.join(', ')} to hide.`, count: 0 };
          }
          
          return { message: `I've hidden ${totalCount} element${totalCount !== 1 ? 's' : ''}.`, count: totalCount };
        }
        
        case 'showElements': {
          const types = args.elementTypes as string[];
          let totalCount = 0;
          
          for (const type of types) {
            const count = await this.actions.setVisibilityByType(type, true);
            totalCount += count;
          }
          
          if (totalCount === 0) {
            return { message: `I couldn't find any ${types.join(', ')} to show.`, count: 0 };
          }
          
          return { message: `I've shown ${totalCount} element${totalCount !== 1 ? 's' : ''}.`, count: totalCount };
        }
        
        case 'isolateElements': {
          const types = args.elementTypes as string[];
          let totalCount = 0;
          
          for (const type of types) {
            const count = await this.actions.isolateByType(type);
            totalCount += count;
          }
          
          if (totalCount === 0) {
            return { message: `I couldn't find any ${types.join(', ')} to isolate.`, count: 0 };
          }
          
          return { message: `I've isolated ${totalCount} element${totalCount !== 1 ? 's' : ''}.`, count: totalCount };
        }
        
        case 'zoomToElements': {
          const types = args.elementTypes as string[];
          let totalCount = 0;
          
          for (const type of types) {
            const count = await this.actions.zoomToType(type);
            totalCount += count;
          }
          
          if (totalCount === 0) {
            return { message: `I couldn't find any ${types.join(', ')} to zoom to.`, count: 0 };
          }
          
          return { message: `I've zoomed to ${totalCount} element${totalCount !== 1 ? 's' : ''}.`, count: totalCount };
        }
        
        case 'countElements': {
          const types = args.elementTypes as string[];
          const counts = new Map<string, number>();
          
          for (const type of types) {
            const idsByModel = await this.actions.getIdsByType(type);
            let count = 0;
            for (const ids of idsByModel.values()) {
              count += ids.size;
            }
            if (count > 0) counts.set(type, count);
          }
          
          if (counts.size === 0) {
            return { message: `I couldn't find any ${types.join(', ')} in the model.`, count: 0 };
          }
          
          const details = Array.from(counts.entries())
            .map(([type, count]) => `${count} ${type.replace('IFC', '').toLowerCase()}${count !== 1 ? 's' : ''}`)
            .join(', ');
          
          return { message: `I found ${details} in the model.`, count: Array.from(counts.values()).reduce((a, b) => a + b, 0) };
        }
        
        case 'resetView': {
          await this.actions.resetView();
          this.context.clear();
          // Also clear WebLLM history for a fresh start
          if (this.webLLM.isLoaded()) {
            this.webLLM.clearHistory();
          }
          return { message: "I've reset the view. Everything is visible, color splash and cluster modes are off, and selection is cleared." };
        }
        
        case 'clearSelection': {
          await this.actions.clearSelection();
          this.context.setLastSelection([], 0, new Map());
          return { message: "I've cleared the selection." };
        }
        
        case 'colorByType': {
          await this.actions.colorByType();
          return { message: "I've applied colors by element type. Each category now has its own color!" };
        }
        
        case 'addClippingPlane': {
          await this.actions.addClippingPlane();
          return { message: "I've added a clipping plane. You can move it to see inside the model." };
        }
        
        case 'setView': {
          const view = args.view as 'top' | 'front' | 'back' | 'left' | 'right' | 'iso';
          await this.actions.setStandardView(view);
          return { message: `Switched to ${view} view.` };
        }
        
        case 'fitView': {
          await this.actions.fitAll();
          return { message: "I've fitted the view to the entire model." };
        }
        
        case 'zoom': {
          const direction = args.direction as 'in' | 'out';
          const delta = direction === 'in' ? 2 : -2;
          await this.actions.zoom(delta);
          return { message: `Zoomed ${direction}.` };
        }
        
        default:
          return { message: `Unknown function: ${name}` };
      }
    } catch (error) {
      console.error(`Error executing function ${name}:`, error);
      return { message: `Sorry, I encountered an error executing ${name}.` };
    }
  }

  /**
   * Gets the conversation context
   */
  public getContext(): ConversationContext {
    return this.context;
  }

  /**
   * Gets context-aware suggestions for the user
   */
  public getSuggestions(): string[] {
    return this.context.getSuggestions();
  }

  /**
   * Get BIM context for AI prompts
   */
  private getBIMContext() {
    const lastSelection = this.context.getLastSelection();
    const lastAction = this.context.getLastAction();
    
    return {
      selectedCount: lastSelection?.count || 0,
      elementTypes: lastSelection?.elementTypes || [],
      lastAction: lastAction?.action || undefined,
    };
  }

  /**
   * Clear conversation history in WebLLM
   */
  public clearWebLLMHistory(): void {
    if (this.webLLM.isLoaded()) {
      this.webLLM.clearHistory();
    }
  }

  /**
   * Check if WebGPU is supported in this browser
   */
  public static async checkWebGPUSupport(): Promise<boolean> {
    return WebLLMEngine.isWebGPUSupported();
  }

  /**
   * Get WebLLM model information
   */
  public static getWebLLMModelInfo() {
    return WebLLMEngine.getModelInfo();
  }

  /**
   * Silently detect and execute BIM actions from user command
   * This is the "serverless MCP" - AI responds, rule-based system executes
   * @param lowerCommand The lowercase command to analyze
   * @returns Action result or null if no action detected
   */
  private async executeDetectedAction(
    lowerCommand: string
  ): Promise<{ action: string; count?: number } | null> {
    try {
      // Element type keywords and their IFC mappings
      const typeMap: Record<string, string> = {
        'wall': 'IFCWALL',
        'walls': 'IFCWALL',
        'door': 'IFCDOOR',
        'doors': 'IFCDOOR',
        'window': 'IFCWINDOW',
        'windows': 'IFCWINDOW',
        'slab': 'IFCSLAB',
        'slabs': 'IFCSLAB',
        'floor': 'IFCSLAB',
        'floors': 'IFCSLAB',
        'column': 'IFCCOLUMN',
        'columns': 'IFCCOLUMN',
        'pillar': 'IFCCOLUMN',
        'pillars': 'IFCCOLUMN',
        'beam': 'IFCBEAM',
        'beams': 'IFCBEAM',
        'stair': 'IFCSTAIR',
        'stairs': 'IFCSTAIR',
        'staircase': 'IFCSTAIR',
        'roof': 'IFCROOF',
        'roofs': 'IFCROOF',
        'furniture': 'IFCFURNISHINGELEMENT',
        'pipe': 'IFCPIPESEGMENT',
        'pipes': 'IFCPIPESEGMENT',
        'duct': 'IFCDUCTSEGMENT',
        'ducts': 'IFCDUCTSEGMENT',
        'member': 'IFCMEMBER',
        'members': 'IFCMEMBER',
      };

      // Detect element types mentioned
      const detectedTypes: string[] = [];
      for (const [keyword, ifcType] of Object.entries(typeMap)) {
        if (lowerCommand.includes(keyword) && !detectedTypes.includes(ifcType)) {
          detectedTypes.push(ifcType);
        }
      }

      // Detect action and execute
      if (lowerCommand.includes('select') && detectedTypes.length > 0) {
        let totalCount = 0;
        for (const type of detectedTypes) {
          const count = await this.actions.selectByType(type);
          totalCount += count;
        }
        this.context.setLastSelection(detectedTypes, totalCount, new Map());
        console.log(`[Hybrid] Executed: select ${detectedTypes.join(', ')} (${totalCount} elements)`);
        return { action: 'select', count: totalCount };
      }

      if (lowerCommand.includes('hide') && detectedTypes.length > 0) {
        let totalCount = 0;
        for (const type of detectedTypes) {
          const count = await this.actions.setVisibilityByType(type, false);
          totalCount += count;
        }
        console.log(`[Hybrid] Executed: hide ${detectedTypes.join(', ')} (${totalCount} elements)`);
        return { action: 'hide', count: totalCount };
      }

      if ((lowerCommand.includes('show') || lowerCommand.includes('unhide')) && detectedTypes.length > 0) {
        let totalCount = 0;
        for (const type of detectedTypes) {
          const count = await this.actions.setVisibilityByType(type, true);
          totalCount += count;
        }
        console.log(`[Hybrid] Executed: show ${detectedTypes.join(', ')} (${totalCount} elements)`);
        return { action: 'show', count: totalCount };
      }

      if (lowerCommand.includes('isolate') && detectedTypes.length > 0) {
        let totalCount = 0;
        for (const type of detectedTypes) {
          const count = await this.actions.isolateByType(type);
          totalCount += count;
        }
        console.log(`[Hybrid] Executed: isolate ${detectedTypes.join(', ')} (${totalCount} elements)`);
        return { action: 'isolate', count: totalCount };
      }

      if ((lowerCommand.includes('zoom') || lowerCommand.includes('focus')) && detectedTypes.length > 0) {
        let totalCount = 0;
        for (const type of detectedTypes) {
          const count = await this.actions.zoomToType(type);
          totalCount += count;
        }
        console.log(`[Hybrid] Executed: zoom to ${detectedTypes.join(', ')} (${totalCount} elements)`);
        return { action: 'zoom', count: totalCount };
      }

      // Non-element actions
      if (lowerCommand.includes('reset') || lowerCommand.includes('show everything') || 
          lowerCommand.includes('normal view') || lowerCommand.includes('default view') ||
          lowerCommand.includes('go back') || lowerCommand.includes('exit color') || 
          lowerCommand.includes('exit cluster') || lowerCommand.includes('back to normal')) {
        await this.actions.resetView();
        this.context.clear();
        // Also clear WebLLM conversation history
        if (this.webLLM.isLoaded()) {
          this.webLLM.clearHistory();
        }
        console.log('[Hybrid] Executed: reset view');
        return { action: 'reset' };
      }

      if (lowerCommand.includes('hide everything') || lowerCommand.includes('hide all')) {
        await this.actions.hideEverything();
        console.log('[Hybrid] Executed: hide everything');
        return { action: 'hideAll' };
      }

      if (lowerCommand.includes('clear selection') || lowerCommand.includes('deselect')) {
        await this.actions.clearSelection();
        this.context.setLastSelection([], 0, new Map());
        console.log('[Hybrid] Executed: clear selection');
        return { action: 'clearSelection' };
      }

      if (lowerCommand.includes('color by type') || lowerCommand.includes('show colors') || lowerCommand.includes('toggle colors') ||
          lowerCommand.includes('color elements') || lowerCommand.includes('color the elements') ||
          lowerCommand.includes('color by category') || lowerCommand.includes('colors by type') ||
          (lowerCommand.includes('color') && lowerCommand.includes('type')) ||
          (lowerCommand.includes('color') && lowerCommand.includes('category'))) {
        await this.actions.colorByType();
        console.log('[Hybrid] Executed: color by type');
        return { action: 'colorByType' };
      }

      if (lowerCommand.includes('clip') || lowerCommand.includes('section') || lowerCommand.includes('cut')) {
        await this.actions.addClippingPlane();
        console.log('[Hybrid] Executed: add clipping plane');
        return { action: 'clip' };
      }

      if (lowerCommand.includes('fit') || lowerCommand.includes('fit view')) {
        await this.actions.fitAll();
        console.log('[Hybrid] Executed: fit view');
        return { action: 'fit' };
      }

      if (lowerCommand.includes('zoom in')) {
        await this.actions.zoom(2);
        console.log('[Hybrid] Executed: zoom in');
        return { action: 'zoomIn' };
      }

      if (lowerCommand.includes('zoom out')) {
        await this.actions.zoom(-2);
        console.log('[Hybrid] Executed: zoom out');
        return { action: 'zoomOut' };
      }

      if (lowerCommand.includes('top view') || lowerCommand.includes('from top')) {
        await this.actions.setStandardView('top');
        console.log('[Hybrid] Executed: top view');
        return { action: 'topView' };
      }

      if (lowerCommand.includes('front view') || lowerCommand.includes('from front')) {
        await this.actions.setStandardView('front');
        console.log('[Hybrid] Executed: front view');
        return { action: 'frontView' };
      }

      if (lowerCommand.includes('iso') || lowerCommand.includes('isometric')) {
        await this.actions.setStandardView('iso');
        console.log('[Hybrid] Executed: isometric view');
        return { action: 'isoView' };
      }

      // No action detected
      return null;
    } catch (error) {
      console.error('[Hybrid] Error executing detected action:', error);
      return null;
    }
  }
}
