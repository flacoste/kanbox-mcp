import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const addLeadUrlSchema = z.object({
  linkedin_profile_url: z.string().url().refine(
    (url) => {
      try {
        return new URL(url).hostname.endsWith("linkedin.com");
      } catch {
        return false;
      }
    },
    { message: "URL must be a LinkedIn profile URL (*.linkedin.com)" },
  ),
  list: z.string().describe("Name of the Kanbox list to add the lead to"),
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
