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
 * WebLLM Engine for local, privacy-preserving AI inference
 * Uses Qwen3-0.6B with advanced reasoning capabilities
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
   * Generate a conversational response with BIM context and function calling
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

      const response = await this.engine!.chat.completions.create({
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS.chat,
        extra_body: {
          enable_thinking: ENABLE_THINKING.chat,
        },
        ...(enableFunctionCalling && { tools: getBIMFunctionsAsTools() }),
      } as any);

      const choice = response.choices[0];
      const toolCalls = (choice.message as any)?.tool_calls;

      // Check if AI wants to call a function
      if (enableFunctionCalling && toolCalls && toolCalls.length > 0) {
        const functionCall = toolCalls[0].function;
        const functionArgs =
          typeof functionCall.arguments === "string"
            ? JSON.parse(functionCall.arguments)
            : functionCall.arguments;

        this.addToHistory(userMsg, {
          role: "assistant",
          content: `Calling function: ${functionCall.name}`,
        });

        return {
          name: functionCall.name,
          arguments: functionArgs,
        };
      }

      // Regular text response
      const assistantMessage = choice.message?.content || "";

      this.addToHistory(userMsg, {
        role: "assistant",
        content: assistantMessage,
      });

      return assistantMessage;
    } catch (error) {
      console.error("WebLLM chat error:", error);
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

      this.addToHistory(userMsg, {
        role: "assistant",
        content: fullResponse,
      });

      return fullResponse;
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
