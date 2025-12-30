/**
 * AI Agent - MCP-Inspired Architecture
 *
 * This is the main orchestrator for the AI agent system.
 * It manages strategies, tool execution, and provides a unified API.
 *
 * Architecture:
 * - ToolRegistry: Defines available tools with schemas
 * - ToolExecutor: Executes tool calls against BIM actions
 * - IntentDetector: Detects commands from natural language
 * - Strategies: Pluggable execution strategies
 *   - HybridStrategy: AI responds + rule-based execution (current)
 *   - FunctionCallingStrategy: Native AI function calling (future)
 */

import type { IAgentStrategy, AgentResponse, BIMContext } from "./types";
import { ToolExecutor } from "./ToolExecutor";
import { IntentDetector } from "./IntentDetector";
import { HybridStrategy, FunctionCallingStrategy } from "./strategies";
import type { WebLLMEngine } from "../webllm";
import type { AIBimActions } from "../AIBimActions";
import type { ConversationContext } from "../ConversationContext";

/**
 * Strategy type enum
 */
export type StrategyType = "auto" | "hybrid" | "function-calling";

/**
 * AI Agent Configuration
 */
export interface AIAgentConfig {
  /** Preferred strategy (default: "auto") */
  preferredStrategy?: StrategyType;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * AI Agent - Main orchestrator
 */
export class AIAgent {
  private webLLM: WebLLMEngine;
  private toolExecutor: ToolExecutor;
  private intentDetector: IntentDetector;
  private hybridStrategy: HybridStrategy;
  private functionCallingStrategy: FunctionCallingStrategy;
  private preferredStrategy: StrategyType;
  private debug: boolean;

  constructor(
    webLLM: WebLLMEngine,
    actions: AIBimActions,
    context: ConversationContext,
    config: AIAgentConfig = {}
  ) {
    this.webLLM = webLLM;
    this.toolExecutor = new ToolExecutor(actions, context);
    this.intentDetector = new IntentDetector();
    this.preferredStrategy = config.preferredStrategy || "auto";
    this.debug = config.debug || false;

    // Initialize strategies
    this.hybridStrategy = new HybridStrategy(
      webLLM,
      this.toolExecutor,
      this.intentDetector
    );
    this.functionCallingStrategy = new FunctionCallingStrategy(
      webLLM,
      this.toolExecutor
    );
  }

  /**
   * Get the currently active strategy
   */
  getActiveStrategy(): IAgentStrategy {
    if (this.preferredStrategy === "function-calling") {
      if (this.functionCallingStrategy.isAvailable()) {
        return this.functionCallingStrategy;
      }
      this.log("Function calling not available, falling back to hybrid");
    }

    if (this.preferredStrategy === "hybrid" || this.preferredStrategy === "auto") {
      if (this.hybridStrategy.isAvailable()) {
        return this.hybridStrategy;
      }
    }

    throw new Error("No available strategy");
  }

  /**
   * Process a user command
   */
  async processCommand(
    command: string,
    context: BIMContext,
    onStreamToken?: (token: string) => void
  ): Promise<AgentResponse> {
    const strategy = this.getActiveStrategy();
    this.log(`Using strategy: ${strategy.name}`);

    return strategy.processCommand(command, context, onStreamToken);
  }

  /**
   * Check if the agent is ready
   */
  isReady(): boolean {
    return this.webLLM.isLoaded();
  }

  /**
   * Set the preferred strategy
   */
  setPreferredStrategy(strategy: StrategyType): void {
    this.preferredStrategy = strategy;
    this.log(`Preferred strategy set to: ${strategy}`);
  }

  /**
   * Get current strategy info
   */
  getStrategyInfo(): {
    preferred: StrategyType;
    active: string;
    hybridAvailable: boolean;
    functionCallingAvailable: boolean;
  } {
    return {
      preferred: this.preferredStrategy,
      active: this.isReady() ? this.getActiveStrategy().name : "none",
      hybridAvailable: this.hybridStrategy.isAvailable(),
      functionCallingAvailable: this.functionCallingStrategy.isAvailable(),
    };
  }

  /**
   * Get the tool executor for direct tool execution
   */
  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }

  /**
   * Get the intent detector for manual detection
   */
  getIntentDetector(): IntentDetector {
    return this.intentDetector;
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log("[AIAgent]", ...args);
    }
  }
}
