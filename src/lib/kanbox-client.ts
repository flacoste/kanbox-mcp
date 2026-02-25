const BASE_URL = "https://api.kanbox.io";

export interface KanboxClientOptions {
  apiToken: string;
  baseUrl?: string;
}

export interface KanboxResponse<T = unknown> {
  status: number;
  data: T;
}

export class KanboxApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Kanbox API error ${status}: ${body}`);
    this.name = "KanboxApiError";
  }
}

export class KanboxClient {
  private apiToken: string;
  private baseUrl: string;

  constructor(options: KanboxClientOptions) {
    this.apiToken = options.apiToken;
    this.baseUrl = options.baseUrl ?? BASE_URL;
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<KanboxResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(key, String(v));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return this.request<T>(url.toString(), { method: "GET" });
  }

  async post<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
    queryParams?: Record<string, unknown>,
  ): Promise<KanboxResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return this.request<T>(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<KanboxResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async request<T>(
    url: string,
    init: RequestInit,
  ): Promise<KanboxResponse<T>> {
    const res = await fetch(url, {
      ...init,
      headers: {
        "X-API-Key": this.apiToken,
        Accept: "application/json",
        ...((init.headers as Record<string, string>) ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();

    if (!res.ok && res.status !== 202) {
      throw new KanboxApiError(res.status, text);
    }

    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }

    return { status: res.status, data };
  }
}
