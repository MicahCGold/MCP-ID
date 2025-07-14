import { FastMCP } from "fastmcp";
import { z } from "zod"; 

const server = new FastMCP({
  name: "My Server",
  version: "1.0.0",
});

server.addTool({
  name: "add",
  description: "Add two numbers",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: async (args) => {
    return String(args.a + args.b);
  },
});

server.addResource({
  uri: "math://operations",
  name: "Math Operations Guide",
  mimeType: "text/plain",
  async load() {
    return {
      text: "Available math operations:\n1. Addition - Use the 'add' tool to add two numbers\n2. More operations coming soon!",
    };
  },
});

server.addPrompt({
  name: "math-problem",
  description: "Generate a math problem for practice",
  arguments: [
    {
      name: "difficulty",
      description: "Difficulty level (easy, medium, hard)",
      required: false,
    },
  ],
  load: async (args) => {
    const difficulty = args.difficulty || "easy";
    return `Create a ${difficulty} math problem that can be solved using addition. Include the problem statement and ask the user to solve it.`;
  },
});

export default server;
