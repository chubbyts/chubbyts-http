import { createReadStream, statSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';
import { Readable } from 'node:stream';
import type { Body, Method, Request, Response, ServerRequest, Uri } from '@chubbyts/chubbyts-http-types/message';
import type {
  BodyFactory,
  BodyFromFileFactory,
  RequestFactory,
  ResponseFactory,
  ServerRequestFactory,
  UriFactory,
} from '@chubbyts/chubbyts-http-types/message-factory';

export const createUriFactory = (): UriFactory => {
  return (uri: string): Uri => {
    const { protocol, username, password, hostname, port, pathname, search, hash } = new URL(uri);

    return {
      scheme: protocol.substring(0, protocol.length - 1),
      userInfo: password !== '' ? `${username}:${password}` : username,
      host: hostname,
      port: port ? Number.parseInt(port, 10) : undefined,
      path: pathname,
      query: search.substring(1),
      fragment: hash ? hash.substring(1) : '',
    };
  };
};

export const createBodyFactory = (): BodyFactory => {
  // not in object mode: the chunks of a body have to be bytes
  return (content: string): Body => Readable.from([Buffer.from(content)], { objectMode: false });
};

export const createBodyFromFileFactory = (): BodyFromFileFactory => {
  return (filename: string): Body => {
    // a directory exists as well, but would fail asynchronously while reading
    if (!statSync(filename, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`File with filename: "${filename}" does not exists.`);
    }

    // read errors get thrown while iterating the body
    return createReadStream(filename);
  };
};

/** @deprecated use `createBodyFactory`, the body is not a stream anymore */
export const createStreamFactory = createBodyFactory;

/** @deprecated use `createBodyFromFileFactory`, the body is not a stream anymore */
export const createStreamFromFileFactory = createBodyFromFileFactory;

export const createRequestFactory = (
  uriFactory: UriFactory = createUriFactory(),
  bodyFactory: BodyFactory = createBodyFactory(),
): RequestFactory => {
  return (method: Method, uri: string | Uri): Request => {
    return {
      method,
      uri: typeof uri === 'string' ? uriFactory(uri) : uri,
      protocolVersion: '1.1',
      headers: {},
      body: bodyFactory(''),
      // one controller per request, a shared never aborted signal would collect the listeners of all requests
      signal: new AbortController().signal,
    };
  };
};

export const createServerRequestFactory = (
  requestFactory: RequestFactory = createRequestFactory(),
): ServerRequestFactory => {
  return (method: Method, uri: string | Uri): ServerRequest => {
    return {
      ...requestFactory(method, uri),
      attributes: {},
    };
  };
};

export const createResponseFactory = (bodyFactory: BodyFactory = createBodyFactory()): ResponseFactory => {
  return (status: number, reasonPhrase?: string): Response => {
    return {
      status,
      reasonPhrase: reasonPhrase ?? STATUS_CODES[status] ?? '',
      protocolVersion: '1.1',
      headers: {},
      body: bodyFactory(''),
    };
  };
};
