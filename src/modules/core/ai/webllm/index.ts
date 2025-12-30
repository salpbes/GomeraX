/**
 * WebLLM Module
 *
 * Local, privacy-preserving AI inference using WebGPU
 *
 * Structure:
 * - WebLLMEngine: Main engine class for AI inference
 * - types: TypeScript interfaces and types
 * - config: Model configuration and constants
 * - functions: BIM function definitions for AI function calling
 * - prompts: System prompt builders
 */

// Main engine
export { WebLLMEngine } from "./WebLLMEngine";

// Types
export type {
  BIMFunctionCall,
  BIMContext,
  InitProgress,
  ModelInfo,
  BIMFunctionDefinition,
  ConversationMessage,
} from "./types";

// Configuration
export {
  MODEL_ID,
  MAX_HISTORY_PAIRS,
  CONTEXT_WINDOW_SIZE,
  MAX_TOKENS,
  TEMPERATURE,
  LOG_LEVEL,
  ENABLE_THINKING,
  MODEL_INFO,
} from "./config";

// Functions
export { BIM_FUNCTIONS, getBIMFunctionsAsTools } from "./functions";

// Prompts
export { buildSystemPrompt } from "./prompts";
