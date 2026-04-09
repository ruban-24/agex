import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getTools } from './tools.js';

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'agentpod',
    version: '0.1.0',
  });

  const tools = getTools();

  for (const tool of tools) {
    if (tool.inputSchema) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        async (args) => {
          try {
            const result = await tool.handler(args as Record<string, unknown>);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
              isError: true,
            };
          }
        },
      );
    } else {
      server.registerTool(tool.name, { description: tool.description }, async () => {
        try {
          const result = await tool.handler({});
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      });
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Auto-start when run directly
startMcpServer().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
