import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const updateMemberSchema = z.object({
  id: z.number().int().describe("Member ID (from search_members id field)"),
  email: z.string().describe("New email address").optional(),
  phone: z.string().describe("New phone number").optional(),
  labels: z.array(z.string()).describe("FULL REPLACEMENT label list — pass ALL desired labels, not just additions").optional(),
  pipeline: z
    .string()
    .nullable()
    .describe('Pipeline name to assign; pass "" or null to un-stage (clear the pipeline)')
    .optional(),
  step: z
    .string()
    .nullable()
    .describe('Pipeline step to assign; pass "" or null to clear the step')
    .optional(),
  custom: z.string().describe("Custom note field").optional(),
  icebreaker: z.string().describe("Icebreaker note").optional(),
});

export type UpdateMemberParams = z.infer<typeof updateMemberSchema>;

export async function updateMember(
  client: KanboxClient,
  params: UpdateMemberParams,
) {
  const { id, ...body } = params;
  // KanBox unsets a pipeline/step only on "" — null is a silent no-op — so
  // normalize an explicit clear (null) to the empty string the API acts on.
  for (const key of ["pipeline", "step"] as const) {
    if (body[key] === null) body[key] = "";
  }
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
