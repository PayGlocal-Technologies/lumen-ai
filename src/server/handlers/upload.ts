import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { isLumenEnabled } from "../guards.js";
import type { LumenConfig } from "../config.js";
import { resolveConfig } from "../config.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function createUploadHandler(cfg: LumenConfig = {}) {
  const resolved = resolveConfig(cfg);

  async function POST(req: Request): Promise<Response> {
    if (!isLumenEnabled(resolved)) return new Response(null, { status: 404 });

    let form: FormData;
    try { form = await req.formData(); }
    catch { return new Response("Invalid form data", { status: 400 }); }

    const file = form.get("file");
    if (!(file instanceof File)) return new Response("Missing file field", { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) {
      return new Response("Only jpeg/png/gif/webp images are supported", { status: 415 });
    }

    const ext = extname(file.name).toLowerCase() || ".png";
    const tmpPath = join(tmpdir(), `lumen-${Date.now()}${ext}`);

    try {
      await writeFile(tmpPath, Buffer.from(await file.arrayBuffer()));
    } catch {
      return new Response("Failed to write temp file", { status: 500 });
    }

    return Response.json({ tmpPath });
  }

  return { POST };
}
