import { getWallSummary } from '@/lib/manifest';

/** Compact cached wall manifest consumed by the macro/focus renderer. */
export async function GET(): Promise<Response> {
  return Response.json(await getWallSummary());
}
