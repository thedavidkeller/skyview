export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const { searchParams } = new URL(req.url)
  const lamin = searchParams.get('lamin')
  const lomin = searchParams.get('lomin')
  const lamax = searchParams.get('lamax')
  const lomax = searchParams.get('lomax')
  if (!lamin || !lomin || !lamax || !lomax) {
    return new Response(JSON.stringify({ error: 'Missing bbox' }), { status: 400, headers: CORS })
  }

  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`

  // Use credentials if set in Vercel env vars — authenticated requests have much higher rate limits
  // and are less likely to be blocked from datacenter IPs.
  // Set OPENSKY_USER and OPENSKY_PASS in Vercel project settings (Environment Variables).
  const user = typeof process !== 'undefined' ? process.env.OPENSKY_USER : undefined
  const pass = typeof process !== 'undefined' ? process.env.OPENSKY_PASS : undefined
  const authHeader = user && pass
    ? { 'Authorization': `Basic ${btoa(`${user}:${pass}`)}` }
    : {}

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', ...authHeader },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`OpenSky ${res.status}:`, body.slice(0, 200))
      return new Response(JSON.stringify({ error: res.status, detail: body.slice(0, 200) }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=15', ...CORS },
    })
  } catch (e) {
    console.error('OpenSky fetch threw:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
}
