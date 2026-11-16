/** Path and query of a Pages Router URL, without the hash. */
export function routeUrl(asPath: string): string {
  const i = asPath.indexOf('#');
  return i === -1 ? asPath : asPath.slice(0, i);
}
