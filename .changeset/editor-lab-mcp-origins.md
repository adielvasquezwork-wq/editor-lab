---
"@basementstudio/shader-lab-mcp": patch
---

The agent bridge no longer trusts the upstream production origin by default; localhost and `*.vercel.app` stay allowed, and other domains can be added with `SHADER_LAB_ALLOWED_ORIGINS`.
