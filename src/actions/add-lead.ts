import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const addLeadSchema = z.object({
  list: z.string().describe("Name of the Kanbox list to add the lead to"),
  linkedin_public_id: z.string().describe("Public LinkedIn profile slug (e.g. janedoe)"),
  firstname: z.string().describe("Lead's first name"),
  lastname: z.string().describe("Lead's last name"),
  email: z.string().describe("Lead's email address").optional(),
  phone: z.string().describe("Lead's phone number").optional(),
  company: z.string().describe("Lead's company name").optional(),
  location: z.string().describe("Lead's location").optional(),
  job: z.string().describe("Lead's job title").optional(),
  icebreaker: z.string().describe("Icebreaker note for the lead").optional(),
  labels: z.array(z.string()).describe("Labels to apply to the lead").optional(),
  pipeline: z.string().describe("Pipeline name to assign").optional(),
  step: z.string().describe("Pipeline step to assign").optional(),
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
