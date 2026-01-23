import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
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
  private components: OBC.Components;
  private webLLM: WebLLMEngine;
  private useWebLLM: boolean = false;
  private lastFetchedContent: string = ''; // Stores last fetched web content for follow-up questions

  constructor(private viewer: IFCViewer) {
    this.components = viewer.worldManager.getComponents();
    this.actions = new AIBimActions(viewer);
    this.context = new ConversationContext();
    this.ruleEngine = new AIRuleEngine(this.actions, this.components);
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
   * Check if thinking mode is enabled
   */
  public isThinkingEnabled(): boolean {
    return this.webLLM.isThinkingEnabled();
  }

  /**
   * Toggle thinking mode on/off
   */
  public setThinkingEnabled(enabled: boolean): void {
    this.webLLM.setThinkingEnabled(enabled);
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
  ): Promise<{ 
    text: string, 
    isAI: boolean, 
    contextInfo?: string[], 
    actionExecuted?: string,
    batchActions?: Array<{ name: string; result: string }>,
    confidence?: number
  }> {
    const startTime = Date.now();
    
    // Resolve contextual references (e.g., "hide them", "zoom to it")
    const resolved = this.context.resolveContextualReferences(command);
    const commandToProcess = resolved.resolved;
    const lowerCommand = commandToProcess.toLowerCase().trim();

    // PRIORITY 1: WebLLM with Function Calling - AI decides which action to execute
    if (this.useWebLLM && this.webLLM.isLoaded()) {
      try {
        const bimContext = await this.getBIMContext();
        
        // Use streaming for immediate feedback
        let streamedContent = '';
        let tokenBuffer = '';
        let isDefinitelyNotAction = false;
        
        const response = await this.webLLM.chatStreamWithActions(
          commandToProcess, 
          (token: string) => {
            streamedContent += token;
            
            // If we already detected it's not an action, stream directly
            if (isDefinitelyNotAction && onStreamToken) {
              onStreamToken(token);
              return;
            }
            
            // Buffer tokens until we can determine if it's an action or not
            tokenBuffer += token;
            
            // If buffer contains [ACTION:, don't stream anything
            if (tokenBuffer.includes('[ACTION:') || tokenBuffer.includes('[ACTION ')) {
              return; // Don't stream action tokens
            }
            
            // If buffer is long enough without [ACTION pattern, it's safe to stream
            // Or if the content clearly isn't starting with [ or action-like pattern
            if (tokenBuffer.length > 10 || 
                (tokenBuffer.length > 0 && !tokenBuffer.trimStart().startsWith('[') && !tokenBuffer.trimStart().toLowerCase().startsWith('action'))) {
              isDefinitelyNotAction = true;
              if (onStreamToken) {
                onStreamToken(tokenBuffer);
              }
              tokenBuffer = '';
            }
          },
          bimContext, 
          true
        );
        
        // Check if AI returned batch actions with confidence
        if (typeof response === 'object' && 'actions' in response && 'confidence' in response) {
          const batchResponse = response as { actions: BIMFunctionCall[]; confidence: number };
          console.log(`🤖 AI decided to execute ${batchResponse.actions.length} action(s) with ${batchResponse.confidence}% confidence`);
          
          const batchResults: Array<{ name: string; result: string }> = [];
          
          // Execute each action in sequence
          for (let i = 0; i < batchResponse.actions.length; i++) {
            const action = batchResponse.actions[i];
            console.log(`  [${i + 1}/${batchResponse.actions.length}] Executing: ${action.name}`);
            
            const result = await this.executeBIMFunction(action);
            batchResults.push({
              name: action.name,
              result: result.message
            });
          }
          
          // Generate summary response
          const summaryText = batchResults.length === 1 
            ? batchResults[0].result
            : `Completed ${batchResults.length} actions:\n` + 
              batchResults.map((r, i) => `${i + 1}. ${r.result}`).join('\n');
          
          this.context.addEntry(command, summaryText, { 
            isAI: true, 
            executionTime: Date.now() - startTime,
            action: batchResults.map(r => r.name).join(', ')
          });
          
          return { 
            text: summaryText, 
            isAI: true,
            contextInfo: resolved.usedContext ? resolved.contextInfo : undefined,
            actionExecuted: batchResults.length === 1 ? batchResults[0].name : undefined,
            batchActions: batchResults.length > 1 ? batchResults : undefined,
            confidence: batchResponse.confidence
          };
        }
        // Check if AI returned a single function call (backwards compatibility)
        else if (typeof response === 'object' && 'name' in response) {
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
          let types = args.elementTypes as string[];
          // Use context if no types provided (for follow-up like "select them")
          if (!types || types.length === 0) {
            const lastSelection = this.context.getLastSelection();
            if (lastSelection && lastSelection.elementTypes.length > 0) {
              types = lastSelection.elementTypes;
            }
          }
          if (!types || types.length === 0) {
            return { message: "Please specify which element types to select." };
          }
          let totalCount = 0;
          const countMap = new Map<string, number>();
          const allIdsByModel = new Map<string, Set<number>>();
          
          for (const type of types) {
            // Get the IDs for this type
            const idsByModel = await this.actions.getIdsByType(type);
            let typeCount = 0;
            
            for (const [modelId, ids] of idsByModel) {
              if (!allIdsByModel.has(modelId)) {
                allIdsByModel.set(modelId, new Set());
              }
              ids.forEach(id => allIdsByModel.get(modelId)!.add(id));
              typeCount += ids.size;
            }
            
            totalCount += typeCount;
            if (typeCount > 0) countMap.set(type, typeCount);
          }
          
          // Actually select the elements
          for (const type of types) {
            await this.actions.selectByType(type);
          }
          
          // Store the actual IDs in context for property queries
          this.context.setLastSelection(types, totalCount, allIdsByModel);
          
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

        case 'selectElementsByStorey': {
          const storeyName = args.storeyName as string;
          if (!storeyName) {
            return { message: "Please specify which storey/level to select elements from." };
          }
          
          const count = await this.actions.selectElementsByStorey(storeyName);
          
          if (count === 0) {
            return { message: `I couldn't find any elements on storey "${storeyName}".`, count: 0 };
          }
          
          // Note: For storey selection, we don't have easy access to IDs, but it's less common
          this.context.setLastSelection([`Storey: ${storeyName}`], count, new Map());
          return { 
            message: `I've selected ${count} element${count !== 1 ? 's' : ''} from storey "${storeyName}".`,
            count
          };
        }

        case 'selectElementsByStoreyAndType': {
          const storeyName = args.storeyName as string;
          const types = args.elementTypes as string[];
          
          if (!storeyName || !types || types.length === 0) {
            return { message: "Please specify both storey name and element types." };
          }
          
          const count = await this.actions.selectElementsByStoreyAndType(storeyName, types);
          
          if (count === 0) {
            const typesStr = types.map(t => t.replace('IFC', '').toLowerCase()).join(', ');
            return { message: `I couldn't find any ${typesStr} on storey "${storeyName}".`, count: 0 };
          }
          
          const typesStr = types.map(t => t.replace('IFC', '').toLowerCase()).join(', ');
          this.context.setLastSelection([`Storey: ${storeyName}`, ...types], count, new Map());
          return { 
            message: `I've selected ${count} ${typesStr} element${count !== 1 ? 's' : ''} from storey "${storeyName}".`,
            count
          };
        }
        
        case 'hideElements': {
          let types = args.elementTypes as string[];
          // Use context if no types provided (for follow-up like "hide them")
          if (!types || types.length === 0) {
            const lastSelection = this.context.getLastSelection();
            if (lastSelection && lastSelection.elementTypes.length > 0) {
              types = lastSelection.elementTypes;
            }
          }
          if (!types || types.length === 0) {
            return { message: "Please specify which element types to hide." };
          }
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
          let types = args.elementTypes as string[];
          // Use context if no types provided (for follow-up like "isolate them")
          if (!types || types.length === 0) {
            const lastSelection = this.context.getLastSelection();
            if (lastSelection && lastSelection.elementTypes.length > 0) {
              types = lastSelection.elementTypes;
            }
          }
          if (!types || types.length === 0) {
            return { message: "Please specify which element types to isolate." };
          }
          let totalCount = 0;
          
          for (const type of types) {
            const count = await this.actions.isolateByType(type);
            totalCount += count;
          }
          
          if (totalCount === 0) {
            return { message: `I couldn't find any ${types.join(', ')} to isolate.`, count: 0 };
          }
          
          // Store in context for further follow-up questions
          this.context.setLastSelection(types, totalCount, new Map());
          this.context.setLastAction('isolateElements', types, totalCount);
          return { message: `I've isolated ${totalCount} element${totalCount !== 1 ? 's' : ''}.`, count: totalCount };
        }
        
        case 'zoomToElements': {
          let types = args.elementTypes as string[];
          // Use context if no types provided (for follow-up like "zoom to them")
          if (!types || types.length === 0) {
            const lastSelection = this.context.getLastSelection();
            if (lastSelection && lastSelection.elementTypes.length > 0) {
              types = lastSelection.elementTypes;
            }
          }
          if (!types || types.length === 0) {
            return { message: "Please specify which element types to zoom to." };
          }
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
          
          const totalCount = Array.from(counts.values()).reduce((a, b) => a + b, 0);
          const details = Array.from(counts.entries())
            .map(([type, count]) => `**${count}** ${type.replace('IFC', '').toLowerCase()}${count !== 1 ? 's' : ''}`)
            .join(', ');
          
          // Store in context for follow-up questions like "where are they?"
          this.context.setLastSelection(types, totalCount, new Map());
          this.context.setLastAction('count', types, totalCount);
          
          return { message: `📊 The model contains ${details}.`, count: totalCount };
        }
        
        case 'getElementDistribution': {
          let types = args.elementTypes as string[];
          
          // If no types provided, use context from previous query
          if (!types || types.length === 0) {
            const lastSelection = this.context.getLastSelection();
            if (lastSelection && lastSelection.elementTypes.length > 0) {
              types = lastSelection.elementTypes;
              console.log(`📍 Using context types for distribution:`, types);
            } else {
              return { message: "Please specify which element types to analyze, or ask about specific elements first (e.g., 'how many windows?')." };
            }
          }
          
          const result = await this.actions.getElementDistribution(types);
          
          if (!result.success || result.distribution.length === 0) {
            const typeNames = types.map(t => t.replace('IFC', '').toLowerCase()).join(', ');
            return { message: `I couldn't find the storey distribution for ${typeNames}. They might not be assigned to storeys.` };
          }
          
          const typeNames = types.map(t => t.replace('IFC', '').toLowerCase()).join('/');
          
          // Format distribution as a list
          const distList = result.distribution.map(d => {
            const typeCounts = Object.entries(d.counts)
              .map(([t, c]) => `${c} ${t.replace('IFC', '').toLowerCase()}${c !== 1 ? 's' : ''}`)
              .join(', ');
            return `- **${d.storeyName}**: ${typeCounts}`;
          }).join('\n');
          
          // Generate summary
          const topStorey = result.distribution[0];
          const summary = result.distribution.length === 1 
            ? `All ${result.totalElements} ${typeNames} are on ${topStorey.storeyName}.`
            : `Most ${typeNames} (${topStorey.total}) are on **${topStorey.storeyName}**. They're distributed across ${result.distribution.length} floors.`;
          
          return { 
            message: `📍 **${typeNames.charAt(0).toUpperCase() + typeNames.slice(1)} Distribution by Floor**\n\n${distList}\n\n---\n\n💡 **Summary:** ${summary}`
          };
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
          const axis = (args.axis as 'x' | 'y' | 'z') || 'z';
          await this.actions.addClippingPlane(axis);
          const axisDescriptions = {
            x: 'vertical cut (left/right)',
            y: 'vertical cut (front/back)',
            z: 'horizontal cut (floor level)',
          };
          return { message: `I've added a ${axisDescriptions[axis]} clipping plane. You can drag it to move the section.` };
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

        // ============================================================================
        // NEW FUNCTIONS: Visibility
        // ============================================================================
        case 'showAll':
        case 'showAllElements': {
          await this.actions.showAllElements();
          return { message: "I've shown all elements in the model." };
        }

        case 'hideAll': {
          await this.actions.hideAll();
          return { message: "I've hidden all elements. Use 'show all' to see them again." };
        }

        case 'hideElementTypes': {
          let types = args.elementTypes as string[];
          // Use context if no types provided (for follow-up like "hide them")
          if (!types || types.length === 0) {
            const lastSelection = this.context.getLastSelection();
            if (lastSelection && lastSelection.elementTypes.length > 0) {
              types = lastSelection.elementTypes;
            }
          }
          if (!types || types.length === 0) {
            return { message: "Please specify which element types to hide." };
          }
          const count = await this.actions.hideElementTypes(types);
          const typesStr = types.map(t => t.replace('IFC', '').toLowerCase()).join(', ');
          return { message: `Hidden ${count} ${typesStr} element${count !== 1 ? 's' : ''}.`, count };
        }

        case 'showOnlyElementTypes': {
          let types = args.elementTypes as string[];
          // Use context if no types provided (for follow-up like "isolate them")
          if (!types || types.length === 0) {
            const lastSelection = this.context.getLastSelection();
            if (lastSelection && lastSelection.elementTypes.length > 0) {
              types = lastSelection.elementTypes;
            }
          }
          if (!types || types.length === 0) {
            return { message: "Please specify which element types to isolate/show." };
          }
          const count = await this.actions.showOnlyElementTypes(types);
          const typesStr = types.map(t => t.replace('IFC', '').toLowerCase()).join(', ');
          // Store in context for further follow-up questions
          this.context.setLastSelection(types, count, new Map());
          this.context.setLastAction('showOnlyElementTypes', types, count);
          return { message: `Showing only ${count} ${typesStr} element${count !== 1 ? 's' : ''}. All others are hidden.`, count };
        }

        case 'setElementTransparency': {
          const types = args.elementTypes as string[];
          const opacity = args.opacity as number;
          if (!types || types.length === 0) {
            return { message: "Please specify which element types to make transparent." };
          }
          if (opacity === undefined || opacity < 0 || opacity > 1) {
            return { message: "Please specify opacity between 0 (invisible) and 1 (opaque)." };
          }
          const count = await this.actions.setElementTransparency(types, opacity);
          const typesStr = types.map(t => t.replace('IFC', '').toLowerCase()).join(', ');
          const percent = Math.round(opacity * 100);
          return { message: `Set transparency to ${percent}% for ${count} ${typesStr} element${count !== 1 ? 's' : ''}.`, count };
        }

        // ============================================================================
        // NEW FUNCTIONS: Camera
        // ============================================================================
        case 'rotateCamera': {
          const angle = (args.angle as number) || 90;
          await this.actions.rotate(angle);
          return { message: `I've rotated the camera by ${angle} degrees.` };
        }

        case 'toggleFirstPerson': {
          await this.actions.toggleFirstPerson();
          return { message: "First-person walk mode toggled. Use WASD to move and mouse to look around. Right-click to lock/unlock the mouse." };
        }

        // ============================================================================
        // NEW FUNCTIONS: Measurement
        // ============================================================================
        case 'enableMeasurement': {
          const mode = (args.mode as 'length' | 'area' | 'volume') || 'length';
          await this.actions.enableMeasurement(mode);
          const modeDescriptions = {
            length: 'Click two points to measure the distance between them.',
            area: 'Click points to outline an area, then double-click to complete.',
            volume: 'Click points to define a volume.',
          };
          return { message: `${mode.charAt(0).toUpperCase() + mode.slice(1)} measurement enabled. ${modeDescriptions[mode]}` };
        }

        case 'disableMeasurement': {
          await this.actions.disableMeasurement();
          return { message: "Measurement mode disabled." };
        }

        case 'clearMeasurements': {
          await this.actions.clearMeasurements();
          return { message: "I've cleared all measurements from the view." };
        }

        // ============================================================================
        // NEW FUNCTIONS: Clipping
        // ============================================================================
        case 'clearClippingPlanes': {
          await this.actions.clearClippingPlanes();
          return { message: "I've removed all clipping planes." };
        }

        case 'toggleClipper': {
          const enabled = args.enabled as boolean | undefined;
          await this.actions.toggleClipper(enabled);
          return { message: enabled !== undefined 
            ? `Clipping tool ${enabled ? 'enabled' : 'disabled'}.`
            : "Clipping tool toggled." };
        }

        // ============================================================================
        // NEW FUNCTIONS: Visualization Modes
        // ============================================================================
        case 'toggleClusterView': {
          await this.actions.toggleClusterView();
          return { message: "Cluster view toggled. Elements are now organized by type into separate groups." };
        }

        case 'toggleSpaceVisibility': {
          await this.actions.toggleSpaceVisibility();
          return { message: "Space/room visibility toggled." };
        }

        // ============================================================================
        // NEW FUNCTIONS: Model Information
        // ============================================================================
        case 'getModelInfo': {
          const info = await this.actions.getModelInfo();
          return { 
            message: `**Model Information:**\n- Models loaded: ${info.modelCount}\n- Total elements: ${info.totalElements}\n- Categories: ${info.categories.length}\n\nCategories present: ${info.categories.slice(0, 10).map(c => c.replace('IFC', '')).join(', ')}${info.categories.length > 10 ? '...' : ''}`,
            count: info.totalElements
          };
        }

        case 'listElementTypes': {
          const types = await this.actions.listElementTypes();
          const cleanTypes = types.map(t => t.replace('IFC', ''));
          return { 
            message: `**Element Types in Model (${types.length}):**\n${cleanTypes.join(', ')}`,
            count: types.length
          };
        }

        case 'getStoreys': {
          const storeys = await this.actions.getStoreys();
          if (storeys.length === 0) {
            return { message: "No building storeys found in this model.", count: 0 };
          }
          const storeyList = storeys.map(s => `- ${s.name} (elevation: ${s.elevation.toFixed(2)}m)`).join('\n');
          return { 
            message: `**Building Storeys (${storeys.length}):**\n${storeyList}`,
            count: storeys.length
          };
        }

        // ============================================================================
        // NEW FUNCTIONS: Floor Plans
        // ============================================================================
        case 'showFloorPlan': {
          const storeyName = args.storeyName as string | undefined;
          const success = await this.actions.showFloorPlan(storeyName);
          if (success) {
            return { message: storeyName 
              ? `Showing floor plan for "${storeyName}". You're now in 2D plan view.`
              : "Showing floor plan. You're now in 2D plan view." };
          }
          return { message: "Couldn't show floor plan. No storeys found in the model." };
        }

        case 'exitFloorPlan': {
          await this.actions.exitFloorPlan();
          return { message: "Exited floor plan mode. Back to 3D view." };
        }

        // ============================================================================
        // NEW FUNCTIONS: Utility
        // ============================================================================
        case 'takeScreenshot': {
          const dataUrl = await this.actions.takeScreenshot();
          if (dataUrl) {
            return { message: "Screenshot saved! Check your downloads folder." };
          }
          return { message: "Couldn't take screenshot. Please try again." };
        }

        // ============================================================================
        // Web Fetching
        // ============================================================================
        case 'fetchWebPage': {
          const url = args.url as string || args.value as string;
          
          if (!url) {
            return { message: "Please provide a URL to fetch." };
          }
          
          const result = await this.actions.fetchWebPage(url);
          
          if (!result.success) {
            return { message: `I couldn't fetch that page: ${result.content}` };
          }
          
          // Store content for follow-up questions (only first chunk initially)
          this.lastFetchedContent = `\n\n[Web: ${result.title}]\n${result.content}`;
          
          // Compact UI response with disclaimer
          const charInfo = result.hasMore 
            ? `${Math.round(result.loadedChars/1000)}k of ${Math.round(result.totalChars/1000)}k chars` 
            : `${result.totalChars} chars`;
          
          return { 
            message: `📄 **${result.title}**\n_${charInfo} loaded_ · Ask me anything!\n\n---\nℹ️ **Note:** Web content is fetched from third-party sources. We are not responsible for the accuracy or reliability of external content.`
          };
        }
        
        case 'loadMoreWebContent': {
          // AI can specify how many 1k chunks to load (default 1, max 10)
          const count = Math.min(Math.max(1, Number(args.count) || 1), 10);
          const moreContent = this.actions.getMoreWebContent(count);
          
          if (!moreContent) {
            return { message: "No web page loaded. Please fetch a page first." };
          }
          
          if (!moreContent.content) {
            return { message: "All content has been loaded already." };
          }
          
          // Append to cached content
          this.lastFetchedContent = (this.lastFetchedContent || '') + moreContent.content;
          
          const loadedK = Math.round(moreContent.loadedTotal / 1000);
          const status = moreContent.hasMore ? 'More available' : 'Fully loaded';
          
          return { 
            message: `📄 Loaded ${loadedK}k chars. ${status}.`
          };
        }
        
        case 'searchWebPage': {
          const url = args.url as string;
          const searchTerms = args.searchTerms as string || args.terms as string || args.query as string;
          
          if (!url) {
            return { message: "Please provide a URL to search." };
          }
          
          if (!searchTerms) {
            return { message: "Please specify what to search for on the page." };
          }
          
          const result = await this.actions.searchWebPage(url, searchTerms);
          
          if (!result.success) {
            return { message: `I couldn't search that page: ${result.snippets[0]}` };
          }
          
          // Store snippets for context
          const snippetText = result.snippets.join('\n\n---\n\n');
          this.lastFetchedContent = `\n\n[Search "${searchTerms}" on ${result.title}]\n${snippetText}`;
          
          // Format response with relevant snippets
          const snippetDisplay = result.snippets.length > 0 
            ? result.snippets.map((s, i) => `**Snippet ${i + 1}:**\n${s.substring(0, 300)}${s.length > 300 ? '...' : ''}`).join('\n\n')
            : 'No matches found.';
          
          return { 
            message: `🔍 **${result.title}**\n_Found ${result.matchCount} relevant section(s) for "${searchTerms}"_\n\n${snippetDisplay}`
          };
        }
        
        case 'getPageSections': {
          const url = args.url as string;
          
          if (!url) {
            return { message: "Please provide a URL to get sections from." };
          }
          
          const result = await this.actions.getPageSections(url);
          
          if (!result.success || result.headers.length === 0) {
            return { message: `I couldn't find sections on that page. Try using fetchWebPage instead.` };
          }
          
          // Format headers as a numbered list for AI to choose from
          const headerList = result.headers
            .map((h, i) => `${h.index}. ${'  '.repeat(h.level - 1)}${h.heading}`)
            .join('\n');
          
          // Store headers in context for follow-up
          this.lastFetchedContent = `\n\n[Page Sections: ${result.title}]\n${headerList}`;
          
          return { 
            message: `📑 **${result.title}**\n_Found ${result.headers.length} sections. Ask me about any section:_\n\n${headerList}`
          };
        }
        
        case 'getSectionContent': {
          const indices = args.sectionIndices as number[] || args.indices as number[] || [];
          
          if (!indices || indices.length === 0) {
            return { message: "Please specify which section numbers to retrieve." };
          }
          
          const result = this.actions.getSectionContent(indices);
          
          if (!result.success || result.sections.length === 0) {
            return { message: "No sections found. Please use getPageSections first to browse available sections." };
          }
          
          // Format section content
          const sectionDisplay = result.sections
            .map(s => `**${s.heading}**\n${s.content.substring(0, 500)}${s.content.length > 500 ? '...' : ''}`)
            .join('\n\n---\n\n');
          
          // Store for context
          this.lastFetchedContent = result.sections.map(s => `[${s.heading}]\n${s.content}`).join('\n\n');
          
          return { 
            message: `📄 **Section Content**\n\n${sectionDisplay}`
          };
        }
        
        case 'smartSearch': {
          const url = args.url as string;
          const topic = args.topic as string || args.query as string || args.searchTerms as string;
          
          if (!url) {
            return { message: "Please provide a URL to search." };
          }
          
          if (!topic) {
            return { message: "Please specify what topic to search for." };
          }
          
          const result = await this.actions.smartSearch(url, topic);
          
          if (!result.success || result.matchedSections.length === 0) {
            // No matching sections found
            return { 
              message: `❌ I searched **${result.title}** but couldn't find sections about "${topic}".\n\n📋 Available sections:\n${result.allHeaders.slice(0, 8).map(h => `• ${h}`).join('\n')}${result.allHeaders.length > 8 ? '\n• ...' : ''}`
            };
          }
          
          // Format the matched sections for display and AI context
          const sectionsForContext = result.matchedSections
            .map(s => `## ${s.heading}\n${s.content}`)
            .join('\n\n');
          
          // Create a nice preview with content snippets
          const sectionPreviews = result.matchedSections.map(s => {
            const preview = s.content.substring(0, 300).trim();
            const ellipsis = s.content.length > 300 ? '...' : '';
            return `### 📌 ${s.heading}\n${preview}${ellipsis}`;
          }).join('\n\n');
          
          // Store FULL content for AI context (for summarization)
          this.lastFetchedContent = `\n\n[Research: "${topic}" from ${result.title}]\n\n${sectionsForContext}`;
          
          // Count total chars for display
          const totalChars = result.matchedSections.reduce((sum, s) => sum + s.content.length, 0);
          
          return { 
            message: `🔍 **${result.title}**\n\n_Found ${result.matchedSections.length} relevant section(s) about "${topic}" (${Math.round(totalChars/1000)}k chars):_\n\n${sectionPreviews}\n\n---\n💡 **Say "summarize" for a detailed summary of this information.**\n\nℹ️ **Note:** Web content is fetched from third-party sources. We are not responsible for the accuracy or reliability of external content.`
          };
        }

        // ============================================================================
        // PROPERTY QUERIES
        // ============================================================================
        case 'queryPropertyValues': {
          const propertyName = args.propertyName as string;
          const elementTypes = args.elementTypes as string[] | undefined;
          const storeyName = args.storeyName as string | undefined;
          
          if (!propertyName) {
            return { message: "Please specify which property to query." };
          }
          
          const result = await this.actions.queryPropertyValues(propertyName, elementTypes, storeyName);
          
          if (!result.success) {
            return { message: `I couldn't query the property "${propertyName}".` };
          }
          
          if (result.values.length === 0) {
            const typeInfo = elementTypes ? ` in ${elementTypes.map(t => t.replace('IFC', '')).join(', ')}` : '';
            return { message: `No values found for property "${propertyName}"${typeInfo}. The property might not exist or have a different name.` };
          }
          
          // Format the values as a nice list using standard markdown
          const valueList = result.values.slice(0, 10).map(v => 
            `- **${v.value}** (${v.count} element${v.count !== 1 ? 's' : ''})`
          ).join('\n');
          
          const moreInfo = result.values.length > 10 ? `\n_...and ${result.values.length - 10} more types_` : '';
          const typeInfo = elementTypes ? ` for ${elementTypes.map(t => t.replace('IFC', '')).join(', ')}` : '';
          const storeyInfo = storeyName ? ` on ${storeyName}` : '';
          
          // Generate AI analysis of the results
          const elementTypeName = elementTypes ? elementTypes.map(t => t.replace('IFC', '').toLowerCase()).join('/') : 'element';
          const analysis = this.generatePropertyAnalysis(propertyName, result.values, elementTypeName, result.totalElements);
          
          return { 
            message: `📊 **${propertyName}**${typeInfo}${storeyInfo}\n\n${valueList}${moreInfo}\n\n---\n\n${analysis}`
          };
        }
        
        case 'aggregateProperty': {
          const propertyName = args.propertyName as string;
          const aggregation = args.aggregation as 'sum' | 'average' | 'min' | 'max' | 'count';
          const elementTypes = args.elementTypes as string[] | undefined;
          const storeyName = args.storeyName as string | undefined;
          
          if (!propertyName) {
            return { message: "Please specify which property to aggregate." };
          }
          
          if (!aggregation) {
            return { message: "Please specify the aggregation type (sum, average, min, max, or count)." };
          }
          
          const result = await this.actions.aggregateProperty(propertyName, aggregation, elementTypes, storeyName);
          
          if (!result.success) {
            return { message: `I couldn't calculate the ${aggregation} of "${propertyName}".` };
          }
          
          if (result.elementsWithProperty === 0) {
            return { message: `No numeric values found for "${propertyName}". This property may not exist or may not contain numbers.` };
          }
          
          // Format the result with proper aggregation label
          const aggregationLabels: Record<string, string> = {
            sum: 'Total',
            average: 'Average',
            min: 'Minimum',
            max: 'Maximum',
            count: 'Count'
          };
          
          const label = aggregationLabels[aggregation] || aggregation;
          const unit = result.unit || '';
          const typeInfo = elementTypes ? ` for ${elementTypes.map(t => t.replace('IFC', '')).join(', ')}` : '';
          const storeyInfo = storeyName ? ` on ${storeyName}` : '';
          
          return { 
            message: `📐 **${label} ${propertyName}**${typeInfo}${storeyInfo}\n\n**${result.result.toLocaleString()}${unit ? ' ' + unit : ''}**\n\n_Based on ${result.elementsWithProperty} elements with this property_`
          };
        }
        
        case 'findElementsByProperty': {
          const propertyName = args.propertyName as string;
          const operator = args.operator as 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'notEquals';
          const value = args.value as string;
          const elementTypes = args.elementTypes as string[] | undefined;
          
          if (!propertyName || !operator || value === undefined) {
            return { message: "Please specify the property name, comparison operator, and value to search for." };
          }
          
          const result = await this.actions.findElementsByProperty(propertyName, operator, value, elementTypes);
          
          if (!result.success) {
            return { message: `I couldn't search for elements with that criteria.` };
          }
          
          if (result.count === 0) {
            const typeInfo = elementTypes ? ` among ${elementTypes.map(t => t.replace('IFC', '')).join(', ')}` : '';
            return { message: `No elements found where ${propertyName} ${operator} "${value}"${typeInfo}.` };
          }
          
          // Highlight the matching elements
          const highlighter = this.components.get(OBF.Highlighter);
          if (highlighter) {
            highlighter.clear('select');
            const selection: Record<string, Set<number>> = {};
            for (const [modelId, ids] of result.matchingElements) {
              selection[modelId] = ids;
            }
            highlighter.highlightByID('select', selection);
          }
          
          // Store selection in context for follow-up
          this.context.setLastSelection(
            elementTypes || ['filtered'],
            result.count,
            result.matchingElements
          );
          
          const operatorLabels: Record<string, string> = {
            equals: '=',
            notEquals: '≠',
            contains: 'contains',
            greaterThan: '>',
            lessThan: '<'
          };
          
          return { 
            message: `🔎 **Found ${result.count} element${result.count !== 1 ? 's' : ''}**\n\nCriteria: ${propertyName} ${operatorLabels[operator]} "${value}"\n\n_I've selected these elements in the view._`
          };
        }
        
        case 'getSelectedProperties': {
          // Get the last selection from context
          const lastSelection = this.context.getLastSelection();
          
          if (!lastSelection || lastSelection.count === 0) {
            return { message: "No elements are currently selected. Please select some elements first." };
          }
          
          const result = await this.actions.getSelectedElementProperties(lastSelection.ids);
          
          if (!result.success || result.elements.length === 0) {
            return { message: "I couldn't retrieve properties for the selected elements." };
          }
          
          // If only one element, show detailed properties
          if (result.elements.length === 1) {
            const elem = result.elements[0];
            const propList = Object.entries(elem.properties)
              .filter(([key]) => !key.startsWith('_') && !key.includes('.'))
              .slice(0, 20)
              .map(([key, value]) => `- **${key}:** ${value}`)
              .join('\n');
            
            return { 
              message: `📋 **${elem.name}** (${elem.type})\n\n${propList}${Object.keys(elem.properties).length > 20 ? '\n_...and more properties_' : ''}`
            };
          }
          
          // For multiple elements, show property summary
          const topProperties = Object.entries(result.propertyStats)
            .filter(([key]) => !key.startsWith('_') && !key.includes('.'))
            .slice(0, 15)
            .map(([key, stats]) => {
              const uniqueCount = stats.values.length;
              const sampleStr = stats.values.slice(0, 3).join(', ');
              return `- **${key}:** ${uniqueCount} unique value${uniqueCount !== 1 ? 's' : ''} (${sampleStr}${stats.values.length > 3 ? '...' : ''})`;
            })
            .join('\n');
          
          return { 
            message: `📋 **Properties of ${result.elements.length} Selected Elements**\n\n${topProperties}\n\n_${result.commonProperties.length} properties are common to all selected elements_`
          };
        }
        
        case 'listAvailableProperties': {
          const elementTypes = args.elementTypes as string[] | undefined;
          
          console.log(`📝 listAvailableProperties called with types:`, elementTypes);
          
          const result = await this.actions.listAvailableProperties(elementTypes);
          
          if (!result.success || result.properties.length === 0) {
            return { message: "I couldn't find any properties in the model." };
          }
          
          const typeInfo = elementTypes ? ` for ${elementTypes.map(t => t.replace('IFC', '')).join(', ')}` : '';
          
          // Group into categories for better readability
          const propList = result.properties.slice(0, 25).map(p => {
            const samples = p.sampleValues.slice(0, 2).join(', ');
            return `- **${p.name}** (${p.occurrences}x) - _e.g. ${samples}_`;
          }).join('\n');
          
          return { 
            message: `📝 **Available Properties${typeInfo}**\n\n${propList}${result.properties.length > 25 ? `\n\n_...and ${result.properties.length - 25} more properties_` : ''}\n\n_Sampled ${result.totalSampled} elements_`
          };
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
  private async getBIMContext() {
    const lastSelection = this.context.getLastSelection();
    const lastAction = this.context.getLastAction();
    
    // Get storey information with elevations
    let storeys: Array<{ name: string; elevation: number }> | undefined;
    try {
      storeys = await this.actions.getStoreys();
    } catch (e) {
      console.warn('Could not fetch storey data for BIM context:', e);
    }
    
    return {
      selectedCount: lastSelection?.count || 0,
      elementTypes: lastSelection?.elementTypes || [],
      lastAction: lastAction?.action || undefined,
      storeys,
      webContent: this.lastFetchedContent || undefined,
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

  /**
   * Generate AI analysis for property query results
   */
  private generatePropertyAnalysis(
    propertyName: string,
    values: Array<{ value: string | number | boolean; count: number }>,
    elementType: string,
    totalElements: number
  ): string {
    const propLower = propertyName.toLowerCase();
    const uniqueCount = values.length;
    const topValue = values[0];
    const topPercentage = Math.round((topValue.count / totalElements) * 100);
    
    // Build analysis based on property type
    let analysis = '';
    
    if (propLower === 'material' || propLower.includes('material')) {
      // Material-specific analysis
      if (uniqueCount === 1) {
        analysis = `All ${totalElements} ${elementType}s use the same material: **${topValue.value}**. This indicates a consistent material specification across the model.`;
      } else {
        const exteriorWalls = values.filter(v => 
          String(v.value).toLowerCase().includes('exterior') || 
          String(v.value).toLowerCase().includes('external')
        );
        const interiorWalls = values.filter(v => 
          String(v.value).toLowerCase().includes('interior') || 
          String(v.value).toLowerCase().includes('internal') ||
          String(v.value).toLowerCase().includes('partition')
        );
        
        if (exteriorWalls.length > 0 && interiorWalls.length > 0) {
          const extCount = exteriorWalls.reduce((sum, v) => sum + v.count, 0);
          const intCount = interiorWalls.reduce((sum, v) => sum + v.count, 0);
          analysis = `The model has **${extCount} exterior ${elementType}${extCount !== 1 ? 's' : ''}** and **${intCount} interior ${elementType}${intCount !== 1 ? 's' : ''}**. `;
          analysis += `The most common type is "${topValue.value}" (${topPercentage}% of all ${elementType}s).`;
        } else {
          analysis = `There are **${uniqueCount} different ${elementType} types** in the model. `;
          analysis += `The most common is "${topValue.value}" with ${topValue.count} elements (${topPercentage}%).`;
        }
        
        // Add insulation/stud info if detected
        const insulatedWalls = values.filter(v => 
          String(v.value).toLowerCase().includes('insul')
        );
        if (insulatedWalls.length > 0) {
          const insulCount = insulatedWalls.reduce((sum, v) => sum + v.count, 0);
          analysis += ` ${insulCount} ${elementType}${insulCount !== 1 ? 's are' : ' is'} insulated.`;
        }
      }
    } else if (propLower === 'firerating' || propLower.includes('fire')) {
      // Fire rating analysis
      const ratedElements = values.filter(v => {
        const val = String(v.value).toLowerCase();
        return val !== 'none' && val !== 'n/a' && val !== '0' && val !== '';
      });
      
      if (ratedElements.length === 0) {
        analysis = `No ${elementType}s have fire ratings specified in this model.`;
      } else {
        const ratedCount = ratedElements.reduce((sum, v) => sum + v.count, 0);
        analysis = `**${ratedCount} of ${totalElements} ${elementType}s** have fire ratings. `;
        if (ratedElements.length > 1) {
          analysis += `Ratings range from ${ratedElements[ratedElements.length - 1].value} to ${ratedElements[0].value}.`;
        } else {
          analysis += `All rated elements have a **${ratedElements[0].value}** rating.`;
        }
      }
    } else if (propLower === 'loadbearing' || propLower.includes('load')) {
      // Load bearing analysis
      const loadBearing = values.find(v => String(v.value).toLowerCase() === 'true');
      const nonLoadBearing = values.find(v => String(v.value).toLowerCase() === 'false');
      
      if (loadBearing && nonLoadBearing) {
        analysis = `**${loadBearing.count} ${elementType}${loadBearing.count !== 1 ? 's are' : ' is'} load-bearing** and ${nonLoadBearing.count} ${nonLoadBearing.count !== 1 ? 'are' : 'is'} non-load-bearing. `;
        const lbPercent = Math.round((loadBearing.count / totalElements) * 100);
        analysis += `${lbPercent}% of ${elementType}s carry structural loads.`;
      } else if (loadBearing) {
        analysis = `All ${totalElements} ${elementType}s are **load-bearing structural elements**.`;
      } else {
        analysis = `All ${totalElements} ${elementType}s are **non-load-bearing** (partitions/infill).`;
      }
    } else if (propLower === 'isexternal' || propLower.includes('external')) {
      // External/Internal analysis
      const external = values.find(v => String(v.value).toLowerCase() === 'true');
      const internal = values.find(v => String(v.value).toLowerCase() === 'false');
      
      if (external && internal) {
        analysis = `**${external.count} external** and **${internal.count} internal** ${elementType}s. `;
        const extPercent = Math.round((external.count / totalElements) * 100);
        analysis += `${extPercent}% are part of the building envelope.`;
      } else if (external) {
        analysis = `All ${totalElements} ${elementType}s are **external** (part of building envelope).`;
      } else {
        analysis = `All ${totalElements} ${elementType}s are **internal**.`;
      }
    } else {
      // Generic analysis
      if (uniqueCount === 1) {
        analysis = `All ${totalElements} ${elementType}s have the same ${propertyName}: **${topValue.value}**.`;
      } else if (uniqueCount <= 3) {
        analysis = `There are **${uniqueCount} different values** for ${propertyName}. The most common is "${topValue.value}" (${topPercentage}%).`;
      } else {
        analysis = `The model has **${uniqueCount} unique ${propertyName} values** across ${totalElements} ${elementType}s. "${topValue.value}" is most common (${topPercentage}%).`;
      }
    }
    
    return `💡 **Analysis:** ${analysis}`;
  }
}
