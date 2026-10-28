import { Readable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import type { Response, ServerRequest, Uri } from '@chubbyts/chubbyts-http-types/message';
import {
  createMessageHelpers,
  createRequestHelpers,
  createResponseHelpers,
  createServerRequestHelpers,
  createUriHelpers,
} from '../src/message-helper.js';

const uri: Uri = {
  scheme: 'https',
  userInfo: 'user:password',
  host: 'example.com',
  port: 8443,
  path: '/api',
  query: 'key1=value1&key2[]=value2&key3[key31]=value3',
  fragment: 'fragment',
};

const emptyUri: Uri = {
  scheme: '',
  userInfo: '',
  host: '',
  port: undefined,
  path: '',
  query: '',
  fragment: '',
};

const createServerRequest = (headers: ServerRequest['headers'] = {}): ServerRequest<{ requestId: string }> => ({
  method: 'GET',
  uri,
  protocolVersion: '1.1',
  headers,
  body: Readable.from([]),
  signal: new AbortController().signal,
  attributes: { requestId: 'request-1' },
});

const createResponse = (headers: Response['headers'] = {}): Response => ({
  status: 200,
  reasonPhrase: 'OK',
  protocolVersion: '1.1',
  headers,
  body: Readable.from([]),
});

describe('message-helper', () => {
  describe('createMessageHelpers', () => {
    const messageHelpers = createMessageHelpers();

    test('getHeader', () => {
      const response = createResponse({ accept: ['application/json', 'text/html'] });

      expect(messageHelpers.getHeader(response, 'Accept')).toEqual(['application/json', 'text/html']);
      expect(messageHelpers.getHeader(response, 'content-type')).toEqual([]);
      expect(messageHelpers.getHeader(response, 'constructor')).toEqual([]);
      expect(messageHelpers.getHeader(response, '__proto__')).toEqual([]);
    });

    test('getHeaderLine', () => {
      const response = createResponse({ accept: ['application/json', 'text/html'] });

      expect(messageHelpers.getHeaderLine(response, 'Accept')).toBe('application/json, text/html');
      expect(messageHelpers.getHeaderLine(response, 'content-type')).toBe('');
      expect(messageHelpers.getHeaderLine(response, 'toString')).toBe('');
    });

    test('getHeaderLine with set-cookie', () => {
      const response = createResponse({ 'set-cookie': ['a=1', 'b=2'] });

      expect(() => messageHelpers.getHeaderLine(response, 'Set-Cookie')).toThrow(
        'Header "set-cookie" cannot be joined, use getHeader instead',
      );
    });

    test('hasHeader', () => {
      const response = createResponse({ accept: [] });

      expect(messageHelpers.hasHeader(response, 'Accept')).toBe(true);
      expect(messageHelpers.hasHeader(response, 'content-type')).toBe(false);
      expect(messageHelpers.hasHeader(response, 'constructor')).toBe(false);
    });

    test('withHeader', () => {
      const response = createResponse({ accept: ['text/html'], 'content-type': ['text/plain'] });

      const newResponse = messageHelpers.withHeader(response, 'Accept', 'application/json');

      expect(newResponse).not.toBe(response);
      expect(newResponse.headers).toEqual({ accept: ['application/json'], 'content-type': ['text/plain'] });
      expect(newResponse.body).toBe(response.body);
      expect(response.headers).toEqual({ accept: ['text/html'], 'content-type': ['text/plain'] });

      expect(messageHelpers.withHeader(response, 'accept', ['application/json', 'text/html']).headers.accept).toEqual([
        'application/json',
        'text/html',
      ]);
    });

    test('withHeader with invalid name', () => {
      expect(() => messageHelpers.withHeader(createResponse(), 'invalid name', 'value')).toThrow(
        'Header name "invalid name" is not a valid token',
      );
      expect(() => messageHelpers.withHeader(createResponse(), '', 'value')).toThrow(
        'Header name "" is not a valid token',
      );
    });

    test.each(['value\r\n', 'value\n', 'value\r', 'value\0'])('withHeader with invalid value %j', (value) => {
      expect(() => messageHelpers.withHeader(createResponse(), 'X-Name', ['valid', value])).toThrow(
        'Header value of "x-name" must not contain CR, LF or NUL',
      );
    });

    test('withAddedHeader', () => {
      const response = createResponse({ accept: ['text/html'] });

      const newResponse = messageHelpers.withAddedHeader(response, 'Accept', 'application/json');

      expect(newResponse.headers).toEqual({ accept: ['text/html', 'application/json'] });
      expect(response.headers).toEqual({ accept: ['text/html'] });

      expect(messageHelpers.withAddedHeader(response, 'content-type', ['text/plain']).headers).toEqual({
        accept: ['text/html'],
        'content-type': ['text/plain'],
      });
    });

    test('withAddedHeader with a name of an object prototype property', () => {
      expect(messageHelpers.withAddedHeader(createResponse(), 'Constructor', 'value').headers).toEqual({
        constructor: ['value'],
      });
    });

    test('withAddedHeader with invalid name and value', () => {
      expect(() => messageHelpers.withAddedHeader(createResponse(), 'invalid name', 'value')).toThrow(
        'Header name "invalid name" is not a valid token',
      );
      expect(() => messageHelpers.withAddedHeader(createResponse(), 'name', 'value\n')).toThrow(
        'Header value of "name" must not contain CR, LF or NUL',
      );
    });

    test('withoutHeader', () => {
      const response = createResponse({ accept: ['text/html'], 'content-type': ['text/plain'] });

      const newResponse = messageHelpers.withoutHeader(response, 'Accept');

      expect(newResponse).not.toBe(response);
      expect(newResponse.headers).toEqual({ 'content-type': ['text/plain'] });
      expect(response.headers).toEqual({ accept: ['text/html'], 'content-type': ['text/plain'] });
    });

    test('withoutHeader with invalid name', () => {
      expect(() => messageHelpers.withoutHeader(createResponse(), 'invalid name')).toThrow(
        'Header name "invalid name" is not a valid token',
      );
    });

    test.each(['1.0', '1.1', '2', '3'])('withProtocolVersion with %s', (protocolVersion) => {
      const response = createResponse();

      expect(messageHelpers.withProtocolVersion(response, protocolVersion)).toEqual({ ...response, protocolVersion });
    });

    test('withBody', () => {
      const response = createResponse();
      const body = Readable.from([]);

      const newResponse = messageHelpers.withBody(response, body);

      expect(newResponse).toEqual({ ...response, body });
      expect(newResponse.body).toBe(body);
      expect(response.body).not.toBe(body);
    });

    test('withProtocolVersion with invalid version', () => {
      expect(() => messageHelpers.withProtocolVersion(createResponse(), '2.0')).toThrow(
        'Protocol version "2.0" is not supported, use one of: 1.0, 1.1, 2, 3',
      );
    });
  });

  describe('createRequestHelpers', () => {
    const requestHelpers = createRequestHelpers();

    test('contains the message helpers', () => {
      expect(requestHelpers.getHeaderLine(createServerRequest({ accept: ['a', 'b'] }), 'accept')).toBe('a, b');
    });

    test.each(['POST', 'PROPFIND', 'patch'])('withMethod with %s', (method) => {
      const request = createServerRequest();

      expect(requestHelpers.withMethod(request, method)).toEqual({ ...request, method });
    });

    test('withMethod with invalid method', () => {
      expect(() => requestHelpers.withMethod(createServerRequest(), 'GET POST')).toThrow(
        'Method "GET POST" is not a valid token',
      );
    });

    test('getRequestTarget', () => {
      expect(requestHelpers.getRequestTarget(createServerRequest())).toBe(
        '/api?key1=value1&key2[]=value2&key3[key31]=value3',
      );
      expect(requestHelpers.getRequestTarget({ ...createServerRequest(), uri: emptyUri })).toBe('/');
    });

    test('withSignal', () => {
      const request = createServerRequest();
      const signal = AbortSignal.timeout(1000);

      const newRequest = requestHelpers.withSignal(request, signal);

      expect(newRequest).toEqual({ ...request, signal });
      expect(newRequest.signal).toBe(signal);
      expect(request.signal).not.toBe(signal);
    });

    test('withUri', () => {
      const request = createServerRequest({ host: ['example.org'] });

      expect(requestHelpers.withUri(request, uri)).toEqual({
        ...request,
        uri,
        headers: { host: ['example.com:8443'] },
      });

      expect(requestHelpers.withUri(request, { ...uri, port: undefined }).headers).toEqual({
        host: ['example.com'],
      });
    });

    test('withUri without host within uri', () => {
      const request = createServerRequest({ host: ['example.org'] });

      expect(requestHelpers.withUri(request, emptyUri)).toEqual({ ...request, uri: emptyUri });
    });

    test('withUri with preserve host', () => {
      const request = createServerRequest({ host: ['example.org'] });

      expect(requestHelpers.withUri(request, uri, true)).toEqual({ ...request, uri });
    });

    test('withUri with preserve host, but without host header', () => {
      const request = createServerRequest();

      expect(requestHelpers.withUri(request, uri, true)).toEqual({
        ...request,
        uri,
        headers: { host: ['example.com:8443'] },
      });
    });

    test('getQueryParams', () => {
      expect(requestHelpers.getQueryParams(createServerRequest())).toEqual({
        key1: 'value1',
        key2: ['value2'],
        key3: { key31: 'value3' },
      });
      expect(
        requestHelpers.getQueryParams({
          ...createServerRequest(),
          uri: { ...uri, query: 'key=a&key=b&space=a+b%20c&encoded%5Bsub%5D=value' },
        }),
      ).toEqual({ key: ['a', 'b'], space: 'a b c', encoded: { sub: 'value' } });
      expect(requestHelpers.getQueryParams({ ...createServerRequest(), uri: emptyUri })).toEqual({});
    });

    test('withQueryParams', () => {
      const request = createServerRequest();

      const newRequest = requestHelpers.withQueryParams(request, {
        key1: 'a b+c&d=e',
        key2: ['value2', { sub: 'value' }],
        'key 3': { key31: '' },
        empty: [],
      });

      expect(newRequest).toEqual({
        ...request,
        uri: {
          ...uri,
          query: 'key1=a%20b%2Bc%26d%3De&key2%5B0%5D=value2&key2%5B1%5D%5Bsub%5D=value&key%203%5Bkey31%5D=',
        },
      });
      expect(request.uri).toBe(uri);
      expect(requestHelpers.withQueryParams(request, {}).uri.query).toBe('');
    });

    test('withQueryParams is the counterpart of getQueryParams', () => {
      const queryParams = { a: [{ b: '1' }, { b: '2' }], c: ['x', 'y'], d: { e: { f: 'g h' } }, i: '' };

      expect(requestHelpers.getQueryParams(requestHelpers.withQueryParams(createServerRequest(), queryParams))).toEqual(
        queryParams,
      );
    });

    test('getQueryParams does not pollute the prototype', () => {
      const queryParams = requestHelpers.getQueryParams({
        ...createServerRequest(),
        uri: { ...uri, query: '__proto__[polluted]=1&constructor[prototype][polluted]=1' },
      });

      expect(Object.getPrototypeOf(queryParams)).toBe(Object.prototype);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe('createServerRequestHelpers', () => {
    const serverRequestHelpers = createServerRequestHelpers();

    test('contains the request and message helpers', () => {
      const request = createServerRequest();

      expect(serverRequestHelpers.withMethod(request, 'POST').method).toBe('POST');
      expect(serverRequestHelpers.hasHeader(request, 'accept')).toBe(false);
    });

    test('getCookieParams', () => {
      const request = createServerRequest({
        cookie: [
          'name1=value1; name2="value2" ; name1=value3; =value4; name5; name6=',
          'name7=a=b; name8="; name9=""; name10=a"; name11="a',
        ],
      });

      expect(serverRequestHelpers.getCookieParams(request)).toEqual({
        name1: 'value1',
        name2: 'value2',
        name6: '',
        name7: 'a=b',
        name8: '"',
        name9: '',
        name10: 'a"',
        name11: '"a',
      });
    });

    test('getCookieParams without cookie header', () => {
      expect(serverRequestHelpers.getCookieParams(createServerRequest())).toEqual({});
    });

    test('getCookieParams does not pollute the prototype', () => {
      const cookieParams = serverRequestHelpers.getCookieParams(createServerRequest({ cookie: ['__proto__=value'] }));

      expect(Object.getPrototypeOf(cookieParams)).toBe(Object.prototype);
      expect(Object.keys(cookieParams)).toEqual(['__proto__']);
    });

    test('withAttribute', () => {
      const request = createServerRequest();

      const newRequest = serverRequestHelpers.withAttribute(request, 'userId', 'user-1');

      expect(newRequest).toEqual({ ...request, attributes: { requestId: 'request-1', userId: 'user-1' } });
      expect(request.attributes).toEqual({ requestId: 'request-1' });

      expect(serverRequestHelpers.withAttribute(request, 'requestId', 1).attributes).toEqual({ requestId: 1 });
    });

    test('withoutAttribute', () => {
      const request = serverRequestHelpers.withAttribute(createServerRequest(), 'userId', 'user-1');

      const newRequest = serverRequestHelpers.withoutAttribute(request, 'requestId');

      expect(newRequest).toEqual({ ...request, attributes: { userId: 'user-1' } });
      expect(request.attributes).toEqual({ requestId: 'request-1', userId: 'user-1' });
    });
  });

  describe('createResponseHelpers', () => {
    const responseHelpers = createResponseHelpers();

    test('contains the message helpers', () => {
      expect(responseHelpers.withHeader(createResponse(), 'Content-Type', 'text/plain').headers).toEqual({
        'content-type': ['text/plain'],
      });
    });

    test('withStatus', () => {
      const response = createResponse();

      expect(responseHelpers.withStatus(response, 404)).toEqual({
        ...response,
        status: 404,
        reasonPhrase: 'Not Found',
      });
      expect(responseHelpers.withStatus(response, 404, 'Gone Fishing')).toEqual({
        ...response,
        status: 404,
        reasonPhrase: 'Gone Fishing',
      });
      expect(responseHelpers.withStatus(response, 404, '')).toEqual({ ...response, status: 404, reasonPhrase: '' });
      expect(responseHelpers.withStatus(response, 599)).toEqual({ ...response, status: 599, reasonPhrase: '' });
      expect(responseHelpers.withStatus(response, 100)).toEqual({ ...response, status: 100, reasonPhrase: 'Continue' });
    });

    test.each([99, 600, 200.5, Number.NaN])('withStatus with invalid status %s', (status) => {
      expect(() => responseHelpers.withStatus(createResponse(), status)).toThrow(
        `Status "${status}" is not valid, use an integer within 100-599`,
      );
    });

    test('withCookie', () => {
      const response = createResponse({ 'set-cookie': ['existing=1'] });

      const newResponse = responseHelpers.withCookie(response, 'session', 'abc');

      expect(newResponse.headers['set-cookie']).toEqual(['existing=1', 'session=abc']);
      expect(response.headers['set-cookie']).toEqual(['existing=1']);
    });

    test('withCookie with all options', () => {
      const response = responseHelpers.withCookie(createResponse(), 'session', '"abc"', {
        partitioned: true,
        sameSite: 'None',
        httpOnly: true,
        secure: true,
        expires: new Date('2026-10-28T12:00:00Z'),
        maxAge: 3600,
        domain: 'example.com',
        path: '/',
      });

      expect(response.headers['set-cookie']).toEqual([
        'session="abc"; Path=/; Domain=example.com; Max-Age=3600; Expires=Wed, 28 Oct 2026 12:00:00 GMT; Secure; HttpOnly; SameSite=None; Partitioned',
      ]);
    });

    test('withCookie with disabled flags and empty value', () => {
      const response = responseHelpers.withCookie(createResponse(), 'session', '', {
        secure: false,
        httpOnly: false,
        partitioned: false,
        sameSite: 'Lax',
        maxAge: -1,
      });

      expect(response.headers['set-cookie']).toEqual(['session=; Max-Age=-1; SameSite=Lax']);
    });

    test.each(['', 'in valid', 'in;valid', 'in=valid'])('withCookie with invalid name %j', (name) => {
      expect(() => responseHelpers.withCookie(createResponse(), name, 'value')).toThrow(
        `Cookie name "${name}" is not a valid token`,
      );
    });

    test.each(['a b', 'a;b', 'a,b', 'a\\b', 'a"b', '"ab', 'ab"', 'ü', 'a\x7Fb'])(
      'withCookie with invalid value %j',
      (value) => {
        expect(() => responseHelpers.withCookie(createResponse(), 'name', value)).toThrow(
          'Cookie value of "name" must consist of cookie-octets, encode it if needed',
        );
      },
    );

    test.each(['path', 'domain'] as const)('withCookie with invalid %s', (attributeName) => {
      ['a;b', 'a\nb', 'a\x00b', 'a\x7Fb'].forEach((attribute) => {
        expect(() =>
          responseHelpers.withCookie(createResponse(), 'name', 'value', { [attributeName]: attribute }),
        ).toThrow(`Cookie ${attributeName} of "name" must not contain ";" or control characters`);
      });
    });

    test.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('withCookie with invalid max age %s', (maxAge) => {
      expect(() => responseHelpers.withCookie(createResponse(), 'name', 'value', { maxAge })).toThrow(
        'Cookie max age of "name" has to be an integer',
      );
    });

    test('withCookie with invalid expires', () => {
      expect(() =>
        responseHelpers.withCookie(createResponse(), 'name', 'value', { expires: new Date('invalid') }),
      ).toThrow('Cookie expires of "name" is an invalid date');
    });

    test('withCookie with sameSite None requires secure', () => {
      expect(() => responseHelpers.withCookie(createResponse(), 'name', 'value', { sameSite: 'None' })).toThrow(
        'Cookie "name" with sameSite None requires secure',
      );
    });

    test('withCookie with partitioned requires secure', () => {
      expect(() => responseHelpers.withCookie(createResponse(), 'name', 'value', { partitioned: true })).toThrow(
        'Cookie "name" with partitioned requires secure',
      );
    });

    test.each(['__Secure-name', '__secure-name'])('withCookie with %s prefix', (name) => {
      expect(() => responseHelpers.withCookie(createResponse(), name, 'value')).toThrow(
        `Cookie "${name}" requires secure`,
      );
      expect(
        responseHelpers.withCookie(createResponse(), name, 'value', { secure: true }).headers['set-cookie'],
      ).toEqual([`${name}=value; Secure`]);
    });

    test.each([
      { secure: false, path: '/' },
      { secure: true },
      { secure: true, path: '/api' },
      { secure: true, path: '/', domain: 'example.com' },
    ])('withCookie with __Host- prefix and invalid options %j', (options) => {
      ['__Host-name', '__host-name'].forEach((name) => {
        expect(() => responseHelpers.withCookie(createResponse(), name, 'value', options)).toThrow(
          `Cookie "${name}" requires secure, the path "/" and no domain`,
        );
      });
    });

    test('withCookie with __Host- prefix', () => {
      expect(
        responseHelpers.withCookie(createResponse(), '__Host-name', 'value', { secure: true, path: '/' }).headers[
          'set-cookie'
        ],
      ).toEqual(['__Host-name=value; Path=/; Secure']);
    });

    test('withoutCookie', () => {
      const response = createResponse({ 'set-cookie': ['existing=1'] });

      expect(responseHelpers.withoutCookie(response, 'session').headers['set-cookie']).toEqual([
        'existing=1',
        'session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      ]);
      expect(
        responseHelpers.withoutCookie(response, '__Host-session', { path: '/', secure: true, sameSite: 'Strict' })
          .headers['set-cookie'],
      ).toEqual([
        'existing=1',
        '__Host-session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Strict',
      ]);
    });

    test('withoutCookie with invalid name', () => {
      expect(() => responseHelpers.withoutCookie(createResponse(), 'in valid')).toThrow(
        'Cookie name "in valid" is not a valid token',
      );
    });
  });

  describe('createUriHelpers', () => {
    const uriHelpers = createUriHelpers();

    test('getAuthority', () => {
      expect(uriHelpers.getAuthority(uri)).toBe('user:password@example.com:8443');
      expect(uriHelpers.getAuthority({ ...uri, userInfo: '', port: undefined })).toBe('example.com');
      expect(uriHelpers.getAuthority({ ...uri, host: '' })).toBe('');
    });

    test('toString', () => {
      expect(uriHelpers.toString(uri)).toBe(
        'https://user:password@example.com:8443/api?key1=value1&key2[]=value2&key3[key31]=value3#fragment',
      );
      expect(uriHelpers.toString(emptyUri)).toBe('');
      expect(uriHelpers.toString({ ...emptyUri, scheme: 'mailto', path: 'user@example.com' })).toBe(
        'mailto:user@example.com',
      );
      expect(uriHelpers.toString({ ...emptyUri, path: '/path', query: 'key=value' })).toBe('/path?key=value');
    });

    test('toString with path not starting with a slash, but with authority', () => {
      expect(uriHelpers.toString({ ...emptyUri, scheme: 'https', host: 'example.com', path: 'api' })).toBe(
        'https://example.com/api',
      );
      expect(uriHelpers.toString({ ...emptyUri, scheme: 'https', host: 'example.com' })).toBe('https://example.com');
    });

    test('toString with path starting with multiple slashes, but without authority', () => {
      expect(uriHelpers.toString({ ...emptyUri, path: '///api' })).toBe('/api');
      expect(uriHelpers.toString({ ...emptyUri, path: '/api//' })).toBe('/api//');
      expect(uriHelpers.toString({ ...emptyUri, path: '/api' })).toBe('/api');
      expect(uriHelpers.toString({ ...emptyUri, path: '//' })).toBe('/');
    });

    test('withScheme', () => {
      expect(uriHelpers.withScheme(uri, 'HTTP')).toEqual({ ...uri, scheme: 'http' });
      expect(uriHelpers.withScheme(uri, 'web+custom.1-2')).toEqual({ ...uri, scheme: 'web+custom.1-2' });
      expect(uriHelpers.withScheme(uri, '')).toEqual({ ...uri, scheme: '' });
    });

    test('withScheme removes the standard port', () => {
      expect(uriHelpers.withScheme({ ...uri, port: 443 }, 'https').port).toBeUndefined();
      expect(uriHelpers.withScheme({ ...uri, port: 80 }, 'http').port).toBeUndefined();
      expect(uriHelpers.withScheme({ ...uri, port: 80 }, 'https').port).toBe(80);
    });

    test.each(['1http', 'ht tp', 'http:', '+http'])('withScheme with invalid scheme %j', (scheme) => {
      expect(() => uriHelpers.withScheme(uri, scheme)).toThrow(`Scheme "${scheme}" is not valid`);
    });

    test('withUserInfo', () => {
      expect(uriHelpers.withUserInfo(uri, 'user').userInfo).toBe('user');
      expect(uriHelpers.withUserInfo(uri, 'user', 'password').userInfo).toBe('user:password');
      expect(uriHelpers.withUserInfo(uri, 'us:er@', 'pa:ss@').userInfo).toBe('us%3Aer%40:pa:ss%40');
      expect(uriHelpers.withUserInfo(uri, 'us%20er', 'pass word').userInfo).toBe('us%20er:pass%20word');
      expect(uriHelpers.withUserInfo(uri, '', 'password').userInfo).toBe('');
      expect(uriHelpers.withUserInfo(uri, 'user', '').userInfo).toBe('user:');
    });

    test('withHost', () => {
      expect(uriHelpers.withHost(uri, 'Example.ORG')).toEqual({ ...uri, host: 'example.org' });
    });

    test('withPort', () => {
      expect(uriHelpers.withPort(uri, 1)).toEqual({ ...uri, port: 1 });
      expect(uriHelpers.withPort(uri, 65535)).toEqual({ ...uri, port: 65535 });
      expect(uriHelpers.withPort(uri, undefined)).toEqual({ ...uri, port: undefined });
      expect(uriHelpers.withPort(uri, 443)).toEqual({ ...uri, port: undefined });
      expect(uriHelpers.withPort({ ...uri, scheme: 'http' }, 443)).toEqual({ ...uri, scheme: 'http', port: 443 });
    });

    test.each([0, 65536, 80.5, Number.NaN])('withPort with invalid port %s', (port) => {
      expect(() => uriHelpers.withPort(uri, port)).toThrow(
        `Port "${port}" is not valid, use an integer within 1-65535`,
      );
    });

    test('withPath', () => {
      expect(uriHelpers.withPath(uri, "/a-z_A.Z~0:9@!$&'()*+,;=/")).toEqual({
        ...uri,
        path: "/a-z_A.Z~0:9@!$&'()*+,;=/",
      });
      expect(uriHelpers.withPath(uri, '/a b/ü/?#[]').path).toBe('/a%20b/%C3%BC/%3F%23%5B%5D');
      expect(uriHelpers.withPath(uri, '/%41/%7e/%zz/%').path).toBe('/%41/%7e/%25zz/%25');
      expect(uriHelpers.withPath(uri, '/😀').path).toBe('/%F0%9F%98%80');
    });

    test('withQuery', () => {
      expect(uriHelpers.withQuery(uri, "key=a-z_A.Z~0:9@!$&'()*+,;=/?")).toEqual({
        ...uri,
        query: "key=a-z_A.Z~0:9@!$&'()*+,;=/?",
      });
      expect(uriHelpers.withQuery(uri, 'key[]=a b#ü%41%zz').query).toBe('key%5B%5D=a%20b%23%C3%BC%41%25zz');
    });

    test('withFragment', () => {
      expect(uriHelpers.withFragment(uri, 'a/b?c:d@e')).toEqual({ ...uri, fragment: 'a/b?c:d@e' });
      expect(uriHelpers.withFragment(uri, 'a b#c%41').fragment).toBe('a%20b%23c%41');
    });
  });
});
