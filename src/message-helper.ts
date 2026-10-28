import { STATUS_CODES } from 'node:http';
import type { Headers, Message, Query, Request, Uri } from '@chubbyts/chubbyts-http-types/message';
import type {
  CookieOptions,
  HeaderValue,
  MessageHelpers,
  RequestHelpers,
  ResponseHelpers,
  ServerRequestHelpers,
  UriHelpers,
} from '@chubbyts/chubbyts-http-types/message-helper';
import { parse as queryParser, stringify as queryStringifier } from 'qs';

// RFC 9110 5.6.2
const tokenPattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// fetch spec: only NUL, CR and LF are forbidden within a header value
const invalidHeaderValuePattern = /[\0\r\n]/;

// RFC 3986 3.1
const schemePattern = /^([a-z][a-z0-9+\-.]*)?$/;

const protocolVersions = new Set(['1.0', '1.1', '2', '3']);

const standardPorts = new Map([
  ['http', 80],
  ['https', 443],
]);

const minStatus = 100;
const maxStatus = 599;

const minPort = 1;
const maxPort = 65535;

// RFC 3986 2.3 (unreserved) and 2.2 (sub-delims)
const unreservedAndSubDelims = String.raw`A-Za-z0-9\-._~!$&'()*+,;=`;

// percent-encodes every character not allowed, existing percent-encodings are kept
const createEncoder = (allowedCharacters: string): ((value: string) => string) => {
  const notAllowedPattern = new RegExp(`[^${allowedCharacters}%]|%(?![0-9A-Fa-f]{2})`, 'gu');

  return (value: string): string => value.replace(notAllowedPattern, (character) => encodeURIComponent(character));
};

// RFC 3986 3.2.1, the ':' separates the user from the password
const encodeUser = createEncoder(unreservedAndSubDelims);
const encodePassword = createEncoder(`${unreservedAndSubDelims}:`);

// RFC 3986 3.3
const encodePath = createEncoder(`${unreservedAndSubDelims}:@/`);

// RFC 3986 3.4
const encodeQuery = createEncoder(`${unreservedAndSubDelims}:@/?`);

// RFC 3986 3.5
const encodeFragment = createEncoder(`${unreservedAndSubDelims}:@/?`);

const resolveHeaderName = (name: string): string => {
  if (!tokenPattern.test(name)) {
    throw new Error(`Header name "${name}" is not a valid token`);
  }

  return name.toLowerCase();
};

const resolveHeaderValues = (name: string, value: HeaderValue): ReadonlyArray<string> => {
  const values = typeof value === 'string' ? [value] : value;

  values.forEach((singleValue) => {
    if (invalidHeaderValuePattern.test(singleValue)) {
      throw new Error(`Header value of "${name}" must not contain CR, LF or NUL`);
    }
  });

  return values;
};

// own properties only, a name like `constructor` must not resolve to the prototype of the headers
const getHeader = (message: Message, name: string): ReadonlyArray<string> => {
  const resolvedName = name.toLowerCase();

  return Object.hasOwn(message.headers, resolvedName) ? message.headers[resolvedName] : [];
};

const withHeaders = <M extends Message>(message: M, headers: Headers): M => ({ ...message, headers });

const resolvePort = (scheme: string, port: number | undefined): number | undefined =>
  standardPorts.get(scheme) === port ? undefined : port;

const getHostWithPort = (uri: Uri): string => uri.host + (uri.port !== undefined ? `:${uri.port}` : '');

export const createMessageHelpers = (): MessageHelpers => ({
  getHeader,
  getHeaderLine: (message, name) => {
    if (name.toLowerCase() === 'set-cookie') {
      throw new Error('Header "set-cookie" cannot be joined, use getHeader instead');
    }

    return getHeader(message, name).join(', ');
  },
  hasHeader: (message, name) => Object.hasOwn(message.headers, name.toLowerCase()),
  withHeader: (message, name, value) => {
    const resolvedName = resolveHeaderName(name);

    return withHeaders(message, { ...message.headers, [resolvedName]: resolveHeaderValues(resolvedName, value) });
  },
  withAddedHeader: (message, name, value) => {
    const resolvedName = resolveHeaderName(name);

    return withHeaders(message, {
      ...message.headers,
      [resolvedName]: [...getHeader(message, resolvedName), ...resolveHeaderValues(resolvedName, value)],
    });
  },
  withoutHeader: (message, name) => {
    const resolvedName = resolveHeaderName(name);

    return withHeaders(
      message,
      Object.fromEntries(Object.entries(message.headers).filter(([headerName]) => headerName !== resolvedName)),
    );
  },
  withProtocolVersion: (message, protocolVersion) => {
    if (!protocolVersions.has(protocolVersion)) {
      throw new Error(`Protocol version "${protocolVersion}" is not supported, use one of: 1.0, 1.1, 2, 3`);
    }

    return { ...message, protocolVersion };
  },
  withBody: (message, body) => ({ ...message, body }),
});

export const createRequestHelpers = (messageHelpers: MessageHelpers = createMessageHelpers()): RequestHelpers => ({
  ...messageHelpers,
  withMethod: (request, method) => {
    if (!tokenPattern.test(method)) {
      throw new Error(`Method "${method}" is not a valid token`);
    }

    return { ...request, method };
  },
  getRequestTarget: (request: Request) => {
    const { path, query } = request.uri;

    return (path || '/') + (query !== '' ? `?${query}` : '');
  },
  withSignal: (request, signal) => ({ ...request, signal }),
  withUri: (request, uri, preserveHost = false) => {
    const requestWithUri = { ...request, uri };

    if (uri.host === '' || (preserveHost && messageHelpers.hasHeader(request, 'host'))) {
      return requestWithUri;
    }

    return messageHelpers.withHeader(requestWithUri, 'host', getHostWithPort(uri));
  },
  // qs ignores keys changing the prototype (allowPrototypes: false) and limits depth (5), arrays (20) and parameters (1000)
  getQueryParams: (request) => queryParser(request.uri.query) as Query,
  // relies on the default array format indices (a[0][b]=1): with brackets a[][b]=1&a[][b]=2 would get parsed as
  // { a: [{ b: ['1', '2'] }] }
  withQueryParams: (request, queryParams) => ({
    ...request,
    uri: { ...request.uri, query: queryStringifier(queryParams) },
  }),
});

const parseCookie = (cookie: string): ReadonlyArray<[string, string]> =>
  cookie.split(';').flatMap((pair): Array<[string, string]> => {
    const separatorIndex = pair.indexOf('=');

    if (separatorIndex === -1) {
      return [];
    }

    const name = pair.slice(0, separatorIndex).trim();

    if (name === '') {
      return [];
    }

    const value = pair.slice(separatorIndex + 1).trim();

    return [[name, value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value]];
  });

// RFC 6265 4.1.1: cookie-octets, optionally within double quotes
const cookieValuePattern =
  /^(?:[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*|"[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*")$/;

// RFC 6265 4.1.1: av-octets
// oxlint-disable-next-line no-control-regex
const invalidCookieAttributePattern = /[;\x00-\x1F\x7F]/;

const validateCookieAttribute = (name: string, attributeName: string, attribute: string | undefined): void => {
  // a missing attribute stringifies to 'undefined', which never matches
  if (invalidCookieAttributePattern.test(String(attribute))) {
    throw new Error(`Cookie ${attributeName} of "${name}" must not contain ";" or control characters`);
  }
};

// RFC 6265bis 4.1.3, browsers match the prefixes case-insensitive
const validateCookiePrefix = (name: string, options: CookieOptions): void => {
  const lowerName = name.toLowerCase();

  if (lowerName.startsWith('__secure-') && !options.secure) {
    throw new Error(`Cookie "${name}" requires secure`);
  }

  if (lowerName.startsWith('__host-') && (!options.secure || options.path !== '/' || options.domain !== undefined)) {
    throw new Error(`Cookie "${name}" requires secure, the path "/" and no domain`);
  }
};

const validateCookie = (name: string, value: string, options: CookieOptions): void => {
  if (!tokenPattern.test(name)) {
    throw new Error(`Cookie name "${name}" is not a valid token`);
  }

  if (!cookieValuePattern.test(value)) {
    throw new Error(`Cookie value of "${name}" must consist of cookie-octets, encode it if needed`);
  }

  validateCookieAttribute(name, 'path', options.path);
  validateCookieAttribute(name, 'domain', options.domain);

  if (options.maxAge !== undefined && !Number.isInteger(options.maxAge)) {
    throw new Error(`Cookie max age of "${name}" has to be an integer`);
  }

  if (options.expires !== undefined && Number.isNaN(options.expires.getTime())) {
    throw new Error(`Cookie expires of "${name}" is an invalid date`);
  }

  if (options.sameSite === 'None' && !options.secure) {
    throw new Error(`Cookie "${name}" with sameSite None requires secure`);
  }

  if (options.partitioned && !options.secure) {
    throw new Error(`Cookie "${name}" with partitioned requires secure`);
  }

  validateCookiePrefix(name, options);
};

const serializeCookie = (name: string, value: string, options: CookieOptions): string => {
  validateCookie(name, value, options);

  return [
    `${name}=${value}`,
    options.path !== undefined ? `Path=${options.path}` : undefined,
    options.domain !== undefined ? `Domain=${options.domain}` : undefined,
    options.maxAge !== undefined ? `Max-Age=${options.maxAge}` : undefined,
    options.expires !== undefined ? `Expires=${options.expires.toUTCString()}` : undefined,
    options.secure ? 'Secure' : undefined,
    options.httpOnly ? 'HttpOnly' : undefined,
    options.sameSite !== undefined ? `SameSite=${options.sameSite}` : undefined,
    options.partitioned ? 'Partitioned' : undefined,
  ]
    .filter((part) => part !== undefined)
    .join('; ');
};

export const createServerRequestHelpers = (
  requestHelpers: RequestHelpers = createRequestHelpers(),
): ServerRequestHelpers => ({
  ...requestHelpers,
  getCookieParams: (request) => {
    // a client may send multiple cookie headers (e.g. HTTP/2 allows to split them)
    const cookies = requestHelpers.getHeader(request, 'cookie').flatMap(parseCookie);

    return Object.fromEntries(
      cookies.filter(([name], index) => cookies.findIndex(([otherName]) => otherName === name) === index),
    );
  },
  // the attribute types cannot be inferred out of the spread, the signature of ServerRequestHelpers ensures them
  withAttribute: (request, name, value) => ({
    ...request,
    attributes: { ...request.attributes, [name]: value } as never,
  }),
  withoutAttribute: (request, name) => ({
    ...request,
    attributes: Object.fromEntries(
      Object.entries(request.attributes).filter(([attributeName]) => attributeName !== name),
    ) as never,
  }),
});

export const createResponseHelpers = (messageHelpers: MessageHelpers = createMessageHelpers()): ResponseHelpers => ({
  ...messageHelpers,
  withStatus: (response, status, reasonPhrase) => {
    if (!Number.isInteger(status) || status < minStatus || status > maxStatus) {
      throw new Error(`Status "${status}" is not valid, use an integer within ${minStatus}-${maxStatus}`);
    }

    return { ...response, status, reasonPhrase: reasonPhrase ?? STATUS_CODES[status] ?? '' };
  },
  withCookie: (response, name, value, options = {}) =>
    messageHelpers.withAddedHeader(response, 'set-cookie', serializeCookie(name, value, options)),
  withoutCookie: (response, name, options = {}) =>
    messageHelpers.withAddedHeader(
      response,
      'set-cookie',
      serializeCookie(name, '', { ...options, maxAge: 0, expires: new Date(0) }),
    ),
});

const getAuthority = (uri: Uri): string => {
  if (uri.host === '') {
    return '';
  }

  return (uri.userInfo !== '' ? `${uri.userInfo}@` : '') + getHostWithPort(uri);
};

// RFC 3986 3.3: with an authority the path has to start with '/', without one it must not start with '//'
const resolvePathForString = (path: string, hasAuthority: boolean): string => {
  if (hasAuthority) {
    return path !== '' && !path.startsWith('/') ? `/${path}` : path;
  }

  return path.replace(/^\/{2,}/, '/');
};

export const createUriHelpers = (): UriHelpers => ({
  getAuthority,
  toString: (uri) => {
    const authority = getAuthority(uri);

    return (
      (uri.scheme !== '' ? `${uri.scheme}:` : '') +
      (uri.host !== '' ? `//${authority}` : '') +
      resolvePathForString(uri.path, uri.host !== '') +
      (uri.query !== '' ? `?${uri.query}` : '') +
      (uri.fragment !== '' ? `#${uri.fragment}` : '')
    );
  },
  withScheme: (uri, scheme) => {
    const resolvedScheme = scheme.toLowerCase();

    if (!schemePattern.test(resolvedScheme)) {
      throw new Error(`Scheme "${scheme}" is not valid`);
    }

    return { ...uri, scheme: resolvedScheme, port: resolvePort(resolvedScheme, uri.port) };
  },
  withUserInfo: (uri, user, password) => ({
    ...uri,
    userInfo: encodeUser(user) + (user !== '' && password !== undefined ? `:${encodePassword(password)}` : ''),
  }),
  withHost: (uri, host) => ({ ...uri, host: host.toLowerCase() }),
  withPort: (uri, port) => {
    if (port !== undefined && (!Number.isInteger(port) || port < minPort || port > maxPort)) {
      throw new Error(`Port "${port}" is not valid, use an integer within ${minPort}-${maxPort}`);
    }

    return { ...uri, port: resolvePort(uri.scheme, port) };
  },
  withPath: (uri, path) => ({ ...uri, path: encodePath(path) }),
  withQuery: (uri, query) => ({ ...uri, query: encodeQuery(query) }),
  withFragment: (uri, fragment) => ({ ...uri, fragment: encodeFragment(fragment) }),
});
