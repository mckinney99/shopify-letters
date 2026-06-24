export const loader = () =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: https://etch.direct/sitemap.xml\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
