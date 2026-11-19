import { backupDirectory, createBackup, listBackups } from "@/lib/dataio";
import { handle } from "@/lib/http";
import { nextBackupInfo } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ directory: await backupDirectory(), ...(await nextBackupInfo()), history: await listBackups() }));
}

export async function POST() {
  return handle(async () => createBackup("manual"));
}
