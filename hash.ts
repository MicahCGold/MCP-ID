import crypto from 'crypto';

interface Tool {
  name: string;
  description: string;
  inputSchema: any; // Assuming inputSchema can be any JSON schema
}

interface Resource {
  name: string;
  description: string;
  mimeType: string;
  uriTemplate: string;
}

interface Prompt {
  name: string;
  description: string;
  arguments: any; // Assuming arguments can be any type
}

interface Server {
  name: string;
  version: string;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  capabilities: any; // Assuming capabilities can be any type
}

export function generateServerID(server : Server) {
  const hashableData = {
    // Core server identity
    name: server.name,
    version: server.version,
    
    // Tool signatures (excluding runtime-specific details)
    tools: server.tools.map((tool: Tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema, // JSON schema structure
    })).sort((a: Tool, b: Tool) => a.name.localeCompare(b.name)),
    
    // Resource templates (excluding dynamic URIs)
    resources: server.resources.map((resource: Resource) => ({
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
      uriTemplate: resource.uriTemplate, // Template, not resolved URI
    })).sort((a: Resource, b: Resource) => a.name.localeCompare(b.name)),
    
    // Prompt definitions
    prompts: server.prompts.map((prompt: Prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    })).sort((a: Prompt, b: Prompt) => a.name.localeCompare(b.name)),
    
    // Protocol capabilities
    capabilities: server.capabilities,
  };
  
  const stableString = JSON.stringify(hashableData);
  return crypto.createHash('sha256').update(stableString).digest('hex');
}


