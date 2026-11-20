import fs from "fs/promises";
import path from "path";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const file = process.env.WATCHTOWER_AGENT_PATH || path.join(process.cwd(), "agent", "watchtower-agent.ps1");
    const text = (await fs.readFile(file, "utf8")).replaceAll("__WATCHTOWER_SERVER__", new URL(req.url).origin);
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="watchtower-agent.ps1"',
      },
    });
  });
}
