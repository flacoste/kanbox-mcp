import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const updateMemberSchema = z.object({
  id: z.number().int(),
  email: z.string().optional(),
  phone: z.string().optional(),
  labels: z.array(z.string()).optional(),
  pipeline: z.string().optional(),
  step: z.string().optional(),
  custom: z.string().optional(),
  icebreaker: z.string().optional(),
});

export type UpdateMemberParams = z.infer<typeof updateMemberSchema>;

export async function updateMember(
  client: KanboxClient,
  params: UpdateMemberParams,
) {
  const { id, ...body } = params;
  const { status } = await client.patch(`/public/members/${id}`, body);

  return {
    success: true,
    status,
    id,
    note:
      status === 202
        ? "Operation accepted (async). Changes may take ~3-5 seconds to appear on read. Labels are FULL REPLACEMENT — pass the complete desired list, not just additions."
        : undefined,
  };
}
