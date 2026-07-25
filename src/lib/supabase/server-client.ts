/**
 * Server-side only Supabase REST client.
 *
 * Do not import this module from a Client Component. It deliberately reads the
 * service-role key only at request time, and it accepts only non-NEXT_PUBLIC
 * environment variables so a browser bundle cannot receive that credential.
 */
export interface SupabaseServerClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SupabaseRequestError';
  }
}

/** Returns undefined when no remote persistence has been configured. */
export function createSupabaseServerClient(): SupabaseServerClient | undefined {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return undefined;
  }

  const restUrl = `${url.replace(/\/$/, '')}/rest/v1/`;

  return {
    async request<T>(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      headers.set('apikey', serviceRoleKey);
      headers.set('Authorization', `Bearer ${serviceRoleKey}`);
      headers.set('Accept', 'application/json');

      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(new URL(path, restUrl), { ...init, headers, cache: 'no-store' });
      if (response.status === 204) {
        return undefined as T;
      }

      const body = await response.text();
      if (!response.ok) {
        throw new SupabaseRequestError(body || response.statusText, response.status);
      }

      return (body ? JSON.parse(body) : undefined) as T;
    },
  };
}
