import 'server-only';

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
}

function isAllowedLocalHttp(origin: URL): boolean {
  return origin.protocol === 'http:' && (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1' || isPrivateIpv4(origin.hostname));
}

function localOriginFromHostHeader(request: Request): string | undefined {
  const host = request.headers.get('host');
  if (!host) return undefined;

  try {
    const origin = new URL(`http://${host}`);
    return isAllowedLocalHttp(origin) ? origin.origin : undefined;
  } catch {
    return undefined;
  }
}

function configuredOrigin(): string | undefined {
  const value = process.env.CARE_RELAY_PUBLIC_ORIGIN;
  if (!value) return undefined;

  try {
    const origin = new URL(value);
    if (origin.protocol !== 'https:' && !isAllowedLocalHttp(origin)) return undefined;
    return origin.origin;
  } catch {
    return undefined;
  }
}

/**
 * Produces an absolute origin without trusting Host or forwarded-host headers.
 * Vercel supplies VERCEL_URL for its deployment hostname; custom domains must
 * be configured explicitly through CARE_RELAY_PUBLIC_ORIGIN.
 */
export function getTrustedRequestOrigin(request: Request): string {
  const configured = configuredOrigin();
  if (configured) return configured;

  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost && /^[a-z0-9-]+\.vercel\.app$/i.test(vercelHost)) {
    return `https://${vercelHost}`;
  }

  const requestUrl = new URL(request.url);
  if (isAllowedLocalHttp(requestUrl)) {
    return requestUrl.origin;
  }

  // Next dev can normalise request.url to the bind host (0.0.0.0). For a
  // local-only fallback, accept the direct Host header only after the same
  // private-IP validation; deliberately do not trust forwarded headers.
  const localHostOrigin = localOriginFromHostHeader(request);
  if (localHostOrigin) return localHostOrigin;

  throw new Error('A trusted public origin is required to create a temporary share URL.');
}
