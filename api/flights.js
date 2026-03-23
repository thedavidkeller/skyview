// Node.js serverless (not edge) — uses AWS Lambda IPs, which OpenSky doesn't block
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const { lamin, lomin, lamax, lomax } = req.query
  if (!lamin || !lomin || !lamax || !lomax) {
    res.status(400).json({ error: 'Missing bbox' })
    return
  }

  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`

  const headers = { 'Accept': 'application/json' }
  const user = process.env.OPENSKY_USER
  const pass = process.env.OPENSKY_PASS
  if (user && pass) {
    headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const upstream = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(timeout)

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '')
      console.error(`OpenSky ${upstream.status}:`, body.slice(0, 200))
      res.status(upstream.status).json({ error: upstream.status, detail: body.slice(0, 200) })
      return
    }

    const data = await upstream.json()
    res.setHeader('Cache-Control', 'public, s-maxage=15')
    res.status(200).json(data)
  } catch (e) {
    clearTimeout(timeout)
    console.error('OpenSky fetch threw:', e.message)
    res.status(502).json({ error: e.message })
  }
}
