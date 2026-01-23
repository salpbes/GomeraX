import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";

/**
 * Available BIM functions that WebLLM can call
 */
export interface BIMFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Batch function call result with multiple actions
 */
export interface BIMBatchFunctionCall {
  actions: BIMFunctionCall[];
  confidence: number;
}

/**
 * BIM context for AI to understand current model state
 */
export interface BIMContext {
  totalElements?: number;
  elementTypes?: string[];
  selectedCount?: number;
  lastAction?: string;
  storeys?: Array<{ name: string; elevation: number }>;
  webContent?: string; // Fetched web page content for Q&A
}

/**
 * Progress callback for model initialization
 */
export interface InitProgress {
  text: string;
  progress: number;
}

/**
 * Model information for display
 */
export interface ModelInfo {
  id: string;
  name: string;
  size: string;
  description: string;
}

/**
 * BIM function definition schema for AI function calling
 */
export interface BIMFunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Conversation message type alias
 */
export type ConversationMessage = ChatCompletionMessageParam;
