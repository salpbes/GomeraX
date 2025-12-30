/**
 * Hybrid Strategy - AI responds + Rule-based execution
 *
 * This is the "Serverless AI Agent" strategy that:
 * 1. Sends user input to WebLLM for conversational response
 * 2. Simultaneously detects actionable commands via IntentDetector
 * 3. Executes detected actions via ToolExecutor
 *
 * When native function calling becomes available, this strategy
 * can be swapped for FunctionCallingStrategy without changing
 * the rest of the system.
 */

import type {
  IAgentStrategy,
  AgentResponse,
  BIMContext,
  ToolResult,
} from "../types";
import type { WebLLMEngine } from "../../webllm";
import { IntentDetector } from "../IntentDetector";
import { ToolExecutor } from "../ToolExecutor";

/**
 * Hybrid Strategy Implementation
 */
export class HybridStrategy implements IAgentStrategy {
  readonly name = "hybrid";

  private webLLM: WebLLMEngine;
  private intentDetector: IntentDetector;
  private toolExecutor: ToolExecutor;

  constructor(
    webLLM: WebLLMEngine,
    toolExecutor: ToolExecutor,
    intentDetector?: IntentDetector
  ) {
    this.webLLM = webLLM;
    this.toolExecutor = toolExecutor;
    this.intentDetector = intentDetector || new IntentDetector();
  }

  /**
   * Check if this strategy is available
   */
  isAvailable(): boolean {
    return this.webLLM.isLoaded();
  }

  /**
   * Process a command using hybrid approach
   */
  async processCommand(
    command: string,
    context: BIMContext,
    onStreamToken?: (token: string) => void
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      throw new Error("HybridStrategy: WebLLM not available");
    }

    // Step 1: Get AI response
    let aiText: string;
    if (onStreamToken) {
      aiText = await this.webLLM.chatStream(command, onStreamToken, context);
    } else {
      const response = await this.webLLM.chat(command, context, false);
      aiText = response as string;
    }

    // Step 2: Detect and execute actions
    const detection = this.intentDetector.detect(command);
    let toolResult: ToolResult | undefined;

    if (detection.detected && detection.toolCall) {
      console.log(
        `[HybridStrategy] Detected intent: ${detection.toolCall.name}`,
        detection.toolCall.arguments
      );
      toolResult = await this.toolExecutor.execute(detection.toolCall);
      console.log(`[HybridStrategy] Execution result:`, toolResult);
    }

    // Step 3: Build response
    return {
      text: aiText,
      isAI: true,
      toolCalls: detection.detected && detection.toolCall ? [detection.toolCall] : undefined,
      toolResults: toolResult ? [toolResult] : undefined,
      metadata: {
        executionTime: Date.now() - startTime,
        strategy: "hybrid",
      },
    };
  }
}
