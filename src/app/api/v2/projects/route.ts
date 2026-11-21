import { bodyOf, handle, rangeFrom } from "@/lib/http";
import { createProject, deleteProject, listProjects, updateProject } from "@/lib/v2/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => ({ projects: await listProjects(rangeFrom(new URL(req.url))), currency: (await getSettings()).currency }));
}
export async function POST(req: Request) {
  return handle(async () => createProject(await bodyOf(req)));
}
export async function PATCH(req: Request) {
  return handle(async () => {
    const b = await bodyOf(req);
    return updateProject(String(b.id ?? ""), b);
  });
}
export async function DELETE(req: Request) {
  return handle(async () => deleteProject(new URL(req.url).searchParams.get("id") ?? ""));
}
