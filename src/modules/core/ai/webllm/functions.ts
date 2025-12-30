import type { BIMFunctionDefinition } from "./types";

/**
 * BIM function definitions for AI function calling
 * These functions allow the AI to interact with the BIM model
 */
export const BIM_FUNCTIONS: BIMFunctionDefinition[] = [
  {
    name: "selectElements",
    description:
      "Select elements in the BIM model by type (e.g., walls, doors, windows, slabs, columns)",
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
    name: "fitView",
    description: "Fit the entire model in the viewport",
    parameters: {
      type: "object",
      properties: {},
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
];

/**
 * Convert BIM function definitions to OpenAI-compatible tool format
 */
export function getBIMFunctionsAsTools() {
  return BIM_FUNCTIONS.map((f) => ({
    type: "function" as const,
    function: f,
  }));
}
