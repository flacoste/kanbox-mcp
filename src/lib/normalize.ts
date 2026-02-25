// Normalize verbose Kanbox API responses into compact, flat structures.
// See plan for field mappings: members flatten lead.*, leads flatten lnuser.*

export interface NormalizedMember {
  id: number;
  linkedin_id: string | null;
  linkedin_public_id: string;
  firstname: string;
  lastname: string;
  headline: string | null;
  company: string | null;
  company_headcount: number | null;
  company_linkedin_url: string | null;
  company_website: string | null;
  job: string | null;
  location: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  picture: string | null;
  skills: string[];
  languages: string[];
  connections: number | null;
  is_connection: boolean;
  is_lead: boolean;
  degree: number | null;
  connected_at: string | null;
  is_premium: boolean;
  is_open_profile: boolean;
  labels: Array<{ id: number; name: string; color: string }>;
  board: number | null;
  step_name: string | null;
  icebreaker: string | null;
  custom: string | null;
  conversations: Array<{ id: number; last_activity: string | null }>;
  last_message: {
    text: string | null;
    at: string | null;
    from_id: string | null;
    attachment_name: string | null;
    attachment_type: string | null;
  } | null;
  invitation_type: string | null;
  invitation_message: string | null;
  is_starred: boolean;
  is_archived: boolean;
  updated_at: string | null;
}

export interface NormalizedLead {
  lead_id: number;
  member_id: number | null;
  linkedin_public_id: string;
  firstname: string;
  lastname: string;
  headline: string | null;
  company: string | null;
  company_headcount: number | null;
  company_linkedin_url: string | null;
  company_website: string | null;
  job: string | null;
  location: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  picture: string | null;
  skills: string[];
  languages: string[];
  connections: number | null;
  is_connection: boolean;
  degree: number | null;
  connected_at: string | null;
  labels: Array<{ id: number; name: string; color: string }>;
  invitation_type: string | null;
  invitation_message: string | null;
  updated_at: string | null;
}

export interface NormalizedMessage {
  text: string | null;
  from: string;
  from_linkedin_id: string | null;
  at: string;
  is_from_participant: boolean;
  attachment_name: string | null;
  attachment_type: string | null;
}

export interface NormalizedList {
  id: number;
  name: string;
  total_count: number;
  is_processing: boolean;
}

export function normalizeMember(raw: Record<string, unknown>): NormalizedMember {
  const lead = (raw.lead ?? {}) as Record<string, unknown>;
  const lastMsg = raw.last_message as Record<string, unknown> | undefined;

  return {
    id: raw.id,
    linkedin_id: raw.linkedin_id ?? null,
    linkedin_public_id: lead.linkedin_public_id ?? null,
    firstname: lead.firstname ?? null,
    lastname: lead.lastname ?? null,
    headline: lead.headline ?? null,
    company: lead.company ?? null,
    company_headcount: lead.company_headcount ?? null,
    company_linkedin_url: lead.company_linkedin_url ?? null,
    company_website: lead.company_website ?? null,
    job: lead.job ?? null,
    location: lead.location ?? null,
    country: lead.country ?? null,
    email: raw.email ?? lead.email ?? null,
    phone: raw.phone ?? lead.phone ?? null,
    picture: lead.picture ?? null,
    skills: lead.skills ?? [],
    languages: lead.languages ?? [],
    connections: lead.connections ?? null,
    is_connection: raw.is_connection ?? false,
    is_lead: raw.is_lead ?? false,
    degree: raw.degree ?? null,
    connected_at: raw.connected_at ?? null,
    is_premium: lead.is_premium ?? false,
    is_open_profile: lead.is_open_profile ?? false,
    labels: ((raw.labels ?? []) as Record<string, unknown>[]).map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    board: raw.board ?? null,
    step_name: raw.step_name ?? null,
    icebreaker: raw.icebreaker ?? null,
    custom: raw.custom ?? null,
    conversations: ((raw.conversations_ids ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id,
      last_activity: c.last_activity ?? c.lastactivity_at ?? null,
    })),
    last_message: lastMsg
      ? {
          text: lastMsg.last_message_text ?? null,
          at: lastMsg.last_message_at ?? null,
          from_id: lastMsg.last_message_from_id ?? null,
          attachment_name: lastMsg.last_message_attachment_name ?? null,
          attachment_type: lastMsg.last_message_attachment_type ?? null,
        }
      : null,
    invitation_type: raw.invitation_type ?? null,
    invitation_message: raw.invitation_message ?? null,
    is_starred: raw.is_starred ?? false,
    is_archived: raw.is_archived ?? false,
    updated_at: raw.updated_at ?? null,
  } as NormalizedMember;
}

export function normalizeLead(raw: Record<string, unknown>): NormalizedLead {
  const lnuser = (raw.lnuser ?? {}) as Record<string, unknown>;

  return {
    lead_id: raw.id,
    member_id: lnuser.id ?? null,
    linkedin_public_id: raw.linkedin_public_id ?? null,
    firstname: raw.firstname ?? null,
    lastname: raw.lastname ?? null,
    headline: raw.headline ?? null,
    company: raw.company ?? null,
    company_headcount: raw.company_headcount ?? null,
    company_linkedin_url: raw.company_linkedin_url ?? null,
    company_website: raw.company_website ?? null,
    job: raw.job ?? null,
    location: raw.location ?? null,
    country: raw.country ?? null,
    email: raw.email ?? lnuser.email ?? null,
    phone: raw.phone ?? lnuser.phone ?? null,
    picture: raw.picture ?? null,
    skills: raw.skills ?? [],
    languages: raw.languages ?? [],
    connections: raw.connections ?? null,
    is_connection: lnuser.is_connection ?? false,
    degree: raw.degree ?? null,
    connected_at: lnuser.connected_at ?? null,
    labels: ((lnuser.labels ?? []) as Record<string, unknown>[]).map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    invitation_type: lnuser.invitation_type ?? null,
    invitation_message: lnuser.invitation_message ?? null,
    updated_at: raw.updated_at ?? lnuser.updated_at ?? null,
  } as NormalizedLead;
}

export function normalizeMessage(raw: Record<string, unknown>): NormalizedMessage {
  const firstName = (raw.from_firstname as string) ?? "";
  const lastName = (raw.from_lastname as string) ?? "";
  const from = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";

  return {
    text: raw.text ?? null,
    from,
    from_linkedin_id: raw.from_linkedin_id ?? null,
    at: raw.created_at ?? raw.at,
    is_from_participant: raw.is_from_user ?? false,
    attachment_name: raw.attachment_name ?? null,
    attachment_type: raw.attachment_type ?? null,
  } as NormalizedMessage;
}

export function normalizeList(raw: Record<string, unknown>): NormalizedList {
  return {
    id: raw.id,
    name: raw.name,
    total_count: raw.total_count ?? 0,
    is_processing: raw.is_processing ?? false,
  } as NormalizedList;
}
