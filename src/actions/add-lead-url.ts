import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const addLeadUrlSchema = z.object({
  linkedin_profile_url: z.string().url(),
  list: z.string(),
});

export type AddLeadUrlParams = z.infer<typeof addLeadUrlSchema>;

export async function addLeadUrl(
  client: KanboxClient,
  params: AddLeadUrlParams,
) {
  const { status } = await client.post(
    "/public/leadurl",
    undefined,
    { linkedin_profile_url: params.linkedin_profile_url, list: params.list },
  );

  return {
    success: true,
    status,
    linkedin_profile_url: params.linkedin_profile_url,
    list: params.list,
    note:
      "Lead import queued (async). Full enrichment takes several minutes. Poll list_lists and check is_processing flag on the target list to monitor progress.",
  };
}
