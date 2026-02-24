import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const addLeadSchema = z.object({
  list: z.string(),
  linkedin_public_id: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  job: z.string().optional(),
  icebreaker: z.string().optional(),
  labels: z.array(z.string()).optional(),
  pipeline: z.string().optional(),
  step: z.string().optional(),
});

export type AddLeadParams = z.infer<typeof addLeadSchema>;

export async function addLead(
  client: KanboxClient,
  params: AddLeadParams,
) {
  const { list, ...body } = params;
  const { status } = await client.post("/public/lead", body, { list });

  return {
    success: true,
    status,
    linkedin_public_id: params.linkedin_public_id,
    list,
    note:
      "Lead added to list with partial enrichment (headline, picture only). Lead appears in list view but NOT in main leads UI — requires manual 'add to inbox' in Kanbox. For full enrichment, use add_lead_url instead.",
  };
}
