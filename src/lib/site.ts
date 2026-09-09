/** Origin público único para canonical, sitemap y robots. */
const publicSiteUrl = typeof import.meta.env === 'object' && import.meta.env ? import.meta.env.PUBLIC_SITE_URL : undefined;

export const SITE_URL = (publicSiteUrl ?? 'https://www.ladderland.site').replace(/\/+$/, '');
