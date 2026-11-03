// IndexNow key file (public by design). scripts/indexnow.mjs and deploy/vps/update.sh send keyLocation = /indexnow.txt.
import { INDEXNOW_KEY } from "@/lib/site";

export const dynamic = "force-static";
export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
