import { guardAdminMutation, jsonResponse } from '@/lib/auth';
import { sweepPendingDeletions } from '@/lib/storage/deletions';

/** Resumes every lingering `'deleting'` tombstone (Pending Deletions retry). */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  const result = await sweepPendingDeletions();
  return jsonResponse(result);
}
