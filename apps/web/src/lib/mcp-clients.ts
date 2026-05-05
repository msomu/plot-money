// MCP client setup snippets shown on the dashboard.
//
// Public production endpoint is https://plot.money/mcp. Each client gets
// the same URL — only the config file path / wrapper format differs.

export type ClientSetup = {
  id: string;
  name: string;
  /** Optional file-path or step text shown above the snippet. */
  pathHint?: string;
  /** Language tag for the code block (json | bash | text). */
  language: 'json' | 'bash' | 'text';
  /** The actual snippet body — token literal is YOUR_TOKEN_HERE. */
  snippet: string;
};

const URL = 'https://plot.money/mcp';

const jsonSnippet = `{
  "mcpServers": {
    "plot-money": {
      "url": "${URL}",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}`;

export const MCP_CLIENTS: ClientSetup[] = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    pathHint:
      'Open the config file:\nmacOS: ~/Library/Application Support/Claude/claude_desktop_config.json\nWindows: %APPDATA%\\Claude\\claude_desktop_config.json',
    language: 'json',
    snippet: jsonSnippet,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    pathHint: 'Run from any project directory:',
    language: 'bash',
    snippet: `claude mcp add plot-money ${URL} \\
  --transport http \\
  --header "Authorization: Bearer YOUR_TOKEN_HERE"`,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    pathHint: 'Edit ~/.cursor/mcp.json (or .cursor/mcp.json in a project):',
    language: 'json',
    snippet: jsonSnippet,
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT (custom connectors)',
    pathHint: 'Settings → Connectors → Add a remote MCP server. Use these values:',
    language: 'text',
    snippet: `URL:           ${URL}
Auth header:   Authorization
Auth value:    Bearer YOUR_TOKEN_HERE
Transport:     Streamable HTTP`,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    pathHint: 'Edit ~/.codeium/windsurf/mcp_config.json:',
    language: 'json',
    snippet: jsonSnippet,
  },
  {
    id: 'vscode',
    name: 'VS Code',
    pathHint: 'Project-scoped: .vscode/mcp.json. User-scoped: settings.json under "mcp.servers".',
    language: 'json',
    snippet: jsonSnippet,
  },
  {
    id: 'zed',
    name: 'Zed',
    pathHint: 'Open settings.json (cmd+,) and add to "context_servers":',
    language: 'json',
    snippet: `{
  "context_servers": {
    "plot-money": {
      "source": "custom",
      "command": null,
      "settings": {
        "url": "${URL}",
        "headers": {
          "Authorization": "Bearer YOUR_TOKEN_HERE"
        }
      }
    }
  }
}`,
  },
];
