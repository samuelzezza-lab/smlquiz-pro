export async function onRequest(context) {
  const url = new URL(context.request.url)

  if (url.hostname.toLowerCase() === 'www.smlquiz.it') {
    url.hostname = 'smlquiz.it'
    return Response.redirect(url.toString(), 301)
  }

  // Keep legacy /app URLs working even when Pages Functions take precedence
  // over the static _redirects file. The React app is mounted at /?app=1.
  if (url.pathname === '/app' || url.pathname === '/app/') {
    url.pathname = '/'
    url.searchParams.set('app', '1')
    return Response.redirect(url.toString(), 302)
  }

  return context.next()
}
