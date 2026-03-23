import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Circle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import FlightPanel from './components/FlightPanel.jsx'
import Header from './components/Header.jsx'
import SearchBar from './components/SearchBar.jsx'
import ApiKeyInput from './components/ApiKeyInput.jsx'
import styles from './App.module.css'

// ── helpers ──────────────────────────────────────────────────────────────────
const ft  = (m)  => m ? Math.round(m * 3.281) : 0
const kts = (ms) => ms ? Math.round(ms * 1.944) : 0
const fpm = (ms) => ms ? Math.round(ms * 197) : 0
const MI_TO_M = 1609.34
const RADIUS_MI = 3

// Haversine distance in miles
function distanceMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Closing speed: positive = approaching
function closingSpeed(myLat, myLon, plane) {
  if (!plane.speed || !plane.heading) return null
  const bearingToPlane = Math.atan2(
    Math.sin((plane.lon - myLon) * Math.PI/180) * Math.cos(plane.lat * Math.PI/180),
    Math.cos(myLat * Math.PI/180) * Math.sin(plane.lat * Math.PI/180) -
    Math.sin(myLat * Math.PI/180) * Math.cos(plane.lat * Math.PI/180) * Math.cos((plane.lon - myLon) * Math.PI/180)
  ) * 180 / Math.PI
  const relAngle = ((plane.heading - (bearingToPlane + 180)) + 360) % 360
  return Math.round(kts(plane.speed) * Math.cos(relAngle * Math.PI / 180))
}

// Color by altitude
function altColor(altFt, distMi) {
  const isNear = distMi < RADIUS_MI
  if (altFt <= 0) return '#888'
  if (altFt < 1200) return isNear ? '#e53e3e' : '#e07b39'   // low: red if nearby, orange otherwise
  if (altFt < 5000) return '#d4a017'                          // mid
  return '#3a3830'                                             // high cruise
}

function markerStyle(selected, altFt, distMi) {
  const color = selected ? '#c4622d' : altColor(altFt, distMi)
  return {
    radius:      selected ? 8 : (distMi < RADIUS_MI ? 6 : 4),
    fillColor:   color,
    fillOpacity: selected ? 1 : (distMi < RADIUS_MI ? 0.9 : 0.65),
    color:       selected ? '#c4622d' : 'rgba(0,0,0,0.25)',
    weight:      selected ? 2 : 1,
  }
}

// Dead-reckon a position forward by elapsedS seconds given speed (m/s) and heading (deg)
function deadReckon(lat, lon, speedMs, heading, elapsedS) {
  if (!speedMs || elapsedS <= 0) return [lat, lon]
  const dist = speedMs * elapsedS
  const R = 6371000
  const h = heading * Math.PI / 180
  const lat1 = lat * Math.PI / 180
  const lon1 = lon * Math.PI / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist / R) + Math.cos(lat1) * Math.sin(dist / R) * Math.cos(h))
  const lon2 = lon1 + Math.atan2(Math.sin(h) * Math.sin(dist / R) * Math.cos(lat1), Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2))
  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI]
}

// ── MapController ─────────────────────────────────────────────────────────────
function MapController({ onBoundsChange, mapRef }) {
  const map = useMap()
  useEffect(() => { mapRef.current = map }, [map, mapRef])
  useMapEvents({ moveend: onBoundsChange, zoomend: onBoundsChange })
  return null
}

// ── LocateControl ─────────────────────────────────────────────────────────────
function LocateControl({ userPos, onLocate }) {
  const map = useMap()
  const locate = () => {
    if (userPos) {
      map.setView([userPos.lat, userPos.lon], 11, { animate: true, duration: 0.8 })
    } else {
      onLocate()
    }
  }
  return null // rendered as overlay button, not Leaflet control
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [flights, setFlights]         = useState({})
  const [selected, setSelected]       = useState(null)
  const [richData, setRichData]       = useState(null)
  const [panelOpen, setPanelOpen]     = useState(false)
  const [loading, setLoading]         = useState(false)
  const [flightCount, setFlightCount] = useState(null)
  const [fetchError, setFetchError]   = useState(null)
  const [nearbyCount, setNearbyCount] = useState(0)
  const [apiKey, setApiKey]           = useState(() => localStorage.getItem('al_key') || '')
  const [queryCount, setQueryCount]   = useState(0)
  const [arcPoints, setArcPoints]     = useState([])
  const [airports, setAirports]       = useState([])
  const [searchMsg, setSearchMsg]     = useState('')
  const [userPos, setUserPos]         = useState(null)
  const [locating, setLocating]       = useState(false)
  const [alert, setAlert]             = useState(null) // { callsign, distMi, altFt }

  const mapRef      = useRef(null)
  const markersRef  = useRef({})
  const canvasRef   = useRef(null)
  const fetchTimer  = useRef(null)
  const abortRef    = useRef(null)
  const watchRef    = useRef(null)
  const lastFetchAt = useRef(0)

  // persist key
  useEffect(() => {
    if (apiKey) localStorage.setItem('al_key', apiKey)
    else localStorage.removeItem('al_key')
  }, [apiKey])

  // ── Geolocation ──────────────────────────────────────────────────────────────
  const locateUser = useCallback(() => {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        setUserPos({ lat, lon })
        setLocating(false)
        mapRef.current?.setView([lat, lon], 11, { animate: true, duration: 0.8 })
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [])

  // Auto-locate on mount
  useEffect(() => {
    if (navigator.geolocation) locateUser()
  }, [])

  // Continuous position watch
  useEffect(() => {
    if (!navigator.geolocation) return
    watchRef.current = navigator.geolocation.watchPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      null,
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchRef.current)
  }, [])

  // ── OpenSky fetch ─────────────────────────────────────────────────────────────
  const fetchFlights = useCallback(async (force = false) => {
    const map = mapRef.current
    if (!map) return
    const now = Date.now()
    if (!force && now - lastFetchAt.current < 20000) return
    lastFetchAt.current = now
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    const b = map.getBounds()
    const zoom = map.getZoom()
    const center = map.getCenter()
    const maxSpan = zoom < 4 ? 40 : zoom < 6 ? 25 : 999
    const lamin = Math.max(b.getSouth(), center.lat - maxSpan)
    const lamax = Math.min(b.getNorth(), center.lat + maxSpan)
    const lomin = Math.max(b.getWest(),  center.lng - maxSpan)
    const lomax = Math.min(b.getEast(),  center.lng + maxSpan)

    try {
      const bbox = `lamin=${lamin.toFixed(2)}&lomin=${lomin.toFixed(2)}&lamax=${lamax.toFixed(2)}&lomax=${lomax.toFixed(2)}`
      const url = `/api/flights?${bbox}`
      const res = await fetch(url, { signal: abortRef.current.signal })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`OpenSky proxy error ${res.status}:`, body)
        setFetchError(`error ${res.status}`)
        setFlightCount(c => c === null ? 0 : c)
        return
      }
      const data = await res.json()
      const next = {}
      ;(data.states || []).forEach(s => {
        const [icao, cs, country, , , lon, lat, alt, onGround, speed, heading, , , , vSpeed] = s
        if (!lat || !lon || onGround) return
        next[icao] = {
          icao, callsign: (cs || '').trim() || icao,
          lat, lon, alt, speed, heading: heading || 0,
          vSpeed: vSpeed || 0, country: country || '',
          fetchedAt: Date.now(),
        }
      })
      setFlights(next)
      setFlightCount(Object.keys(next).length)
      setFetchError(null)
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('fetch failed', e)
        setFetchError('no connection')
        setFlightCount(c => c === null ? 0 : c)
      }
    }
  }, [])

  const scheduleFetch = useCallback(() => {
    clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(fetchFlights, 800)
  }, [fetchFlights])

  useEffect(() => {
    fetchFlights(true)
    const interval = setInterval(() => fetchFlights(true), 45000)
    return () => clearInterval(interval)
  }, [fetchFlights])

  // ── Nearby alert check ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userPos) return
    let closest = null
    let closestDist = 99
    let nearby = 0
    Object.values(flights).forEach(d => {
      const dist = distanceMi(userPos.lat, userPos.lon, d.lat, d.lon)
      const altFt = ft(d.alt)
      if (dist < RADIUS_MI) nearby++
      if (dist < RADIUS_MI && altFt < 1500 && altFt > 0) {
        if (dist < closestDist) { closestDist = dist; closest = { ...d, distMi: dist, altFt } }
      }
    })
    setNearbyCount(nearby)
    setAlert(closest ? closest : null)
  }, [flights, userPos])

  // ── AirLabs enrichment ────────────────────────────────────────────────────────
  const enrichFlight = useCallback(async (callsign, icao) => {
    if (!apiKey) return null
    try {
      setQueryCount(q => q + 1)
      const param = callsign && callsign.length > 2 ? `flight_iata=${encodeURIComponent(callsign)}` : `hex=${icao}`
      const url = `https://airlabs.co/api/v9/flights?${param}&api_key=${apiKey}`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = await res.json()
      return data.response?.[0] || null
    } catch { return null }
  }, [apiKey])

  // ── Select a flight ────────────────────────────────────────────────────────────
  const selectFlight = useCallback(async (icao) => {
    const base = flights[icao]
    if (!base) return
    setSelected(icao)
    setPanelOpen(true)
    setRichData(null)
    setArcPoints([])
    setAirports([])
    setLoading(true)
    mapRef.current?.panTo([base.lat, base.lon], { animate: true, duration: 0.7 })
    const rich = await enrichFlight(base.callsign, base.icao)
    setRichData(rich)
    setLoading(false)
    if (rich) {
      const dep = rich.dep_iata, arr = rich.arr_iata
      const AIRPORTS = {
        SFO:[37.619,-122.374],LAX:[33.942,-118.408],JFK:[40.641,-73.778],ORD:[41.974,-87.907],
        ATL:[33.641,-84.427],LHR:[51.477,-0.461],CDG:[49.013,2.550],DXB:[25.252,55.364],
        NRT:[35.765,140.386],SYD:[-33.946,151.177],AMS:[52.309,4.764],FRA:[50.037,8.562],
        SIN:[1.359,103.989],PEK:[40.080,116.584],HND:[35.549,139.780],MIA:[25.796,-80.287],
        SEA:[47.450,-122.309],DFW:[32.897,-97.038],BOS:[42.365,-71.010],DEN:[39.856,-104.674],
        LAS:[36.080,-115.152],IAH:[29.984,-95.341],MCO:[28.429,-81.309],SAN:[32.734,-117.190],
        PDX:[45.589,-122.593],AUS:[30.197,-97.666],YYZ:[43.677,-79.631],YVR:[49.195,-123.184],
        MAN:[53.354,-2.275],BCN:[41.298,2.078],MAD:[40.472,-3.562],FCO:[41.800,12.239],
        ZRH:[47.458,8.548],VIE:[48.110,16.570],IST:[41.275,28.752],DXB:[25.252,55.364],
        DOH:[25.261,51.565],BOM:[19.089,72.868],DEL:[28.556,77.100],PVG:[31.144,121.805],
        ICN:[37.469,126.451],HKG:[22.309,113.915],BKK:[13.681,100.747],SIN:[1.359,103.989],
        GRU:[-23.432,-46.469],EZE:[-34.822,-58.536],MEX:[19.436,-99.072],BOG:[4.702,-74.147],
        OAK:[37.721,-122.221],SJC:[37.362,-121.929],SFO:[37.619,-122.374],SMF:[38.695,-121.591],
      }
      const pts = [], apts = []
      if (dep && AIRPORTS[dep]) { pts.push(AIRPORTS[dep]); apts.push({ lat: AIRPORTS[dep][0], lon: AIRPORTS[dep][1], code: dep }) }
      pts.push([base.lat, base.lon])
      if (arr && AIRPORTS[arr]) { pts.push(AIRPORTS[arr]); apts.push({ lat: AIRPORTS[arr][0], lon: AIRPORTS[arr][1], code: arr }) }
      if (pts.length >= 2) { setArcPoints(pts); setAirports(apts) }
    }
  }, [flights, enrichFlight])

  const closePanel = useCallback(() => {
    setPanelOpen(false); setSelected(null); setArcPoints([]); setAirports([])
  }, [])

  // ── Search ────────────────────────────────────────────────────────────────────
  const handleSearch = useCallback((q) => {
    const term = q.trim().toLowerCase()
    if (!term) return
    const found = Object.values(flights).find(
      d => d.callsign.toLowerCase().includes(term) || d.icao.toLowerCase().includes(term)
    )
    if (found) {
      selectFlight(found.icao)
      mapRef.current?.setView([found.lat, found.lon], 9, { animate: true, duration: 1 })
      setSearchMsg('')
    } else {
      setSearchMsg('not found')
      setTimeout(() => setSearchMsg(''), 2500)
    }
  }, [flights, selectFlight])

  // ── Render markers (canvas — one <canvas> for all markers, no DOM per plane) ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!canvasRef.current) canvasRef.current = L.canvas({ padding: 0.5 })
    const seen = new Set()
    Object.values(flights).forEach(d => {
      seen.add(d.icao)
      const altFt = ft(d.alt)
      const dist  = userPos ? distanceMi(userPos.lat, userPos.lon, d.lat, d.lon) : 99
      const style = markerStyle(d.icao === selected, altFt, dist)
      if (markersRef.current[d.icao]) {
        markersRef.current[d.icao].setLatLng([d.lat, d.lon])
        markersRef.current[d.icao].setRadius(style.radius)
        markersRef.current[d.icao].setStyle(style)
      } else {
        const m = L.circleMarker([d.lat, d.lon], { ...style, renderer: canvasRef.current }).addTo(map)
        m.on('click', () => selectFlight(d.icao))
        markersRef.current[d.icao] = m
      }
    })
    Object.keys(markersRef.current).forEach(icao => {
      if (!seen.has(icao)) { map.removeLayer(markersRef.current[icao]); delete markersRef.current[icao] }
    })
  }, [flights, selected, selectFlight, userPos])

  useEffect(() => {
    Object.entries(markersRef.current).forEach(([icao, m]) => {
      const d = flights[icao]
      if (d) {
        const altFt = ft(d.alt)
        const dist  = userPos ? distanceMi(userPos.lat, userPos.lon, d.lat, d.lon) : 99
        const style = markerStyle(icao === selected, altFt, dist)
        m.setRadius(style.radius)
        m.setStyle(style)
      }
    })
  }, [selected, flights, userPos])

  // ── Dead-reckoning animation loop ────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      Object.values(flights).forEach(d => {
        const marker = markersRef.current[d.icao]
        if (!marker || !d.speed) return
        const elapsed = (now - d.fetchedAt) / 1000
        const pos = deadReckon(d.lat, d.lon, d.speed, d.heading, elapsed)
        marker.setLatLng(pos)
      })
    }, 3000)
    return () => clearInterval(timer)
  }, [flights])

  const nearbyFlights = userPos
    ? Object.values(flights)
        .map(d => ({ ...d, distMi: distanceMi(userPos.lat, userPos.lon, d.lat, d.lon), altFt: ft(d.alt) }))
        .filter(d => d.distMi < RADIUS_MI)
        .sort((a, b) => a.distMi - b.distMi)
    : []

  return (
    <div className={styles.app}>
      <MapContainer
        center={[37.8, -122.4]}
        zoom={5}
        zoomControl={false}
        attributionControl={false}
        className={styles.map}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png" maxZoom={18} />
        <MapController onBoundsChange={scheduleFetch} mapRef={mapRef} />

        {/* 3mi radius ring */}
        {userPos && (
          <>
            <Circle
              center={[userPos.lat, userPos.lon]}
              radius={RADIUS_MI * MI_TO_M}
              pathOptions={{ color: 'rgba(196,98,45,0.5)', weight: 1.5, fill: false, dashArray: '6 8' }}
            />
            <CircleMarker
              center={[userPos.lat, userPos.lon]}
              radius={5}
              pathOptions={{ color: '#c4622d', fillColor: '#c4622d', fillOpacity: 1, weight: 2 }}
            />
          </>
        )}

        {arcPoints.length >= 2 && (
          <Polyline positions={arcPoints} pathOptions={{ color: 'rgba(196,98,45,0.35)', weight: 1, dashArray: '4 7' }} />
        )}
        {airports.map(a => (
          <CircleMarker key={a.code} center={[a.lat, a.lon]} radius={3}
            pathOptions={{ color: 'rgba(196,98,45,0.7)', fillColor: 'rgba(196,98,45,0.25)', fillOpacity: 1, weight: 1 }} />
        ))}
      </MapContainer>

      <Header count={flightCount} nearbyCount={nearbyCount} alert={!!alert} error={fetchError} />
      <ApiKeyInput value={apiKey} onChange={setApiKey} queryCount={queryCount} />
      <SearchBar onSearch={handleSearch} message={searchMsg} />

      {/* Locate me button */}
      <button
        className={`${styles.locateBtn} ${locating ? styles.locating : ''}`}
        onClick={locateUser}
        title="Center on my location"
      >
        {locating ? '…' : '◎'}
      </button>

      {/* Low altitude alert banner */}
      {alert && (
        <div className={styles.alertBanner}>
          <span className={styles.alertDot} />
          <span className={styles.alertText}>
            {alert.callsign} · {alert.distMi.toFixed(1)}mi · {alert.altFt.toLocaleString()}ft
            {alert.vSpeed < -1 ? ' ↓' : ''}
          </span>
        </div>
      )}

      {/* Nearby list */}
      {nearbyFlights.length > 0 && !panelOpen && (
        <div className={styles.nearbyPanel}>
          {nearbyFlights.slice(0, 5).map(d => {
            const closing = userPos ? closingSpeed(userPos.lat, userPos.lon, d) : null
            return (
              <div key={d.icao} className={styles.nearbyRow} onClick={() => selectFlight(d.icao)}>
                <span className={styles.nearbyDot} style={{ background: altColor(d.altFt, d.distMi) }} />
                <span className={styles.nearbyCall}>{d.callsign}</span>
                <span className={styles.nearbyDist}>{d.distMi.toFixed(1)}mi</span>
                <span className={styles.nearbyAlt}>{d.altFt > 0 ? d.altFt.toLocaleString() + 'ft' : '—'}</span>
                {closing !== null && <span className={`${styles.nearbyClose} ${closing > 0 ? styles.approaching : ''}`}>
                  {closing > 0 ? `+${closing}kt` : `${closing}kt`}
                </span>}
              </div>
            )
          })}
        </div>
      )}

      <FlightPanel
        open={panelOpen}
        onClose={closePanel}
        base={selected ? flights[selected] : null}
        rich={richData}
        loading={loading}
        hasApiKey={!!apiKey}
        userPos={userPos}
        ft={ft} kts={kts} fpm={fpm}
        distanceMi={distanceMi}
        closingSpeed={closingSpeed}
      />

      <button className={styles.refreshBtn} onClick={fetchFlights}>↻</button>
    </div>
  )
}
