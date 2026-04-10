# Govrail Web Console

This `web/` app is the Next.js 14 console for Govrail.

## Commands

- `npm run dev`
- `npm run build`
- `npm run check`
- `npm run preview`
- `npm run preview:staging`
- `npm run deploy`
- `npm run deploy:staging`
- `npm run deploy:staging:dry-run`

## Notes

- The Worker API remains in the repo root under `src/`.
- Set `NEXT_PUBLIC_CONTROL_PLANE_BASE_URL` if the console should call a deployed API instead of local preview data.
- For server-side proxy routes, prefer `CONTROL_PLANE_BASE_URL`, `CONTROL_PLANE_TENANT_ID`, `CONTROL_PLANE_SUBJECT_ID`, and `CONTROL_PLANE_SUBJECT_ROLES`.
- Cloudflare/OpenNext deployment is configured in [wrangler.jsonc](/Users/zh/Documents/codeX/agent_control_plane/web/wrangler.jsonc) and [open-next.config.ts](/Users/zh/Documents/codeX/agent_control_plane/web/open-next.config.ts).
- The current production endpoints are `https://govrail.net` for the console and `https://api.govrail.net` for the API.
- The staging console deploy targets the `agent-control-plane-web-staging` Worker on `workers.dev` and points server-side proxy traffic at `https://agent-control-plane-staging.izhenghaocn.workers.dev`.
- The layout and tokens currently follow `AgentOS_UI_Spec.md`.
