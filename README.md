# chubbyts-http

[![CI](https://github.com/chubbyts/chubbyts-http/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/chubbyts/chubbyts-http/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/chubbyts/chubbyts-http/badge.svg?branch=master)](https://coveralls.io/github/chubbyts/chubbyts-http?branch=master)
[![Mutation testing badge](https://img.shields.io/endpoint?style=flat&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fchubbyts%2Fchubbyts-http%2Fmaster)](https://dashboard.stryker-mutator.io/reports/github.com/chubbyts/chubbyts-http/master)
[![npm-version](https://img.shields.io/npm/v/@chubbyts/chubbyts-http.svg)](https://www.npmjs.com/package/@chubbyts/chubbyts-http)

[![bugs](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=bugs)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![code_smells](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=code_smells)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![coverage](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=coverage)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![duplicated_lines_density](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=duplicated_lines_density)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![ncloc](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=ncloc)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![sqale_rating](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=sqale_rating)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![alert_status](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=alert_status)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![reliability_rating](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=reliability_rating)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![security_rating](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=security_rating)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![sqale_index](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=sqale_index)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)
[![vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-http&metric=vulnerabilities)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-http)

## Description

Implementation of the factories defined by [chubbyts/chubbyts-http-types][2], inspired by [PSR-7][3], [PSR-15][4] and
[PSR-17][5].

A message body is an `AsyncIterable<Uint8Array>`, the factories create Node.js [`Readable`][6] streams (which are one),
`getQueryParams` parses query strings with [qs][7].

| Factory                      | Creates                | Dependencies (with defaults) |
| ---------------------------- | ---------------------- | ---------------------------- |
| `createUriFactory`           | `UriFactory`           |                              |
| `createBodyFactory`          | `BodyFactory`          |                              |
| `createBodyFromFileFactory`  | `BodyFromFileFactory`  |                              |
| `createRequestFactory`       | `RequestFactory`       | `UriFactory`, `BodyFactory`  |
| `createServerRequestFactory` | `ServerRequestFactory` | `RequestFactory`             |
| `createResponseFactory`      | `ResponseFactory`      | `BodyFactory`                |

| Helper factory               | Creates                | Dependencies (with defaults) |
| ---------------------------- | ---------------------- | ---------------------------- |
| `createMessageHelpers`       | `MessageHelpers`       |                              |
| `createRequestHelpers`       | `RequestHelpers`       | `MessageHelpers`             |
| `createServerRequestHelpers` | `ServerRequestHelpers` | `RequestHelpers`             |
| `createResponseHelpers`      | `ResponseHelpers`      | `MessageHelpers`             |
| `createUriHelpers`           | `UriHelpers`           |                              |

## Requirements

- node: 22
- [chubbyts/chubbyts-http-types][2]: ^4.0.0
- [qs][7]: ^6.17.0

## Installation

Through [NPM](https://www.npmjs.com) as [@chubbyts/chubbyts-http][1].

```sh
npm i @chubbyts/chubbyts-http@^3.1.0
```

## Usage

### Uri

```ts
import { createUriFactory } from '@chubbyts/chubbyts-http/message-factory';

const uriFactory = createUriFactory();

const uri = uriFactory(
  'https://user:password@localhost:10443/api?key1=value1&key2[]=value2&key3[key31]=value3#fragment',
);
// {
//   scheme: 'https',
//   userInfo: 'user:password',
//   host: 'localhost',
//   port: 10443,
//   path: '/api',
//   query: 'key1=value1&key2[]=value2&key3[key31]=value3',
//   fragment: 'fragment',
// }
```

### Body

```ts
import { text } from 'node:stream/consumers';
import { createBodyFactory, createBodyFromFileFactory } from '@chubbyts/chubbyts-http/message-factory';

const bodyFactory = createBodyFactory();
const bodyFromFileFactory = createBodyFromFileFactory();

const body = bodyFactory('content');
const bodyFromFile = bodyFromFileFactory('/path/to/file'); // throws if there is no file at this path

await text(body); // 'content'
```

`createStreamFactory` and `createStreamFromFileFactory` are deprecated aliases of `createBodyFactory` and
`createBodyFromFileFactory`.

Any Node.js stream (like an `IncomingMessage`) or web `ReadableStream` already is a body, it needs no factory. Errors
while reading (e.g. a failing file read) get thrown while iterating the body.

### Request

```ts
import { createRequestFactory, createServerRequestFactory } from '@chubbyts/chubbyts-http/message-factory';

const requestFactory = createRequestFactory();
const serverRequestFactory = createServerRequestFactory();

const request = requestFactory('GET', 'https://localhost/api');
const serverRequest = serverRequestFactory('GET', 'https://localhost/api'); // with empty attributes
```

Requests and responses get created with protocol version `1.1`, no headers and an empty body. Each request gets its
own signal, which never gets aborted: a bridge replaces it with one it aborts when the client disconnects (e.g. with
`requestHelpers.withSignal`).

### Response

The reason phrase falls back to the one of [`STATUS_CODES`][8]:

```ts
import { createResponseFactory } from '@chubbyts/chubbyts-http/message-factory';

const responseFactory = createResponseFactory();

const response = responseFactory(404); // reasonPhrase: 'Not Found', empty body
const customResponse = responseFactory(404, 'Gone Fishing'); // reasonPhrase: 'Gone Fishing'
```

The body gets set with the response helpers, e.g. `responseHelpers.withBody(response, bodyFactory('content'))`.

### Helpers

The helpers follow the rules of [chubbyts/chubbyts-http-types][2], `getQueryParams` and `withQueryParams` use [qs][7]
with its defaults (keys changing the prototype get ignored, depth 5, 20 array items, 1000 parameters).

```ts
import {
  createResponseHelpers,
  createServerRequestHelpers,
  createUriHelpers,
} from '@chubbyts/chubbyts-http/message-helper';

const serverRequestHelpers = createServerRequestHelpers(); // contains the request and message helpers
const responseHelpers = createResponseHelpers(); // contains the message helpers
const uriHelpers = createUriHelpers();

serverRequestHelpers.getHeaderLine(serverRequest, 'Accept'); // 'application/json, text/html'

const responseWithStatus = responseHelpers.withStatus(response, 404); // reasonPhrase: 'Not Found'
const responseWithHeader = responseHelpers.withHeader(responseWithStatus, 'Content-Type', 'application/json');

uriHelpers.toString(uriHelpers.withPath(uri, '/a b')); // 'https://localhost/a%20b'

serverRequestHelpers.getCookieParams(serverRequest); // { session: 'abc' }
serverRequestHelpers.getQueryParams(serverRequest); // { key1: 'value1', key2: ['value2'], key3: { key31: 'value3' } }
serverRequestHelpers.withQueryParams(serverRequest, { key: ['value'] }); // uri.query: 'key%5B0%5D=value'

const responseWithCookie = responseHelpers.withCookie(response, '__Host-session', 'abc', {
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'Lax',
}); // set-cookie: __Host-session=abc; Path=/; Secure; HttpOnly; SameSite=Lax
```

## Copyright

2026 Dominik Zogg

[1]: https://www.npmjs.com/package/@chubbyts/chubbyts-http
[2]: https://www.npmjs.com/package/@chubbyts/chubbyts-http-types
[3]: https://www.php-fig.org/psr/psr-7
[4]: https://www.php-fig.org/psr/psr-15
[5]: https://www.php-fig.org/psr/psr-17
[6]: https://nodejs.org/api/stream.html#class-streamreadable
[7]: https://www.npmjs.com/package/qs
[8]: https://nodejs.org/api/http.html#httpstatus_codes
