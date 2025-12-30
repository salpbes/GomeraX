/**
 * AI Agent Module - MCP-Inspired Architecture
 *
 * A modular, future-proof AI agent system for BIM operations.
 *
 * Components:
 * - AIAgent: Main orchestrator
 * - ToolRegistry: Central tool definitions
 * - ToolExecutor: Tool execution engine
 * - IntentDetector: Natural language intent detection
 * - Strategies: Pluggable execution strategies
 *
 * Usage:
 * ```typescript
 * import { AIAgent } from './agent';
 *
 * const agent = new AIAgent(webLLM, actions, context);
 * const response = await agent.processCommand("Select all walls", bimContext);
 * ```
 *
 * Future:
 * When WebLLM/Qwen3 supports function calling, switch strategy:
 * ```typescript
 * agent.setPreferredStrategy("function-calling");
 * ```
 */

// Main agent
export { AIAgent, type StrategyType, type AIAgentConfig } from "./AIAgent";

// Types
export type {
  ToolDefinition,
  ToolParameterSchema,
  ToolCall,
  ToolResult,
  AgentResponse,
  BIMContext,
  IAgentStrategy,
  IToolExecutor,
} from "./types";

// Tool system
export { ToolRegistry, toolRegistry, BIM_TOOLS } from "./ToolRegistry";
export { ToolExecutor, ELEMENT_TYPE_MAP } from "./ToolExecutor";

// Intent detection
export { IntentDetector, intentDetector, type DetectionResult } from "./IntentDetector";

// Strategies
export { HybridStrategy, FunctionCallingStrategy } from "./strategies";
