/**
 * AI Agent Types - MCP-Inspired Architecture
 *
 * This module defines the core types for the AI agent system.
 * Designed to be future-proof for when native function calling is available.
 */

/**
 * Tool parameter schema (JSON Schema subset)
 */
export interface ToolParameterSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

/**
 * Tool definition following OpenAI/MCP convention
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

/**
 * Tool call request (what the AI sends)
 */
export interface ToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Agent response - unified response from AI agent
 */
export interface AgentResponse {
  /** The text response from the AI */
  text: string;
  /** Whether this is an AI-generated response */
  isAI: boolean;
  /** Tool calls made (if any) */
  toolCalls?: ToolCall[];
  /** Results from tool execution */
  toolResults?: ToolResult[];
  /** Execution metadata */
  metadata?: {
    executionTime?: number;
    strategy?: "hybrid" | "function-calling" | "fallback";
    contextInfo?: string[];
  };
}

/**
 * BIM context passed to the AI
 */
export interface BIMContext {
  totalElements?: number;
  elementTypes?: string[];
  selectedCount?: number;
  lastAction?: string;
}

/**
 * Agent strategy interface - allows swapping execution strategies
 */
export interface IAgentStrategy {
  /** Strategy name for logging/debugging */
  readonly name: string;

  /**
   * Process a user command and return a response
   * @param command User's natural language command
   * @param context Current BIM context
   * @param onStreamToken Optional streaming callback
   */
  processCommand(
    command: string,
    context: BIMContext,
    onStreamToken?: (token: string) => void
  ): Promise<AgentResponse>;

  /**
   * Check if this strategy is available/ready
   */
  isAvailable(): boolean;
}

/**
 * Tool executor interface
 */
export interface IToolExecutor {
  /**
   * Execute a tool call
   */
  execute(toolCall: ToolCall): Promise<ToolResult>;

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean;

  /**
   * Get all available tool names
   */
  getToolNames(): string[];
}
