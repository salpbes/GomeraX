/**
 * Tool Registry - Central registry for all available tools
 *
 * MCP-Inspired: Tools are registered with schemas that can be:
 * 1. Sent to AI for function calling (when supported)
 * 2. Used for validation
 * 3. Used for documentation/help
 */

import type { ToolDefinition } from "./types";

/**
 * BIM Tool definitions following OpenAI/MCP function calling format
 */
export const BIM_TOOLS: ToolDefinition[] = [
  // Element selection/visibility tools
  {
    name: "selectElements",
    description:
      "Select elements in the BIM model by type (e.g., walls, doors, windows)",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description:
            "List of IFC element types to select (e.g., ['IFCWALL', 'IFCDOOR'])",
        },
      },
      required: ["elementTypes"],
    },
  },
  {
    name: "hideElements",
    description: "Hide elements in the BIM model by type",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "List of IFC element types to hide",
        },
      },
      required: ["elementTypes"],
    },
  },
  {
    name: "showElements",
    description: "Show (unhide) elements in the BIM model by type",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "List of IFC element types to show",
        },
      },
      required: ["elementTypes"],
    },
  },
  {
    name: "isolateElements",
    description: "Isolate specific elements (hide everything else)",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "List of IFC element types to isolate",
        },
      },
      required: ["elementTypes"],
    },
  },
  {
    name: "zoomToElements",
    description: "Zoom camera to focus on specific elements",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "List of IFC element types to zoom to",
        },
      },
      required: ["elementTypes"],
    },
  },
  {
    name: "countElements",
    description: "Count the number of elements by type",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "List of IFC element types to count",
        },
      },
      required: ["elementTypes"],
    },
  },

  // View control tools
  {
    name: "resetView",
    description:
      "Reset the view (clear selection, show everything, remove clipping planes)",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "clearSelection",
    description: "Clear the current selection",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "hideEverything",
    description: "Hide all elements in the model",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "colorByType",
    description: "Toggle color splash mode (color elements by their type)",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "addClippingPlane",
    description: "Add a section/clipping plane to cut through the model",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "fitView",
    description: "Fit the entire model in the viewport",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "setView",
    description:
      "Change camera to a standard view (top, front, back, left, right, isometric)",
    parameters: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["top", "front", "back", "left", "right", "iso"],
          description: "The standard view to set",
        },
      },
      required: ["view"],
    },
  },
  {
    name: "zoom",
    description: "Zoom in or out",
    parameters: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["in", "out"],
          description: "Direction to zoom",
        },
      },
      required: ["direction"],
    },
  },

  // Clash detection tools
  {
    name: "runClashDetection",
    description: "Run clash detection to find spatial intersections between building elements",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "clearClashDetection",
    description: "Clear clash detection results and markers",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getClashSummary",
    description: "Get a summary of the current clash detection results",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Tool Registry class - manages tool definitions
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(tools: ToolDefinition[] = BIM_TOOLS) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Register a new tool
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool definition by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool definitions
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools in OpenAI function calling format
   */
  getAsOpenAITools(): Array<{ type: "function"; function: ToolDefinition }> {
    return this.getAll().map((tool) => ({
      type: "function" as const,
      function: tool,
    }));
  }

  /**
   * Get tools in MCP format (for future compatibility)
   */
  getAsMCPTools(): Array<{
    name: string;
    description: string;
    inputSchema: ToolDefinition["parameters"];
  }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    }));
  }
}

/**
 * Default tool registry instance
 */
export const toolRegistry = new ToolRegistry();
