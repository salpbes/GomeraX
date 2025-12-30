/**
 * Function Calling Strategy - Native AI tool execution
 *
 * This strategy uses the AI's native function calling capability
 * to execute tools. When WebLLM/Qwen3 supports reliable function
 * calling, this strategy can be enabled.
 *
 * Currently a placeholder - will be fully implemented when
 * function calling is stable.
 */

import type {
  IAgentStrategy,
  AgentResponse,
  BIMContext,
  ToolCall,
} from "../types";
import type { WebLLMEngine, BIMFunctionCall } from "../../webllm";
import { ToolExecutor } from "../ToolExecutor";
import { toolRegistry } from "../ToolRegistry";

/**
 * Function Calling Strategy Implementation
 */
export class FunctionCallingStrategy implements IAgentStrategy {
  readonly name = "function-calling";

  private webLLM: WebLLMEngine;
  private toolExecutor: ToolExecutor;

  constructor(webLLM: WebLLMEngine, toolExecutor: ToolExecutor) {
    this.webLLM = webLLM;
    this.toolExecutor = toolExecutor;
  }

  /**
   * Check if this strategy is available
   * Currently requires WebLLM to be loaded AND function calling to be supported
   */
  isAvailable(): boolean {
    // TODO: Add check for function calling support when available
    // For now, always return false to use HybridStrategy
    return this.webLLM.isLoaded() && this.isFunctionCallingSupported();
  }

  /**
   * Check if function calling is supported by the current model
   */
  private isFunctionCallingSupported(): boolean {
    // TODO: Implement proper detection
    // Qwen3-0.6B does not reliably support function calling yet
    return false;
  }

  /**
   * Process a command using native function calling
   */
  async processCommand(
    command: string,
    context: BIMContext,
    onStreamToken?: (token: string) => void
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      throw new Error("FunctionCallingStrategy: Not available");
    }

    // Use native function calling
    const response = await this.webLLM.chat(command, context, true);

    // Check if AI returned a function call
    if (typeof response === "object" && "name" in response) {
      const functionCall = response as BIMFunctionCall;
      const toolCall: ToolCall = {
        name: functionCall.name,
        arguments: functionCall.arguments,
      };

      console.log(
        `[FunctionCallingStrategy] AI called function: ${toolCall.name}`,
        toolCall.arguments
      );

      // Execute the tool
      const toolResult = await this.toolExecutor.execute(toolCall);

      return {
        text: toolResult.message,
        isAI: true,
        toolCalls: [toolCall],
        toolResults: [toolResult],
        metadata: {
          executionTime: Date.now() - startTime,
          strategy: "function-calling",
        },
      };
    }

    // Regular text response (no function call)
    return {
      text: response as string,
      isAI: true,
      metadata: {
        executionTime: Date.now() - startTime,
        strategy: "function-calling",
      },
    };
  }

  /**
   * Get available tools for the AI
   */
  getTools() {
    return toolRegistry.getAsOpenAITools();
  }
}
