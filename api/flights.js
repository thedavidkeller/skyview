export default async function handler(req, res) {
  const { lamin, lomin, lamax, lomax } = req.query

  if (!lamin || !lomin || !lamax || !lomax) {
    return res.status(400).json({ error: 'Missing bbox params' })
  }

  // Clamp values to valid ranges
  const params = new URLSearchParams({
    lamin: Math.max(-90,  parseFloat(lamin)).toFixed(2),
    lomin: Math.max(-180, parseFloat(lomin)).toFixed(2),
    lamax: Math.min(90,   parseFloat(lamax)).toFixed(2),
    lomax: Math.min(180,  parseFloat(lomax)).toFixed(2),
  })

  try {
    const upstream = await fetch(
      `https://opensky-network.org/api/states/all?${params}`,
      {
        headers: {
          'User-Agent': 'skyview-app/1.0',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'OpenSky error', status: upstream.status })
    }

    const data = await upstream.json()

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30')
    return res.status(200).json(data)

  } catch (e) {
    return res.status(502).json({ error: 'Upstream failed', detail: e.message })
  }
}
