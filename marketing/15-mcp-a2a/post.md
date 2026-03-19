---
title: 37 Functions → REST + MCP + A2A, Auto-Generated
day: 43
demo: "Ecommerce \u2014 MCP & A2A Integration"
link: https://www.sunholo.com/ailang-demos/
assets:
  - "Image: `ecommerce/img/openapi-redoc.png`"
  - "Alt image: `ecommerce/img/ecommerce-dashboard-ui.png`"
---

One command. 37 AILANG functions become:
- REST endpoints (`POST /api/{module}/{func}`)
- MCP tools (for Claude Desktop, Cursor, any MCP client)
- A2A skills (Agent-to-Agent protocol)

```
ailang serve-api --port 8092 --mcp-http \
  ecommerce/contracts_demo.ail \
  ecommerce/services/ga4_queries.ail \
  ecommerce/services/recommendations.ail
```

From this, you get automatically:
- OpenAPI 3.1 spec generated from Hindley-Milner type signatures
- Swagger UI at `/api/_meta/docs`
- ReDoc at `/api/_meta/redoc`
- MCP HTTP transport at `POST /mcp/`
- A2A Agent Card at `/.well-known/agent.json`

Want to use these functions in Claude Desktop? Add to your MCP config:

```json
{
  "mcpServers": {
    "ailang-ecommerce": {
      "command": "ailang",
      "args": ["serve-api", "--mcp", "--caps", "IO,AI,FS,Net",
               "ecommerce/contracts_demo.ail",
               "ecommerce/services/ga4_queries.ail"]
    }
  }
}
```

Claude can now call your contract-verified AILANG functions directly. With the same safety guarantees — contracts, budgets, effects — all enforced.

One codebase. Three integration surfaces. Zero glue code.

The React dashboard provides an interactive UI on top of the same API: contracts tab, analytics tab, AI recommendations tab.

#MCP #AgentToAgent #APIDesign #AIIntegration
