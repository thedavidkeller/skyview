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

  // airplanes.live uses center+radius (nm), compute from bbox
  const lat = (parseFloat(lamin) + parseFloat(lamax)) / 2
  const lon = (parseFloat(lomin) + parseFloat(lomax)) / 2
  const latSpan = parseFloat(lamax) - parseFloat(lamin)
  const lonSpan = parseFloat(lomax) - parseFloat(lomin)
  const radiusNm = Math.min(Math.ceil(Math.max(latSpan, lonSpan) * 60), 150)

  const url = `https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radiusNm}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const upstream = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '')
      console.error(`airplanes.live ${upstream.status}:`, body.slice(0, 200))
      res.status(upstream.status).json({ error: upstream.status })
      return
    }

    const data = await upstream.json()

    // Transform to OpenSky-compatible state vectors so the frontend needs no changes.
    // airplanes.live units: alt_baro=ft, gs=kts, baro_rate=fpm
    // OpenSky units:        altitude=m,  velocity=m/s, vertical_rate=m/s
    const states = (data.ac || []).map(ac => {
      const onGround = ac.alt_baro === 'ground' || typeof ac.alt_baro !== 'number'
      const altM     = onGround ? 0 : ac.alt_baro / 3.281
      const speedMs  = (ac.gs       || 0) / 1.944
      const vRateMs  = (ac.baro_rate || 0) / 197
      return [
        ac.hex,                   // [0]  icao24
        (ac.flight || '').trim(), // [1]  callsign
        '',                       // [2]  origin_country
        null, null,               // [3,4] time_position, last_contact
        ac.lon,                   // [5]  longitude
        ac.lat,                   // [6]  latitude
        altM,                     // [7]  baro_altitude (m)
        onGround,                 // [8]  on_ground
        speedMs,                  // [9]  velocity (m/s)
        ac.track || 0,            // [10] true_track
        vRateMs,                  // [11] vertical_rate (m/s)
        null, null,               // [12,13] sensors, geo_altitude
        ac.squawk || null,        // [14] squawk
        ac.category || null,      // [15] aircraft category (A7=helicopter, B6=drone, etc.)
      ]
    })

    res.setHeader('Cache-Control', 'public, s-maxage=15')
    res.status(200).json({ states, time: Math.floor(Date.now() / 1000) })
  } catch (e) {
    clearTimeout(timeout)
    console.error('airplanes.live fetch threw:', e.message)
    res.status(502).json({ error: e.message })
  }
}
