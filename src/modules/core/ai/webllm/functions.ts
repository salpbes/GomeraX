import type { BIMFunctionDefinition } from "./types";

/**
 * BIM function definitions for AI function calling
 * These functions allow the AI to interact with the BIM model
 * 
 * Categories:
 * - Element Selection & Visibility
 * - Camera & Navigation
 * - Measurement Tools
 * - Visualization Modes
 * - Model Information
 * - Floor Plans & Storeys
 */
export const BIM_FUNCTIONS: BIMFunctionDefinition[] = [
  // ============================================================================
  // ELEMENT SELECTION & VISIBILITY
  // ============================================================================
  {
    name: "selectElements",
    description:
      "Select elements in the BIM model by type (e.g., walls, doors, windows, slabs, columns). Can also be used with 'them' to select previously counted/mentioned elements from context.",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description:
            "List of IFC element types to select (e.g., ['IFCWALL', 'IFCDOOR']). Optional if referring to context (e.g., 'select them')",
        },
      },
      required: [],
    },
  },
  {
    name: "hideElements",
    description: "Hide elements in the BIM model by type. Can also be used with 'them' to hide previously mentioned elements from context.",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "List of IFC element types to hide. Optional if referring to context (e.g., 'hide them')",
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
    name: "showAll",
    description: "Show all elements in the model (unhide everything). Use when user wants to see everything again, or says 'show all', 'unhide all', 'display everything'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "hideAll",
    description: "Hide all elements in the model. Use when user wants to hide everything or start with a clean slate.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "isolateElements",
    description: "Isolate specific elements (hide everything else). Can also be used with 'them' to isolate previously counted/mentioned elements from context.",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "List of IFC element types to isolate. Optional if referring to context (e.g., 'isolate them')",
        },
      },
      required: [],
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

  // ============================================================================
  // CAMERA & NAVIGATION
  // ============================================================================
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
    description: "Fit the entire model in the viewport. Use when user says 'fit', 'fit all', 'show entire model', 'zoom to fit'.",
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
    name: "rotateCamera",
    description: "Rotate the camera around the model by a specified angle in degrees",
    parameters: {
      type: "object",
      properties: {
        angle: {
          type: "number",
          description: "Rotation angle in degrees (positive = clockwise, negative = counter-clockwise). Default is 90 degrees.",
        },
      },
    },
  },
  {
    name: "toggleFirstPerson",
    description: "Toggle first-person walk-through mode. Allows the user to walk through the building like in a video game using WASD keys and mouse. Use when user says 'walk mode', 'first person', 'walkthrough', 'walk through the building', 'explore inside'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // ============================================================================
  // MEASUREMENT TOOLS
  // ============================================================================
  {
    name: "enableMeasurement",
    description: "Enable measurement mode to measure distances, areas, or volumes. Click points in the model to measure.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["length", "area", "volume"],
          description: "Type of measurement: 'length' for distance between points, 'area' for surface area, 'volume' for 3D volume",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "disableMeasurement",
    description: "Disable/exit measurement mode and return to normal navigation",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "clearMeasurements",
    description: "Clear all measurements from the view",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // ============================================================================
  // SECTIONING & CLIPPING
  // ============================================================================
  {
    name: "addClippingPlane",
    description: "Add a section/clipping plane to cut through the model. Use when user wants to create a section, slice the model, or see inside. Requires specifying an axis: 'x' for left/right cut, 'y' for front/back cut, 'z' for top/bottom horizontal cut.",
    parameters: {
      type: "object",
      properties: {
        axis: {
          type: "string",
          enum: ["x", "y", "z"],
          description: "The axis for the clipping plane: 'x' (left/right vertical cut), 'y' (front/back vertical cut), 'z' (horizontal floor cut)",
        },
      },
      required: ["axis"],
    },
  },
  {
    name: "clearClippingPlanes",
    description: "Remove all clipping/section planes from the model",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "toggleClipper",
    description: "Toggle the clipping/sectioning tool on or off",
    parameters: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "True to enable, false to disable the clipper",
        },
      },
    },
  },

  // ============================================================================
  // VISUALIZATION MODES
  // ============================================================================
  {
    name: "colorByType",
    description: "Toggle color splash mode - colors all elements by their IFC type/category. Use when user wants to see elements colored by type, category, or wants visual differentiation of element types.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "toggleClusterView",
    description: "Toggle cluster/exploded view mode. This separates elements by type into organized groups (like taking LEGO apart by color). Use when user says 'explode', 'cluster view', 'separate by type', 'organize elements', 'exploded view'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "toggleSpaceVisibility",
    description: "Toggle visibility of IFC spaces/rooms. Spaces are often hidden by default. Use when user wants to see or hide room boundaries, spaces, or says 'show spaces', 'hide spaces', 'show rooms'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "resetView",
    description:
      "Reset the view completely: exit color splash mode, exit cluster mode, clear selection, show everything, remove clipping planes. Use when user says 'reset', 'normal view', 'go back', 'exit cluster', 'exit color', 'default view', 'back to normal'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // ============================================================================
  // MODEL INFORMATION
  // ============================================================================
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
    name: "getModelInfo",
    description: "Get general information about the loaded model(s): number of elements, types present, file info. Use when user asks 'what is loaded', 'model info', 'what's in this model', 'model statistics'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "listElementTypes",
    description: "List all IFC element types/categories present in the model. Use when user asks 'what types are there', 'list categories', 'what elements exist', 'show me the categories'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getStoreys",
    description: "Get list of building storeys/floors with their elevations. Use when user asks 'what floors are there', 'list storeys', 'building levels', 'how many floors'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getElementDistribution",
    description: "Get distribution of elements by storey/floor. Shows how many elements of each type are on each floor. Use when user asks 'where are the windows', 'which floor has the most doors', 'where are they located', 'distribution by floor', 'elements per storey'.",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "IFC element types to analyze distribution for (e.g., ['IFCWINDOW'])",
        },
      },
      required: ["elementTypes"],
    },
  },

  // ============================================================================
  // FLOOR PLANS & STOREYS
  // ============================================================================
  {
    name: "showFloorPlan",
    description: "Switch to 2D floor plan view of a specific storey/level. Shows a top-down orthographic view of the selected floor.",
    parameters: {
      type: "object",
      properties: {
        storeyName: {
          type: "string",
          description: "Name of the storey to show (e.g., 'Level 1', 'Ground Floor', 'Basement'). If not specified, shows the first/ground floor.",
        },
      },
    },
  },
  {
    name: "exitFloorPlan",
    description: "Exit floor plan mode and return to 3D view. Use when user says 'exit floor plan', 'back to 3D', '3D view', 'leave plan view'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // ============================================================================
  // UTILITY
  // ============================================================================
  {
    name: "takeScreenshot",
    description: "Take a screenshot of the current view. Use when user says 'screenshot', 'capture', 'save image', 'take a picture'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  
  // ============================================================================
  // WEB CONTENT
  // ============================================================================
  {
    name: "fetchWebPage",
    description: "Fetch content from a web page URL. Loads first 1000 characters. Use when user provides a URL or asks to read/fetch a website.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the web page to fetch",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "loadMoreWebContent",
    description: "Load more content from the previously fetched web page. Use when user asks to 'load more', 'fetch more', 'continue reading', or when you need more context to answer a question about the web page. Specify count for how many 1k chunks to load.",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of 1k character chunks to load (1-10). Use higher values when searching for specific content or user wants more data. Default is 1.",
        },
      },
    },
  },
  {
    name: "searchWebPage",
    description: "Search a web page for specific terms and return only the relevant snippets. More efficient than loading entire pages when looking for specific information. Use when user asks to 'find X on page', 'search for Y', 'what does page say about Z', or asks a specific question about content on a URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the web page to search",
        },
        searchTerms: {
          type: "string",
          description: "The keywords or phrase to search for in the page content",
        },
      },
      required: ["url", "searchTerms"],
    },
  },
  {
    name: "getPageSections",
    description: "Get all section headers (H1-H6) from a webpage. Returns a list of section titles for browsing. Use this first when user wants to explore a page's structure or find specific topics. After getting headers, use getSectionContent to fetch specific sections.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the web page to get sections from",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "getSectionContent",
    description: "Get the full content of specific sections from a previously fetched page. Use after getPageSections to retrieve content from relevant sections. Pass the section indices (numbers) returned by getPageSections.",
    parameters: {
      type: "object",
      properties: {
        sectionIndices: {
          type: "array",
          items: { type: "number" },
          description: "Array of section index numbers to fetch content from (from getPageSections)",
        },
      },
      required: ["sectionIndices"],
    },
  },
  {
    name: "smartSearch",
    description: "Smart search: Automatically finds and fetches the most relevant sections from a webpage based on a topic. Use this when user asks about a specific topic on a webpage. This is the PREFERRED function for web research - it finds matching section headers and returns their content for you to summarize.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the web page to search",
        },
        topic: {
          type: "string",
          description: "The topic or keywords to search for (e.g., 'company history', 'features', 'pricing')",
        },
      },
      required: ["url", "topic"],
    },
  },

  // ============================================================================
  // PROPERTY QUERIES
  // ============================================================================
  {
    name: "queryPropertyValues",
    description: "Query what values a specific property has across elements. Use when user asks 'what materials are the walls?', 'what are the fire ratings?', 'list all door types', 'what heights do columns have?'. Returns unique values with counts.",
    parameters: {
      type: "object",
      properties: {
        propertyName: {
          type: "string",
          description: "The name of the property to query (e.g., 'Material', 'FireRating', 'Height', 'LoadBearing', 'ObjectType')",
        },
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Filter to specific IFC element types (e.g., ['IFCWALL', 'IFCDOOR'])",
        },
        storeyName: {
          type: "string",
          description: "Optional: Filter to a specific storey/floor (e.g., 'Level 1', 'Ground Floor')",
        },
      },
      required: ["propertyName"],
    },
  },
  {
    name: "aggregateProperty",
    description: "Calculate aggregate statistics for a numeric property. Use when user asks 'total area of slabs', 'average height of walls', 'maximum width', 'sum of volumes', 'count elements with property'.",
    parameters: {
      type: "object",
      properties: {
        propertyName: {
          type: "string",
          description: "The name of the numeric property to aggregate (e.g., 'Area', 'Volume', 'Height', 'Width', 'Length')",
        },
        aggregation: {
          type: "string",
          enum: ["sum", "average", "min", "max", "count"],
          description: "Type of aggregation: sum, average, min, max, or count",
        },
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Filter to specific IFC element types",
        },
        storeyName: {
          type: "string",
          description: "Optional: Filter to a specific storey/floor",
        },
      },
      required: ["propertyName", "aggregation"],
    },
  },
  {
    name: "findElementsByProperty",
    description: "Find and select elements that match a property criteria. Use when user asks 'find fire rated doors', 'select walls made of concrete', 'show load bearing columns', 'find elements taller than 3m'.",
    parameters: {
      type: "object",
      properties: {
        propertyName: {
          type: "string",
          description: "The name of the property to filter by",
        },
        operator: {
          type: "string",
          enum: ["equals", "contains", "greaterThan", "lessThan", "notEquals"],
          description: "Comparison operator: equals, contains (for text), greaterThan, lessThan (for numbers), notEquals",
        },
        value: {
          type: "string",
          description: "The value to compare against (use string even for numbers)",
        },
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Filter to specific IFC element types first",
        },
      },
      required: ["propertyName", "operator", "value"],
    },
  },
  {
    name: "getSelectedProperties",
    description: "Get detailed properties of currently selected elements. Use when user asks 'what are the properties of selected elements?', 'show me details of selection', 'what material is this?', 'properties of selected'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "listAvailableProperties",
    description: "List all available property names in the model. Use when user asks 'what properties exist?', 'list available properties', 'what data is in the model?', 'show property names'.",
    parameters: {
      type: "object",
      properties: {
        elementTypes: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Filter to specific IFC element types to see their properties",
        },
      },
    },
  },
];

/**
 * IFC element type reference for the AI
 * Common IFC types that users might ask about
 */
export const IFC_TYPE_REFERENCE = {
  structural: ["IFCWALL", "IFCWALLSTANDARDCASE", "IFCCOLUMN", "IFCBEAM", "IFCSLAB", "IFCFOOTING", "IFCPILE"],
  openings: ["IFCDOOR", "IFCWINDOW", "IFCOPENINGELEMENT"],
  circulation: ["IFCSTAIR", "IFCSTAIRFLIGHT", "IFCRAMP", "IFCRAMPFLIGHT", "IFCRAILING"],
  mechanical: ["IFCFLOWSEGMENT", "IFCFLOWFITTING", "IFCFLOWTERMINAL", "IFCDUCTFITTING", "IFCDUCTSEGMENT", "IFCPIPEFITTING", "IFCPIPESEGMENT"],
  furniture: ["IFCFURNISHINGELEMENT", "IFCFURNITURE"],
  spaces: ["IFCSPACE", "IFCZONE"],
  coverings: ["IFCCOVERING", "IFCCEILING"],
  other: ["IFCBUILDINGELEMENTPROXY", "IFCPLATE", "IFCMEMBER", "IFCCURTAINWALL"],
};

/**
 * Common IFC property names for AI reference
 */
export const COMMON_PROPERTIES = {
  geometric: ["Height", "Width", "Length", "Area", "Volume", "Perimeter", "Thickness"],
  identity: ["Name", "Description", "ObjectType", "Tag", "GlobalId"],
  classification: ["Material", "FireRating", "LoadBearing", "IsExternal", "ThermalTransmittance"],
  location: ["Level", "Storey", "Elevation", "Reference"],
};

/**
 * Convert BIM function definitions to OpenAI-compatible tool format
 */
export function getBIMFunctionsAsTools() {
  return BIM_FUNCTIONS.map((f) => ({
    type: "function" as const,
    function: f,
  }));
}
