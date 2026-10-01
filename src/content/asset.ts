/**
 * Content and code refer to files by root-relative paths ("/assets/..."). On GitHub Pages the site lives under a
 * sub-path, so every such path is prefixed with the build's base. In dev the base is "/", so nothing changes.
 */
export const asset = (path: string): string => (path.startsWith("/") ? import.meta.env.BASE_URL.replace(/\/$/, "") + path : path);
