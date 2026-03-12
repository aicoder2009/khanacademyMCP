<p align="center">
  <img src="assets/khan-logo.png" alt="Khan Academy" width="400">
</p>

# Khan Academy MCP Server

An open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI assistants search, browse, and read Khan Academy's educational content. No API key required.

## Quick Start

```bash
npx khanacademy-mcp
```

Or install globally:

```bash
npm install -g khanacademy-mcp
khanacademy-mcp
```

## Claude Desktop Configuration

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "khanacademy": {
      "command": "npx",
      "args": ["-y", "khanacademy-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `search` | Search Khan Academy for videos, articles, exercises, and courses |
| `list_subjects` | List all top-level subjects and popular courses |
| `get_topic_tree` | Browse the subject/topic hierarchy by slug with configurable depth |
| `get_content` | Get details about a specific content item (video, article, exercise) |
| `get_course` | Get full course structure with units, lessons, and content items |
| `get_transcript` | Get video transcripts (timestamped or full text) |

### Tool Details

#### `search`
```
query: string    — Search query (e.g., "photosynthesis", "quadratic formula")
limit?: number   — Max results (1-30, default: 10)
```

#### `list_subjects`
No parameters. Returns all top-level subjects and popular courses.

#### `get_topic_tree`
```
slug: string     — Topic slug (e.g., "math", "science/biology")
depth?: number   — Levels to fetch (0-3, default: 1)
```

#### `get_content`
```
slug: string     — Content slug or full URL
```

#### `get_course`
```
slug: string     — Course slug or URL (e.g., "math/algebra")
```

#### `get_transcript`
```
slug: string     — Video slug, KA URL, YouTube URL, or YouTube ID
language?: string — Language code (default: "en")
format?: string  — "full", "timestamped", or "both" (default: "full")
```

## Development

```bash
git clone https://github.com/aicoder2009/khanacademyMCP.git
cd khanacademy-mcp
npm install
npm run build
```

Test with:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

## How It Works

Khan Academy deprecated their public API in 2020. This MCP server uses:

- **Khan Academy's internal GraphQL API** — safelisted queries for content metadata and search
- **YouTube transcript API** — fetches video captions/subtitles
- **Page scraping** — extracts structured data from Khan Academy web pages as a fallback
- **Static catalog** — hardcoded top-level subjects for reliable `list_subjects`

All access is read-only with rate limiting (500ms between requests) and in-memory caching to be respectful of Khan Academy's servers.

## Limitations

- No authentication — cannot access user-specific data (progress, recommendations)
- Khan Academy's internal API may change without notice — static fallbacks ensure basic functionality
- Transcript availability depends on YouTube captions being present
- Rate-limited to avoid overloading Khan Academy's servers

## License

MIT
