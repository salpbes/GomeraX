/**
 * WebLLM Engine - Backward Compatibility Export
 *
 * This file re-exports from the modular structure in ./webllm/
 * for backward compatibility with existing imports.
 *
 * The WebLLM module is now organized as:
 * - webllm/types.ts      - TypeScript interfaces and types
 * - webllm/config.ts     - Model configuration and constants
 * - webllm/functions.ts  - BIM function definitions
 * - webllm/prompts.ts    - System prompt builders
 * - webllm/WebLLMEngine.ts - Main engine class
 * - webllm/index.ts      - Barrel export
 */

export {
  WebLLMEngine,
  type BIMFunctionCall,
  type BIMContext,
  type InitProgress,
  type ModelInfo,
  type BIMFunctionDefinition,
  type ConversationMessage,
  MODEL_ID,
  MAX_HISTORY_PAIRS,
  CONTEXT_WINDOW_SIZE,
  MAX_TOKENS,
  TEMPERATURE,
  LOG_LEVEL,
  ENABLE_THINKING,
  MODEL_INFO,
  BIM_FUNCTIONS,
  getBIMFunctionsAsTools,
  buildSystemPrompt,
} from "./webllm";
