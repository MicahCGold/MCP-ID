import { generateServerID } from './hash';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file path for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MCP Protocol types
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: {
    tools?: {
      listChanged?: boolean;
    };
    resources?: {
      subscribe?: boolean;
      listChanged?: boolean;
    };
    prompts?: {
      listChanged?: boolean;
    };
    logging?: {};
    roots?: {
      listChanged?: boolean;
    };
  };
  serverInfo?: {
    name: string;
    version: string;
  };
  tools: any[];
  resources: any[];
  prompts: any[];
  roots: any[];
  endpoint: string;
  error?: string;
}

class MCPClient {
  private requestId = 1;
  private endpoint: string;
  private timeout: number;
  private sessionId: string | null = null;
  private initialized = false;

  constructor(endpoint: string, timeout: number = 10000) {
    this.endpoint = endpoint;
    this.timeout = timeout;
  }

  private async sendRequest(method: string, params?: any): Promise<MCPResponse> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method,
      params
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      };

      // Add session ID to headers if we have one AND it's not the initialize call
      if (this.sessionId && method !== 'initialize') {
        headers['mcp-session-id'] = this.sessionId; 
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (method === 'initialize' && !this.sessionId) {
        this.sessionId = response.headers.get('mcp-session-id');
        if (this.sessionId) {
          console.log(`✅ Session ID extracted from header: ${this.sessionId}`);
        }
      }

      const responseText = await response.text();
      
      // Handle SSE format response
      if (responseText.startsWith('event: message')) {
        const lines = responseText.split('\n');
        const dataLine = lines.find(line => line.startsWith('data: '));
        
        if (dataLine) {
          const jsonData = dataLine.substring(6); // Remove 'data: ' prefix
          const data: MCPResponse = JSON.parse(jsonData);
          return data;
        }
      }
      
      // Fallback to regular JSON parsing
      const data: MCPResponse = JSON.parse(responseText);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async initialize(): Promise<MCPResponse> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {
          listChanged: true
        },
        sampling: {}
      },
      clientInfo: {
        name: 'mcp-server-comparator',
        version: '1.0.0'
      }
    });
    
    this.initialized = true;
    return response;
  }

  async listTools(): Promise<MCPResponse> {
    if (!this.initialized) {
      throw new Error('Client must be initialized before listing tools');
    }
    return this.sendRequest('tools/list');
  }

  async listResources(): Promise<MCPResponse> {
    if (!this.initialized) {
      throw new Error('Client must be initialized before listing resources');
    }
    return this.sendRequest('resources/list');
  }

  async listPrompts(): Promise<MCPResponse> {
    if (!this.initialized) {
      throw new Error('Client must be initialized before listing prompts');
    }
    return this.sendRequest('prompts/list');
  }

  async listRoots(): Promise<MCPResponse> {
    if (!this.initialized) {
      throw new Error('Client must be initialized before listing roots');
    }
    return this.sendRequest('roots/list');
  }

  async ping(): Promise<MCPResponse> {
    return this.sendRequest('ping');
  }

  async getServerInfo(): Promise<MCPServerInfo> {
    const serverInfo: MCPServerInfo = {
      name: '',
      version: '',
      protocolVersion: '',
      capabilities: {},
      tools: [],
      resources: [],
      prompts: [],
      roots: [],
      endpoint: this.endpoint
    };

    try {
      console.log(`Initializing MCP connection to ${this.endpoint}...`);

      // Step 1: Initialize the connection
      const initResponse = await this.initialize();
      if (initResponse.error) {
        throw new Error(`Initialize failed: ${initResponse.error.message}`);
      }

      // Extract server information from initialize response
      const initResult = initResponse.result;
      if (initResult) {
        serverInfo.protocolVersion = initResult.protocolVersion || '';
        serverInfo.capabilities = initResult.capabilities || {};
        
        if (initResult.serverInfo) {
          serverInfo.name = initResult.serverInfo.name || '';
          serverInfo.version = initResult.serverInfo.version || '';
        }
      }

      console.log(`✅ Connected to MCP server: ${serverInfo.name || 'Unknown'}`);

      // Step 2: List all available tools
      try {
        const toolsResponse = await this.listTools();
        if (toolsResponse.result && toolsResponse.result.tools) {
          serverInfo.tools = toolsResponse.result.tools;
          console.log(`📋 Found ${serverInfo.tools.length} tools:`);
          serverInfo.tools.forEach(tool => {
            console.log(`   • ${tool.name}: ${tool.description}`);
          });
        } else if (toolsResponse.error) {
          console.warn(`⚠️  Failed to list tools: ${toolsResponse.error.message}`);
        }
      } catch (error: any) {
        console.warn(`⚠️  Failed to list tools: ${error?.message || 'Unknown error'}`);
      }

      // Step 3: List all available resources
      try {
        const resourcesResponse = await this.listResources();
        if (resourcesResponse.result && resourcesResponse.result.resources) {
          serverInfo.resources = resourcesResponse.result.resources;
          console.log(`📁 Found ${serverInfo.resources.length} resources`);
        } else if (resourcesResponse.error) {
          console.warn(`⚠️  Failed to list resources: ${resourcesResponse.error.message}`);
        }
      } catch (error: any) {
        console.warn(`⚠️  Failed to list resources: ${error?.message || 'Unknown error'}`);
      }

      // Step 4: List all available prompts
      try {
        const promptsResponse = await this.listPrompts();
        if (promptsResponse.result && promptsResponse.result.prompts) {
          serverInfo.prompts = promptsResponse.result.prompts;
          console.log(`💬 Found ${serverInfo.prompts.length} prompts`);
        } else if (promptsResponse.error) {
          console.warn(`⚠️  Failed to list prompts: ${promptsResponse.error.message}`);
        }
      } catch (error: any) {
        console.warn(`⚠️  Failed to list prompts: ${error?.message || 'Unknown error'}`);
      }

      // Step 5: List all available roots (if supported)
      try {
        const rootsResponse = await this.listRoots();
        if (rootsResponse.result && rootsResponse.result.roots) {
          serverInfo.roots = rootsResponse.result.roots;
          console.log(`🌳 Found ${serverInfo.roots.length} roots`);
        } else if (rootsResponse.error) {
          console.warn(`⚠️  Failed to list roots: ${rootsResponse.error.message}`);
        }
      } catch (error: any) {
        console.warn(`⚠️  Failed to list roots: ${error?.message || 'Unknown error'}`);
      }

      // Step 6: Test ping if available
      try {
        const pingResponse = await this.ping();
        if (pingResponse.result) {
          console.log(`🏓 Ping successful`);
        } else if (pingResponse.error) {
          console.warn(`⚠️  Ping failed: ${pingResponse.error.message}`);
        }
      } catch (error: any) {
        console.warn(`⚠️  Ping failed: ${error?.message || 'Unknown error'}`);
      }

      return serverInfo;

    } catch (error: any) {
      console.error(`❌ Failed to connect to MCP server at ${this.endpoint}:`, error?.message || 'Unknown error');
      
      return {
        ...serverInfo,
        error: error?.message || 'Unknown error'
      };
    }
  }
}

// Copy the rest of the functions from the original file
function normalizeServerInfo(serverInfo: MCPServerInfo): MCPServerInfo {
  return {
    name: serverInfo.name || '',
    version: serverInfo.version || '',
    protocolVersion: serverInfo.protocolVersion || '',
    capabilities: serverInfo.capabilities || {},
    tools: serverInfo.tools || [],
    resources: serverInfo.resources || [],
    prompts: serverInfo.prompts || [],
    roots: serverInfo.roots || [],
    endpoint: serverInfo.endpoint,
    error: serverInfo.error
  };
}

function compareServerConfigs(server1: MCPServerInfo, server2: MCPServerInfo): string[] {
  const differences: string[] = [];
  
  if (server1.name !== server2.name) {
    differences.push(`Name: "${server1.name}" vs "${server2.name}"`);
  }
  
  if (server1.version !== server2.version) {
    differences.push(`Version: "${server1.version}" vs "${server2.version}"`);
  }
  
  if (server1.protocolVersion !== server2.protocolVersion) {
    differences.push(`Protocol Version: "${server1.protocolVersion}" vs "${server2.protocolVersion}"`);
  }
  
  if (JSON.stringify(server1.capabilities) !== JSON.stringify(server2.capabilities)) {
    differences.push('Capabilities differ');
  }
  
  if (server1.tools.length !== server2.tools.length) {
    differences.push(`Tools count: ${server1.tools.length} vs ${server2.tools.length}`);
  }
  
  if (server1.resources.length !== server2.resources.length) {
    differences.push(`Resources count: ${server1.resources.length} vs ${server2.resources.length}`);
  }
  
  if (server1.prompts.length !== server2.prompts.length) {
    differences.push(`Prompts count: ${server1.prompts.length} vs ${server2.prompts.length}`);
  }
  
  if (server1.roots.length !== server2.roots.length) {
    differences.push(`Roots count: ${server1.roots.length} vs ${server2.roots.length}`);
  }
  
  if (server1.error && !server2.error) {
    differences.push(`Server errors: ${server1.error} vs none`);
  } else if (!server1.error && server2.error) {
    differences.push(`Server errors: none vs ${server2.error}`);
  } else if (server1.error && server2.error && server1.error !== server2.error) {
    differences.push(`Server errors: ${server1.error} vs ${server2.error}`);
  }
  
  return differences;
}

function convertToServerInterface(serverInfo: MCPServerInfo): any {
  return {
    name: serverInfo.name,
    version: serverInfo.version,
    tools: serverInfo.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    resources: serverInfo.resources.map(resource => ({
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
      uriTemplate: resource.uriTemplate,
    })),
    prompts: serverInfo.prompts.map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    })),
    capabilities: serverInfo.capabilities,
  };
}

// Function to get server info from MCP endpoint
async function getMCPServerInfo(endpoint: string): Promise<MCPServerInfo> {
  const client = new MCPClient(endpoint);
  return await client.getServerInfo();
}

// Main function to compare two MCP servers
async function compareServers(endpoint1: string, endpoint2: string): Promise<void> {
  console.log(`\n🔍 Comparing MCP servers:`);
  console.log(`  Server 1: ${endpoint1}`);
  console.log(`  Server 2: ${endpoint2}`);
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    // Fetch server information from both endpoints
    const [server1Raw, server2Raw] = await Promise.all([
      getMCPServerInfo(endpoint1),
      getMCPServerInfo(endpoint2)
    ]);

    const server1 = normalizeServerInfo(server1Raw);
    const server2 = normalizeServerInfo(server2Raw);

    // Generate hashes for comparison
    const hash1 = generateServerID(convertToServerInterface(server1));
    const hash2 = generateServerID(convertToServerInterface(server2));

    console.log('\n📊 Server 1 Information:');
    console.log(JSON.stringify(server1, null, 2));
    
    console.log('\n📊 Server 2 Information:');
    console.log(JSON.stringify(server2, null, 2));
    
    console.log('\n🔐 Hash Comparison:');
    console.log(`Server 1 hash: ${hash1}`);
    console.log(`Server 2 hash: ${hash2}`);
    console.log(`Match: ${hash1 === hash2}`);
    
    if (hash1 === hash2) {
      console.log('\n✅ SUCCESS: Both servers have identical configurations!');
    } else {
      console.log('\n❌ DIFFERENCE: Servers have different configurations.');
      
      // Show detailed differences
      const differences = compareServerConfigs(server1, server2);
      if (differences.length > 0) {
        console.log('\n📋 Differences found:');
        differences.forEach(diff => console.log(`  • ${diff}`));
      }
    }
    
  } catch (error) {
    console.error('💥 Error during comparison:', error);
  }
}

// Helper function for localhost comparison (legacy support)
async function compareLocalServers(port1: number = 8080, port2: number = 8081): Promise<void> {
  const endpoint1 = `http://localhost:${port1}/mcp`;
  const endpoint2 = `http://localhost:${port2}/mcp`;
  return compareServers(endpoint1, endpoint2);
}

// Check if this is the main module (ES module equivalent)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

// Run comparison if this is the main module
if (isMainModule) {
  // Default comparison between localhost:8080 and localhost:8081
  compareLocalServers().catch(console.error);
}

// Export the main functions
export { 
  MCPClient, 
  getMCPServerInfo, 
  compareServers, 
  compareLocalServers, 
  normalizeServerInfo,
  MCPServerInfo
}; 