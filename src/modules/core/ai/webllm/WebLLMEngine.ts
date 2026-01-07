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
 * - Runs on WebGPU
 * - OpenAI-compatible API
 * - Advanced thinking process (visible in responses)
 * - Function calling for BIM actions
 * - Persistent caching in browser
 */
export class WebLLMEngine {
  private engine: webllm.MLCEngineInterface | null = null;
  private isInitializing = false;
  private isReady = false;
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

      this.engine = await webllm.CreateMLCEngine(
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
        }
      );

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

      // Parse function calls from response
      if (enableFunctionCalling) {
        const parsedAction = this.parseActionFromResponse(textContent);
        if (parsedAction) {
          console.log(`[WebLLM] Parsed action: ${parsedAction.name}`, JSON.stringify(parsedAction.arguments));

          // Store the proper format in history to maintain consistency
          this.addToHistory(userMsg, {
            role: "assistant",
            content: `[ACTION: ${parsedAction.name}(${JSON.stringify(parsedAction.arguments)})]`,
          });

          return parsedAction;
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
        }
      }

      const endTime = performance.now();
      
      // Strip thinking blocks
      let cleanedResponse = stripThinkingBlock(fullResponse);
      
      // Debug: log the cleaned response to see what we're trying to parse
      console.log(`[WebLLM Stream] Full response: "${cleanedResponse}"`);
      
      // Parse function calls from response
      if (enableFunctionCalling) {
        const parsedAction = this.parseActionFromResponse(cleanedResponse);
        if (parsedAction) {
          console.log(`[WebLLM Stream] Parsed action: ${parsedAction.name}`, JSON.stringify(parsedAction.arguments));

          // Store the proper format in history to maintain consistency
          this.addToHistory(userMsg, {
            role: "assistant",
            content: `[ACTION: ${parsedAction.name}(${JSON.stringify(parsedAction.arguments)})]`,
          });

          return parsedAction;
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

      const asyncChunkGenerator = (await this.engine!.chat.completions.create({
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS.stream,
        stream: true,
        extra_body: {
          enable_thinking: ENABLE_THINKING.stream,
        },
      } as any)) as unknown as AsyncIterable<webllm.ChatCompletionChunk>;

      for await (const chunk of asyncChunkGenerator) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          fullResponse += token;
          onToken(token);
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
