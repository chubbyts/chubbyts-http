import { randomBytes } from 'node:crypto';
import { mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Readable } from 'node:stream';
import { text as readStream } from 'node:stream/consumers';
import { describe, expect, test } from 'vitest';
import {
  createUriFactory,
  createStreamFactory,
  createStreamFromFileFactory,
  createServerRequestFactory,
  createRequestFactory,
  createResponseFactory,
} from '../src/message-factory.js';

describe('message-factory', () => {
  describe('createUriFactory', () => {
    test('with host', () => {
      const uriFactory = createUriFactory();

      expect(uriFactory('https://localhost')).toMatchInlineSnapshot(`
        {
          "fragment": "",
          "host": "localhost",
          "path": "/",
          "port": undefined,
          "query": "",
          "scheme": "https",
          "userInfo": "",
        }
      `);
    });

    test('with host and port', () => {
      const uriFactory = createUriFactory();

      expect(uriFactory('https://localhost:10443')).toMatchInlineSnapshot(`
        {
          "fragment": "",
          "host": "localhost",
          "path": "/",
          "port": 10443,
          "query": "",
          "scheme": "https",
          "userInfo": "",
        }
      `);
    });

    test('with user, host and port', () => {
      const uriFactory = createUriFactory();

      expect(uriFactory('https://user@localhost:10443')).toMatchInlineSnapshot(`
        {
          "fragment": "",
          "host": "localhost",
          "path": "/",
          "port": 10443,
          "query": "",
          "scheme": "https",
          "userInfo": "user",
        }
      `);
    });

    test('with user, password, host and port', () => {
      const uriFactory = createUriFactory();

      expect(uriFactory('https://user:password@localhost:10443')).toMatchInlineSnapshot(`
        {
          "fragment": "",
          "host": "localhost",
          "path": "/",
          "port": 10443,
          "query": "",
          "scheme": "https",
          "userInfo": "user:password",
        }
      `);
    });

    test('with user, password, host, port and path', () => {
      const uriFactory = createUriFactory();

      expect(uriFactory('https://user:password@localhost:10443/api')).toMatchInlineSnapshot(`
        {
          "fragment": "",
          "host": "localhost",
          "path": "/api",
          "port": 10443,
          "query": "",
          "scheme": "https",
          "userInfo": "user:password",
        }
      `);
    });

    test('with user, password, host, port, path and query', () => {
      const uriFactory = createUriFactory();

      expect(uriFactory('https://user:password@localhost:10443/api?key1=value1&key2[]=value2&key3[key31]=value3'))
        .toMatchInlineSnapshot(`
          {
            "fragment": "",
            "host": "localhost",
            "path": "/api",
            "port": 10443,
            "query": "key1=value1&key2[]=value2&key3[key31]=value3",
            "scheme": "https",
            "userInfo": "user:password",
          }
        `);
    });

    test('with user, password, host, port, path, query and fragment', () => {
      const uriFactory = createUriFactory();

      expect(uriFactory('https://user:password@localhost:10443/api?key=value#key=value')).toMatchInlineSnapshot(`
        {
          "fragment": "key=value",
          "host": "localhost",
          "path": "/api",
          "port": 10443,
          "query": "key=value",
          "scheme": "https",
          "userInfo": "user:password",
        }
      `);
    });
  });

  describe('createStreamFactory', () => {
    test('with content', async () => {
      const streamFactory = createStreamFactory();

      expect(await readStream(streamFactory('test'))).toBe('test');
    });

    test('without content', async () => {
      const streamFactory = createStreamFactory();

      expect(await readStream(streamFactory(''))).toBe('');
    });

    test('is not in object mode', () => {
      const streamFactory = createStreamFactory();

      expect((streamFactory('test') as Readable).readableObjectMode).toBe(false);
    });
  });

  describe('createStreamFromFileFactory', () => {
    test('without existing file', async () => {
      const streamFactory = createStreamFromFileFactory();

      expect(() => {
        streamFactory('/path/to/unknown/file');
      }).toThrow('File with filename: "/path/to/unknown/file" does not exists.');
    });

    test('with directory', async () => {
      const directory = tmpdir() + '/' + randomBytes(8).toString('hex');

      mkdirSync(directory);

      const streamFactory = createStreamFromFileFactory();

      expect(() => {
        streamFactory(directory);
      }).toThrow(`File with filename: "${directory}" does not exists.`);

      rmdirSync(directory);
    });

    test('with existing file', async () => {
      const filename = tmpdir() + '/' + randomBytes(8).toString('hex');

      writeFileSync(filename, 'test');

      const streamFactory = createStreamFromFileFactory();
      const stream = streamFactory(filename);

      expect(await readStream(stream)).toBe('test');

      unlinkSync(filename);
    });
  });

  describe('createRequestFactory', () => {
    test('with uri as string', async () => {
      const requestFactory = createRequestFactory();
      const request = requestFactory('GET', 'https://localhost:10443/api');

      const { body, signal, ...rest } = request;

      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);

      expect(await readStream(body)).toBe('');

      expect(rest).toMatchInlineSnapshot(`
        {
          "headers": {},
          "method": "GET",
          "protocolVersion": "1.1",
          "uri": {
            "fragment": "",
            "host": "localhost",
            "path": "/api",
            "port": 10443,
            "query": "",
            "scheme": "https",
            "userInfo": "",
          },
        }
      `);
    });

    test('with uri as object', async () => {
      const requestFactory = createRequestFactory();
      const request = requestFactory('GET', createUriFactory()('https://localhost:10443/api'));

      const { body, signal, ...rest } = request;

      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);

      expect(await readStream(body)).toBe('');

      expect(rest).toMatchInlineSnapshot(`
        {
          "headers": {},
          "method": "GET",
          "protocolVersion": "1.1",
          "uri": {
            "fragment": "",
            "host": "localhost",
            "path": "/api",
            "port": 10443,
            "query": "",
            "scheme": "https",
            "userInfo": "",
          },
        }
      `);
    });
  });

  test('createRequestFactory creates a signal per request', () => {
    const requestFactory = createRequestFactory();

    expect(requestFactory('GET', 'https://localhost').signal).not.toBe(
      requestFactory('GET', 'https://localhost').signal,
    );
  });

  test('createServerRequestFactory', async () => {
    const serverRequestFactory = createServerRequestFactory();
    const serverRequest = serverRequestFactory('GET', 'https://localhost:10443/api');

    const { body, signal, ...rest } = serverRequest;

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    expect(await readStream(body)).toBe('');

    expect(rest).toMatchInlineSnapshot(`
      {
        "attributes": {},
        "headers": {},
        "method": "GET",
        "protocolVersion": "1.1",
        "uri": {
          "fragment": "",
          "host": "localhost",
          "path": "/api",
          "port": 10443,
          "query": "",
          "scheme": "https",
          "userInfo": "",
        },
      }
    `);
  });

  describe('createResponseFactory', () => {
    test('without reason phrase, but found in map', async () => {
      const responseFactory = createResponseFactory();
      const response = responseFactory(404);

      const { body, ...rest } = response;

      expect(await readStream(body)).toBe('');

      expect(rest).toMatchInlineSnapshot(`
        {
          "headers": {},
          "protocolVersion": "1.1",
          "reasonPhrase": "Not Found",
          "status": 404,
        }
      `);
    });

    test('without reason phrase, but not found in map', async () => {
      const responseFactory = createResponseFactory();
      const response = responseFactory(600);

      const { body, ...rest } = response;

      expect(await readStream(body)).toBe('');

      expect(rest).toMatchInlineSnapshot(`
        {
          "headers": {},
          "protocolVersion": "1.1",
          "reasonPhrase": "",
          "status": 600,
        }
      `);
    });

    test('with reason phrase', async () => {
      const responseFactory = createResponseFactory();
      const response = responseFactory(404, 'Not Found???!!!');

      const { body, ...rest } = response;

      expect(await readStream(body)).toBe('');

      expect(rest).toMatchInlineSnapshot(`
        {
          "headers": {},
          "protocolVersion": "1.1",
          "reasonPhrase": "Not Found???!!!",
          "status": 404,
        }
      `);
    });
  });
});
