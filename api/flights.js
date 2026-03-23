export const config = { runtime: 'edge' }

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const lamin = searchParams.get('lamin')
  const lomin = searchParams.get('lomin')
  const lamax = searchParams.get('lamax')
  const lomax = searchParams.get('lomax')
  if (!lamin || !lomin || !lamax || !lomax) {
    return new Response(JSON.stringify({ error: 'Missing bbox' }), { status: 400 })
  }
  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; skyview/1.0)' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return new Response(JSON.stringify({ error: res.status }), { status: res.status, headers: { 'Access-Control-Allow-Origin': '*' } })
    const data = await res.json()
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, s-maxage=15' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } })
  }
}
