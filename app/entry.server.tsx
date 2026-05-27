import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { createReadableStreamFromReadable } from "@remix-run/node";
import type { EntryContext } from "@remix-run/node";
import { addDocumentResponseHeaders } from "./shopify.server";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const { pipe, abort } = renderToPipeableStream(
    <RemixServer context={remixContext} url={request.url} />,
    {
      onShellReady() {
        responseHeaders.set("Content-Type", "text/html");
        const body = new PassThrough();
        const stream = createReadableStreamFromReadable(body);
        pipe(body);
        resolve(
          new Response(stream, {
            headers: responseHeaders,
            status: responseStatusCode,
          })
        );
      },
      onShellError(error) {
        reject(error);
      },
      onError(error) {
        responseStatusCode = 500;
        console.error(error);
      },
    }
  );

  setTimeout(abort, 5000);

  let resolve: (value: Response) => void;
  let reject: (error: unknown) => void;

  return new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
}
