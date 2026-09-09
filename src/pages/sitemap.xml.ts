import type { APIRoute } from 'astro';
import { SITE_URL } from '../lib/site.ts';

export const GET: APIRoute = () => {
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/escalera-multifuncional-5-metros`,
    `${SITE_URL}/escalera-telescopica-5-metros`,
    `${SITE_URL}/escalera-4-en-1`,
    `${SITE_URL}/escalera-para-techo`,
    `${SITE_URL}/escalera-para-pintar`
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
};
