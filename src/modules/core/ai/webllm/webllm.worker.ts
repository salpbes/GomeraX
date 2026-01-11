/**
 * WebLLM Web Worker
 * Runs AI inference in a separate thread to prevent UI freezing
 * 
 * This worker is loaded by WebLLMEngine when initializing with Web Worker support.
 * It handles all AI inference operations off the main thread.
 */
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// Create the worker handler - this handles all messages from the main thread
const handler = new WebWorkerMLCEngineHandler();

// Listen for messages and let the handler process them
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};

console.log("🤖 WebLLM Worker initialized");
