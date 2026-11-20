export async function onRequest(context) {
  const url = new URL(context.request.url)

  if (url.hostname.toLowerCase() === 'www.smlquiz.it') {
    url.hostname = 'smlquiz.it'
    return Response.redirect(url.toString(), 301)
  }

  return context.next()
}
