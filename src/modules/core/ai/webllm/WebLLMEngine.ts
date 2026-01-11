import * as webllm from "@mlc-ai/web-llm";
import type {
  BIMFunctionCall,
  BIMContext,
  InitProgress,
  ModelInfo,
  ConversationMessage,
} from "./types";
import {
  MODEL_ID,
  MAX_HISTORY_PAIRS,
  CONTEXT_WINDOW_SIZE,
  MAX_TOKENS,
  TEMPERATURE,
  LOG_LEVEL,
  ENABLE_THINKING,
  MODEL_INFO,
} from "./config";
import { getBIMFunctionsAsTools } from "./functions";
import { buildSystemPrompt } from "./prompts";

/**
 * Check if Web Workers are supported
 */
function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Yield to the main thread to prevent UI freezing
 * Uses requestAnimationFrame for better frame timing
 */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    // Use requestAnimationFrame for smooth visual updates
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Strip Qwen3 thinking blocks from response
 * The model outputs <think>...</think> tags with reasoning that should not be shown to users
 */
function stripThinkingBlock(response: string): string {
  // Remove <think>...</think> blocks (including multiline)
  let cleaned = response.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Also handle unclosed thinking blocks (model sometimes doesn't close them)
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, "");
  // Trim whitespace and newlines
  return cleaned.trim();
}

/**
 * WebLLM Engine for local, privacy-preserving AI inference
 * Uses Qwen3 with advanced reasoning capabilities
 *
 * Features:
 * - 100% local processing (no data sent to cloud)
 * - Runs on WebGPU in a Web Worker (non-blocking UI)
 * - OpenAI-compatible API
 * - Advanced thinking process (visible in responses)
 * - Function calling for BIM actions
 * - Persistent caching in browser
 */
export class WebLLMEngine {
  private engine: webllm.MLCEngineInterface | null = null;
  private isInitializing = false;
  private isReady = false;
  private useWorker = false; // Whether running in Web Worker mode
  private conversationHistory: ConversationMessage[] = [];
  
  // Track usage stats from last request
  private lastUsageStats: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    prefillTokensPerSec: number;
    decodeTokensPerSec: number;
    timeToFirstToken: number;
    e2eLatency: number;
  } | null = null;

  /**
   * Initialize the WebLLM engine with progress tracking
   * Uses Web Worker to prevent UI freezing during inference
   */
  async initialize(
    progressCallback?: (progress: InitProgress) => void
  ): Promise<void> {
    if (this.isReady) {
      console.log("WebLLM already initialized");
      return;
    }

    if (this.isInitializing) {
      console.log("WebLLM initialization already in progress");
      return;
    }

    this.isInitializing = true;

    try {
      console.log(`Initializing WebLLM with ${MODEL_ID}...`);

      // Try to use Web Worker for non-blocking inference
      if (isWorkerSupported()) {
        try {
          console.log("🔧 Using Web Worker for non-blocking AI inference...");
          const worker = new Worker(
            new URL('./webllm.worker.ts', import.meta.url),
            { type: 'module' }
          );
          
          this.engine = await webllm.CreateWebWorkerMLCEngine(
            worker,
            MODEL_ID,
            {
              initProgressCallback: (report: webllm.InitProgressReport) => {
                const progress = report.progress || 0;
                const text = report.text || "Loading...";

                console.log(`WebLLM: ${text} (${Math.round(progress * 100)}%)`);

                if (progressCallback) {
                  progressCallback({
                    text,
                    progress: Math.round(progress * 100),
                  });
                }
              },
              logLevel: LOG_LEVEL,
            },
            {
              context_window_size: CONTEXT_WINDOW_SIZE,
              // Use smaller prefill chunks for better UI responsiveness
              // This breaks up the GPU work into smaller pieces
              prefill_chunk_size: 256,
            }
          );
          this.useWorker = true;
          console.log("✅ Web Worker AI initialized successfully!");
        } catch (workerError) {
          console.warn("⚠️ Web Worker initialization failed, falling back to main thread:", workerError);
          // Fall back to main thread
          this.engine = await this.initializeMainThread(progressCallback);
        }
      } else {
        // Fall back to main thread if Web Workers not supported
        console.log("⚠️ Web Workers not supported, using main thread...");
        this.engine = await this.initializeMainThread(progressCallback);
      }

      this.isReady = true;
      console.log("WebLLM initialized successfully!");
    } catch (error) {
      console.error("Failed to initialize WebLLM:", error);
      this.isReady = false;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }
  
  /**
   * Initialize on main thread (fallback)
   */
  private async initializeMainThread(
    progressCallback?: (progress: InitProgress) => void
  ): Promise<webllm.MLCEngineInterface> {
    return await webllm.CreateMLCEngine(
      MODEL_ID,
      {
        initProgressCallback: (report: webllm.InitProgressReport) => {
          const progress = report.progress || 0;
          const text = report.text || "Loading...";

          console.log(`WebLLM: ${text} (${Math.round(progress * 100)}%)`);

          if (progressCallback) {
            progressCallback({
              text,
              progress: Math.round(progress * 100),
            });
          }
        },
        logLevel: LOG_LEVEL,
      },
      {
        context_window_size: CONTEXT_WINDOW_SIZE,
        // Use smaller prefill chunks for better UI responsiveness
        prefill_chunk_size: 256,
      }
    );
  }

  /**
   * Check if WebLLM is ready to use
   */
  isLoaded(): boolean {
    return this.isReady && this.engine !== null;
  }

  /**
   * Check if initialization is in progress
   */
  isLoading(): boolean {
    return this.isInitializing;
  }

  /**
   * Generate a conversational response with BIM context
   * Uses structured output parsing instead of native function calling
   */
  async chat(
    userMessage: string,
    bimContext?: BIMContext,
    enableFunctionCalling: boolean = false
  ): Promise<string | BIMFunctionCall> {
    if (!this.isLoaded()) {
      throw new Error("WebLLM not initialized. Call initialize() first.");
    }

    try {
      const systemPrompt = buildSystemPrompt(bimContext, enableFunctionCalling);

      const userMsg: ConversationMessage = {
        role: "user",
        content: userMessage,
      };

      const messages: ConversationMessage[] = [
        { role: "system", content: systemPrompt },
        ...this.conversationHistory,
        userMsg,
      ];

      // Don't use native function calling - let the model output structured text
      const response = await this.engine!.chat.completions.create({
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS.chat,
        extra_body: {
          enable_thinking: ENABLE_THINKING.chat,
        },
      } as any);

      const choice = response.choices[0];
      let textContent = choice.message?.content || "";
      
      // Capture usage stats from response
      const usage = response.usage;
      if (usage) {
        this.lastUsageStats = {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          prefillTokensPerSec: (usage.extra as any)?.prefill_tokens_per_s || 0,
          decodeTokensPerSec: (usage.extra as any)?.decode_tokens_per_s || 0,
          timeToFirstToken: (usage.extra as any)?.time_to_first_token_s || 0,
          e2eLatency: (usage.extra as any)?.e2e_latency_s || 0,
        };
      }
      
      // Strip thinking blocks
      textContent = stripThinkingBlock(textContent);

      // Log for debugging
      console.log("[WebLLM] Response:", textContent.substring(0, 200));

      // Parse function calls from response (supports batch commands)
      if (enableFunctionCalling) {
        const parsed = this.parseActionsFromResponse(textContent);
        if (parsed && parsed.actions.length > 0) {
          console.log(`[WebLLM] Parsed ${parsed.actions.length} action(s) with ${parsed.confidence}% confidence`);
          
          // Store the proper format in history
          const actionStrings = parsed.actions.map(a => 
            `[ACTION: ${a.name}(${JSON.stringify(a.arguments)})]`
          ).join('\n');
          
          this.addToHistory(userMsg, {
            role: "assistant",
            content: `${actionStrings}\n[CONFIDENCE: ${parsed.confidence}]`,
          });

          // Return batch result with confidence
          return {
            actions: parsed.actions,
            confidence: parsed.confidence
          };
        }
      }

      // Regular text response
      this.addToHistory(userMsg, {
        role: "assistant",
        content: textContent,
      });

      return textContent;
    } catch (error) {
      console.error("WebLLM chat error:", error);
      throw error;
    }
  }

  /**
   * Generate a streaming response with function calling support
   * Shows tokens in real-time for immediate feedback
   */
  async chatStreamWithActions(
    userMessage: string,
    onToken: (token: string) => void,
    bimContext?: BIMContext,
    enableFunctionCalling: boolean = false
  ): Promise<string | BIMFunctionCall> {
    if (!this.isLoaded()) {
      throw new Error("WebLLM not initialized. Call initialize() first.");
    }

    try {
      const systemPrompt = buildSystemPrompt(bimContext, enableFunctionCalling);

      const userMsg: ConversationMessage = {
        role: "user",
        content: userMessage,
      };

      const messages: ConversationMessage[] = [
        { role: "system", content: systemPrompt },
        ...this.conversationHistory,
        userMsg,
      ];

      let fullResponse = "";
      const startTime = performance.now();
      let firstTokenTime: number | null = null;

      // Yield before prefill to ensure UI is responsive
      console.log(`[WebLLM] Starting prefill (${this.useWorker ? 'Worker' : 'MainThread'} mode)...`);
      await yieldToMain();

      // Create the stream - this is where prefill happens and can take time
      const asyncChunkGenerator = (await this.engine!.chat.completions.create({
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS.chat,
        stream: true,
        extra_body: {
          enable_thinking: ENABLE_THINKING.chat,
        },
      } as any)) as unknown as AsyncIterable<webllm.ChatCompletionChunk>;
      
      console.log(`[WebLLM] Prefill complete, starting token generation...`);

      let tokenCount = 0;
      for await (const chunk of asyncChunkGenerator) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          // Track first token time for stats
          if (firstTokenTime === null) {
            firstTokenTime = performance.now();
          }
          tokenCount++;
          fullResponse += token;
          onToken(token);
          
          // Yield to the main thread every 3 tokens to prevent UI freezing
          if (tokenCount % 3 === 0) {
            await yieldToMain();
          }
        }
      }

      const endTime = performance.now();
      
      // Strip thinking blocks
      let cleanedResponse = stripThinkingBlock(fullResponse);
      
      // Debug: log the cleaned response to see what we're trying to parse
      console.log(`[WebLLM Stream] Full response: "${cleanedResponse}"`);
      
      // Parse function calls from response (supports batch commands)
      if (enableFunctionCalling) {
        const parsed = this.parseActionsFromResponse(cleanedResponse);
        if (parsed && parsed.actions.length > 0) {
          console.log(`[WebLLM Stream] Parsed ${parsed.actions.length} action(s) with ${parsed.confidence}% confidence`);

          // Store the proper format in history
          const actionStrings = parsed.actions.map(a => 
            `[ACTION: ${a.name}(${JSON.stringify(a.arguments)})]`
          ).join('\n');
          
          this.addToHistory(userMsg, {
            role: "assistant",
            content: `${actionStrings}\n[CONFIDENCE: ${parsed.confidence}]`,
          });

          // Return batch result with confidence
          return {
            actions: parsed.actions,
            confidence: parsed.confidence
          };
        }
      }
      
      // Track actual usage stats
      const totalTime = (endTime - startTime) / 1000;
      const timeToFirstToken = firstTokenTime ? (firstTokenTime - startTime) / 1000 : totalTime;
      const decodeTime = firstTokenTime ? (endTime - firstTokenTime) / 1000 : totalTime;
      
      this.lastUsageStats = {
        promptTokens: 0,
        completionTokens: tokenCount,
        totalTokens: tokenCount,
        prefillTokensPerSec: 0,
        decodeTokensPerSec: decodeTime > 0 ? tokenCount / decodeTime : 0,
        timeToFirstToken: timeToFirstToken,
        e2eLatency: totalTime,
      };

      // Regular text response
      this.addToHistory(userMsg, {
        role: "assistant",
        content: cleanedResponse,
      });

      return cleanedResponse;
    } catch (error) {
      console.error("WebLLM streaming chat error:", error);
      throw error;
    }
  }

  /**
   * Generate a streaming response (for real-time display)
   */
  async chatStream(
    userMessage: string,
    onToken: (token: string) => void,
    bimContext?: BIMContext
  ): Promise<string> {
    if (!this.isLoaded()) {
      throw new Error("WebLLM not initialized. Call initialize() first.");
    }

    try {
      const systemPrompt = buildSystemPrompt(bimContext);

      const userMsg: ConversationMessage = {
        role: "user",
        content: userMessage,
      };

      const messages: ConversationMessage[] = [
        { role: "system", content: systemPrompt },
        ...this.conversationHistory,
        userMsg,
      ];

      let fullResponse = "";

      // Yield before prefill to ensure UI is responsive
      console.log(`[WebLLM] Starting prefill (${this.useWorker ? 'Worker' : 'MainThread'} mode)...`);
      await yieldToMain();

      const asyncChunkGenerator = (await this.engine!.chat.completions.create({
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS.stream,
        stream: true,
        extra_body: {
          enable_thinking: ENABLE_THINKING.stream,
        },
      } as any)) as unknown as AsyncIterable<webllm.ChatCompletionChunk>;

      console.log(`[WebLLM] Prefill complete, starting token generation...`);

      let tokenCount = 0;
      for await (const chunk of asyncChunkGenerator) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          tokenCount++;
          fullResponse += token;
          onToken(token);
          
          // Yield to main thread every 3 tokens to prevent UI freezing
          if (tokenCount % 3 === 0) {
            await yieldToMain();
          }
        }
      }

      // Strip any thinking blocks from the response before storing
      const cleanedResponse = stripThinkingBlock(fullResponse);

      this.addToHistory(userMsg, {
        role: "assistant",
        content: cleanedResponse,
      });

      return cleanedResponse;
    } catch (error) {
      console.error("WebLLM streaming error:", error);
      throw error;
    }
  }

  /**
   * Add messages to history and trim if needed
   */
  private addToHistory(
    userMsg: ConversationMessage,
    assistantMsg: ConversationMessage
  ): void {
    this.conversationHistory.push(userMsg);
    this.conversationHistory.push(assistantMsg);

    // Trim history to max length (each pair = 2 messages)
    const maxMessages = MAX_HISTORY_PAIRS * 2;
    if (this.conversationHistory.length > maxMessages) {
      this.conversationHistory = this.conversationHistory.slice(-maxMessages);
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    console.log("Conversation history cleared");
  }

  /**
   * Generate a summary for web content (one-shot, no conversation history impact)
   */
  async generateSummary(content: string): Promise<string> {
    if (!this.engine || !this.isReady) {
      throw new Error("WebLLM not initialized");
    }

    const messages: webllm.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "You are a helpful assistant that summarizes web content concisely. Format your response as 3-5 bullet points. Be brief and focus on key information. Do not include any action tags."
      },
      {
        role: "user",
        content: content
      }
    ];

    const response = await this.engine.chat.completions.create({
      messages,
      max_tokens: 300,
      temperature: 0.3,
    });

    let summary = response.choices[0]?.message?.content || "Unable to generate summary.";
    
    // Strip thinking blocks if present
    summary = stripThinkingBlock(summary);
    
    return summary;
  }

  /**
   * Get current conversation history
   */
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Unload the model to free memory
   */
  async unload(): Promise<void> {
    if (this.engine) {
      console.log("Unloading WebLLM engine...");
      this.engine = null;
      this.isReady = false;
      this.conversationHistory = [];
    }
  }

  /**
   * Get usage statistics from the last request
   * Uses the new ChatCompletion.usage API instead of deprecated runtimeStatsText
   */
  getUsageStats(): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    prefillSpeed: string;
    decodeSpeed: string;
    latency: string;
  } | null {
    if (!this.lastUsageStats) {
      return null;
    }
    return {
      promptTokens: this.lastUsageStats.promptTokens,
      completionTokens: this.lastUsageStats.completionTokens,
      totalTokens: this.lastUsageStats.totalTokens,
      prefillSpeed: `${this.lastUsageStats.prefillTokensPerSec.toFixed(1)} tok/s`,
      decodeSpeed: `${this.lastUsageStats.decodeTokensPerSec.toFixed(1)} tok/s`,
      latency: `${(this.lastUsageStats.e2eLatency * 1000).toFixed(0)}ms`,
    };
  }

  /**
   * Parse multiple actions and confidence from response text
   * Returns array of actions with confidence score
   */
  private parseActionsFromResponse(text: string): { 
    actions: Array<{ name: string; arguments: any }>;
    confidence: number;
  } | null {
    const actions: Array<{ name: string; arguments: any }> = [];
    
    // Extract confidence score if present
    const confidenceMatch = text.match(/\[CONFIDENCE:\s*(\d+)\]/i);
    const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 75; // Default 75%
    
    // Find all [ACTION: ...] patterns (supports multi-line batch commands)
    const actionPattern = /\[ACTION:\s*(\w+)\s*\(([^)]*)\)\s*\]/gi;
    let match;
    
    while ((match = actionPattern.exec(text)) !== null) {
      const functionName = match[1];
      const argsStr = match[2].trim();
      const args = argsStr ? this.parseActionArguments(functionName, argsStr) : {};
      
      actions.push({ name: functionName, arguments: args });
    }
    
    // If we found actions, return them with confidence
    if (actions.length > 0) {
      return { actions, confidence };
    }
    
    // Fallback: try single action parsing (backwards compatibility)
    const singleAction = this.parseActionFromResponse(text);
    if (singleAction) {
      return { 
        actions: [singleAction],
        confidence
      };
    }
    
    return null;
  }

  /**
   * Parse action from response text - handles multiple formats
   * Returns null if no action found
   */
  private parseActionFromResponse(text: string): { name: string; arguments: any } | null {
    // Pattern 1: [ACTION: functionName(args)]
    const actionMatch = text.match(/\[ACTION:\s*(\w+)\s*\(\s*([^)]*)\s*\)\s*\]/i);
    if (actionMatch) {
      const functionName = actionMatch[1];
      const argsStr = actionMatch[2].trim();
      const args = argsStr ? this.parseActionArguments(functionName, argsStr) : {};
      
      return { name: functionName, arguments: args };
    }

    // Pattern 2: Partial [ACTION: functionName( without closing
    const partialMatch = text.match(/\[ACTION:\s*(\w+)\s*\(\s*([^)\]]*)/i);
    if (partialMatch) {
      const functionName = partialMatch[1];
      const argsStr = partialMatch[2].trim();
      const args = argsStr ? this.parseActionArguments(functionName, argsStr) : {};
      
      return { name: functionName, arguments: args };
    }

    // Pattern 3: "Calling function: functionName" (AI learned this from history)
    const callingMatch = text.match(/Calling\s+function:\s*(\w+)/i);
    if (callingMatch) {
      console.log("[WebLLM] Detected 'Calling function:' format, AI may have learned from history");
      return { name: callingMatch[1], arguments: {} };
    }

    // Pattern 4: Just function name followed by () like "resetView()"
    const simpleMatch = text.match(/\b(\w+)\s*\(\s*\)/);
    if (simpleMatch) {
      const functionName = simpleMatch[1];
      // Check if it's a known function (to avoid false positives)
      const knownFunctions = [
        'resetView', 'fitToView', 'toggleFirstPersonMode', 'toggleClipper',
        'removeAllClippingPlanes', 'enableMeasurement', 'disableMeasurement',
        'clearMeasurements', 'showClusters', 'exitClusterMode', 'toggleClusters',
        'showFloorPlans', 'showAllElements', 'toggleStoreyVisibility', 'toggleMinimapCamera',
        'showModelDashboard', 'setView', 'zoom', 'rotateCamera', 'hideElementTypes',
        'showOnlyElementTypes', 'setElementTransparency', 'addClippingPlane',
        'colorByStorey', 'colorByType', 'exitColorSplashMode', 'showFloorPlan'
      ];
      
      if (knownFunctions.includes(functionName)) {
        console.log(`[WebLLM] Detected bare function call: ${functionName}()`);
        return { name: functionName, arguments: {} };
      }
    }

    return null;
  }

  /**
   * Parse action arguments based on function name
   * Handles all function types with appropriate parameter mapping
   */
  private parseActionArguments(functionName: string, argsStr: string): any {
    // Special handling for functions with multiple arguments
    if (functionName === 'selectElementsByStoreyAndType') {
      // Parse: "Storey Name", ["IFCCOLUMN", "IFCBEAM"]
      const parts = this.splitArguments(argsStr);
      if (parts.length === 2) {
        const storeyName = parts[0].replace(/['"`]/g, '').trim();
        try {
          const elementTypes = JSON.parse(parts[1]);
          return { storeyName, elementTypes };
        } catch {
          // Fallback: manual array parsing
          const types = parts[1].match(/IFC\w+/gi) || [];
          return { storeyName, elementTypes: types };
        }
      }
    }
    
    // Special handling for searchWebPage: "url", "searchTerms"
    if (functionName === 'searchWebPage') {
      const parts = this.splitArguments(argsStr);
      if (parts.length >= 2) {
        const url = parts[0].replace(/['"`]/g, '').trim();
        const searchTerms = parts[1].replace(/['"`]/g, '').trim();
        return { url, searchTerms };
      } else if (parts.length === 1) {
        // Only URL provided, no search terms
        return { url: parts[0].replace(/['"`]/g, '').trim() };
      }
    }
    
    // Special handling for getPageSections: "url"
    if (functionName === 'getPageSections') {
      const url = argsStr.replace(/['"`]/g, '').trim();
      return { url };
    }
    
    // Special handling for fetchWebPage: "url"
    if (functionName === 'fetchWebPage') {
      const url = argsStr.replace(/['"`]/g, '').trim();
      return { url };
    }
    
    // Special handling for loadMoreWebContent: count
    if (functionName === 'loadMoreWebContent') {
      const count = parseInt(argsStr.replace(/['"`]/g, '').trim()) || 5;
      return { count };
    }
    
    // Special handling for smartSearch: "url", "topic"
    if (functionName === 'smartSearch') {
      const parts = this.splitArguments(argsStr);
      if (parts.length >= 2) {
        const url = parts[0].replace(/['"`]/g, '').trim();
        const topic = parts[1].replace(/['"`]/g, '').trim();
        return { url, topic };
      } else if (parts.length === 1) {
        return { url: parts[0].replace(/['"`]/g, '').trim() };
      }
    }
    
    // Special handling for getSectionContent: [1, 2, 3]
    if (functionName === 'getSectionContent') {
      try {
        // Try parsing as JSON array
        const parsed = JSON.parse(argsStr);
        if (Array.isArray(parsed)) {
          return { sectionIndices: parsed.map(n => parseInt(n)) };
        }
      } catch {
        // Try extracting numbers manually
        const numbers = argsStr.match(/\d+/g)?.map(n => parseInt(n)) || [];
        if (numbers.length > 0) {
          return { sectionIndices: numbers };
        }
      }
    }
    
    const cleanArg = argsStr.replace(/['"`]/g, '').trim();
    
    // Try JSON parse first for arrays
    try {
      const parsed = JSON.parse(argsStr);
      if (Array.isArray(parsed)) {
        return { elementTypes: parsed };
      }
      // If it's a plain string in JSON
      if (typeof parsed === 'string') {
        return this.mapStringArgToParam(functionName, parsed);
      }
      // If it's an object, return as-is
      if (typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      // Not valid JSON, handle as plain string
    }

    // Handle plain string arguments
    if (cleanArg) {
      // Check if it looks like an array of IFC types
      if (cleanArg.startsWith('[') || cleanArg.includes('IFC')) {
        const types = cleanArg.match(/IFC\w+/gi) || [];
        if (types.length > 0) {
          return { elementTypes: types };
        }
      }
      
      // Map string to appropriate parameter based on function
      return this.mapStringArgToParam(functionName, cleanArg);
    }

    return {};
  }

  /**
   * Split function arguments by comma, respecting nested brackets
   */
  private splitArguments(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      
      // Track string boundaries
      if ((char === '"' || char === "'" || char === '`') && (i === 0 || argsStr[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
      
      // Track bracket depth (only when not in string)
      if (!inString) {
        if (char === '[' || char === '{') depth++;
        if (char === ']' || char === '}') depth--;
        
        // Split on comma only at depth 0 and outside strings
        if (char === ',' && depth === 0) {
          args.push(current.trim());
          current = '';
          continue;
        }
      }
      
      current += char;
    }
    
    if (current.trim()) {
      args.push(current.trim());
    }
    
    return args;
  }

  /**
   * Map a string argument to the correct parameter name for a function
   */
  private mapStringArgToParam(functionName: string, value: string): any {
    // Mapping of function names to their parameter names
    const parameterMappings: Record<string, string> = {
      // Camera/View
      'setView': 'view',
      'zoom': 'direction',
      'rotateCamera': 'angle',
      
      // Clipping
      'addClippingPlane': 'axis',
      'toggleClipper': 'enabled',
      
      // Measurement
      'enableMeasurement': 'mode',
      
      // Floor plans
      'showFloorPlan': 'storeyName',
    };

    const paramName = parameterMappings[functionName];
    if (paramName) {
      // Handle special cases
      if (paramName === 'angle') {
        return { [paramName]: parseFloat(value) || 90 };
      }
      if (paramName === 'enabled') {
        return { [paramName]: value.toLowerCase() === 'true' };
      }
      return { [paramName]: value };
    }

    // Default: return as generic value
    return { value };
  }

  /**
   * Get GPU vendor information
   */
  async getGPUInfo(): Promise<string> {
    if (!this.engine) {
      return "WebLLM not initialized";
    }
    try {
      const vendor = await this.engine.getGPUVendor();
      return vendor;
    } catch (error) {
      console.error("Error getting GPU info:", error);
      return "Unable to get GPU info";
    }
  }

  /**
   * Check if WebGPU is supported
   */
  static async isWebGPUSupported(): Promise<boolean> {
    if (!navigator.gpu) {
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get recommended model info
   */
  static getModelInfo(): ModelInfo {
    return { ...MODEL_INFO };
  }
}
