import { describe, it, expect } from "vitest";
import {
  normalizeMember,
  normalizeLead,
  normalizeMessage,
  normalizeList,
} from "../../src/lib/normalize.js";

describe("normalizeMember", () => {
  it("flattens lead.* fields to top level", () => {
    const raw = {
      id: 123,
      lead: {
        linkedin_public_id: "janedoe",
        firstname: "Jane",
        lastname: "Doe",
        headline: "PM at Acme",
        company: "Acme",
        company_headcount: 250,
        company_linkedin_url: "https://linkedin.com/company/acme",
        company_website: "https://acme.com",
        job: "PM",
        location: "SF",
        country: "US",
        email: "jane@acme.com",
        phone: null,
        picture: "https://cdn.example.com/pic.jpg",
        skills: ["Product"],
        languages: ["English"],
        connections: 500,
        degree: 1,
        is_premium: false,
        is_open_profile: true,
      },
      is_connection: true,
      is_lead: false,
      connected_at: "2026-01-15T10:30:00Z",
      labels: [{ id: 1, name: "Priority", color: "color6" }],
      pipeline: null,
      step: null,
      icebreaker: "Met at conf",
      custom: null,
      conversations_ids: [{ id: 9876, last_activity: "2026-01-20T14:30:00.000Z" }],
      last_message: {
        text: "Hello!",
        at: "2026-01-20T14:30:00.000Z",
        from: "ACoAABExampleId",
        attachment_name: null,
        attachment_type: null,
      },
      invitation_type: "SENT",
      invitation_message: "Hi Jane!",
      is_starred: false,
      is_archived: false,
      updated_at: "2026-01-21T09:00:00.000Z",
      // Fields that should be dropped
      score: 85,
      webhook_url: "https://example.com/hook",
      dropcontact_status: "done",
    };

    const result = normalizeMember(raw);

    expect(result.id).toBe(123);
    expect(result.linkedin_public_id).toBe("janedoe");
    expect(result.firstname).toBe("Jane");
    expect(result.company_headcount).toBe(250);
    expect(result.company_linkedin_url).toBe("https://linkedin.com/company/acme");
    expect(result.connections).toBe(500);
    expect(result.is_open_profile).toBe(true);
    expect(result.labels).toEqual([{ id: 1, name: "Priority", color: "color6" }]);
    expect(result.conversations).toEqual([{ id: 9876, last_activity: "2026-01-20T14:30:00.000Z" }]);
    expect(result.last_message).toEqual({
      text: "Hello!",
      at: "2026-01-20T14:30:00.000Z",
      from: "ACoAABExampleId",
      attachment_name: null,
      attachment_type: null,
    });
    expect(result.icebreaker).toBe("Met at conf");
    // Dropped fields should not appear
    expect(result).not.toHaveProperty("score");
    expect(result).not.toHaveProperty("webhook_url");
    expect(result).not.toHaveProperty("lead");
  });

  it("handles missing lead object gracefully", () => {
    const raw = { id: 1 };
    const result = normalizeMember(raw);
    expect(result.id).toBe(1);
    expect(result.linkedin_public_id).toBeNull();
    expect(result.skills).toEqual([]);
    expect(result.conversations).toEqual([]);
  });
});

describe("normalizeLead", () => {
  it("flattens lnuser.* fields and exposes both IDs", () => {
    const raw = {
      id: 5001,
      linkedin_public_id: "johnsmith",
      firstname: "John",
      lastname: "Smith",
      headline: "VP Eng",
      company: "TechStart",
      company_headcount: 50,
      company_linkedin_url: "https://linkedin.com/company/techstart",
      company_website: "https://techstart.io",
      job: "VP of Engineering",
      location: "Toronto",
      country: "Canada",
      email: "john@tech.com",
      phone: "555-1234",
      picture: "https://cdn.example.com/john.jpg",
      skills: ["Engineering"],
      languages: ["English", "French"],
      connections: 1200,
      degree: 1,
      lnuser: {
        id: 9876543,
        is_connection: true,
        connected_at: "2025-06-15T18:00:00Z",
        labels: [{ id: 2, name: "Prospect", color: "color13" }],
        invitation_type: "PENDING",
        invitation_message: "Hi John!",
        updated_at: "2025-06-20T12:00:00.000Z",
      },
      updated_at: "2025-06-21T00:00:00.000Z",
      // Should be dropped
      fullenrich_status: "pending",
    };

    const result = normalizeLead(raw);

    expect(result.lead_id).toBe(5001);
    expect(result.member_id).toBe(9876543);
    expect(result.linkedin_public_id).toBe("johnsmith");
    expect(result.company_headcount).toBe(50);
    expect(result.connections).toBe(1200);
    expect(result.labels).toEqual([{ id: 2, name: "Prospect", color: "color13" }]);
    expect(result.is_connection).toBe(true);
    expect(result).not.toHaveProperty("lnuser");
    expect(result).not.toHaveProperty("fullenrich_status");
  });

  it("handles null lnuser (lead without member)", () => {
    const raw = {
      id: 100,
      linkedin_public_id: "nobody",
      firstname: "No",
      lastname: "Body",
    };
    const result = normalizeLead(raw);
    expect(result.member_id).toBeNull();
    expect(result.labels).toEqual([]);
  });
});

describe("normalizeMessage", () => {
  it("combines name fields and renames properties", () => {
    const raw = {
      text: "Hello there",
      from_firstname: "Jane",
      from_lastname: "Doe",
      from_linkedin_id: "ACoAABExampleId",
      created_at: "2026-01-18T15:01:58.570Z",
      is_from_user: true,
      attachment_name: null,
      attachment_type: null,
      // Should be dropped
      id: 12345,
      html: null,
      message_type: "text",
    };

    const result = normalizeMessage(raw);

    expect(result.from).toBe("Jane Doe");
    expect(result.from_linkedin_id).toBe("ACoAABExampleId");
    expect(result.at).toBe("2026-01-18T15:01:58.570Z");
    expect(result.is_from_participant).toBe(true);
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("html");
    expect(result).not.toHaveProperty("created_at");
    expect(result).not.toHaveProperty("is_from_user");
  });

  it("handles missing name fields", () => {
    const raw = { created_at: "2026-01-01T00:00:00Z" };
    const result = normalizeMessage(raw);
    expect(result.from).toBe("Unknown");
  });
});

describe("normalizeList", () => {
  it("strips to minimal shape", () => {
    const raw = {
      id: 1001,
      name: "Scraped Leads",
      total_count: 42,
      is_processing: false,
      // Should be dropped
      user: { id: 1, name: "test" },
      search_url: "https://example.com",
      is_salesnav: false,
      duplicates: 0,
    };

    const result = normalizeList(raw);

    expect(result).toEqual({
      id: 1001,
      name: "Scraped Leads",
      total_count: 42,
      is_processing: false,
    });
    expect(result).not.toHaveProperty("user");
    expect(result).not.toHaveProperty("search_url");
  });
});
