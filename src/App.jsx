import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
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

function planeIcon(heading = 0, selected = false) {
  const color = selected ? '#c4622d' : '#3a3830'
  const size  = selected ? 16 : 11
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${heading}deg);display:block;transition:transform 0.6s ease">
    <path d="M12 2L7.5 10.5H3.5L12 15L10 23L12 21.5L14 23L12 15L20.5 10.5H16.5Z" fill="${color}" opacity="${selected ? 1 : 0.7}"/>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

// ── MapController: handles events + exposes map ref ──────────────────────────
function MapController({ onBoundsChange, mapRef }) {
  const map = useMap()
  useEffect(() => { mapRef.current = map }, [map, mapRef])
  useMapEvents({ moveend: onBoundsChange, zoomend: onBoundsChange })
  return null
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [flights, setFlights]         = useState({})      // icao → base data
  const [selected, setSelected]       = useState(null)    // icao string
  const [richData, setRichData]       = useState(null)    // aviationstack payload
  const [panelOpen, setPanelOpen]     = useState(false)
  const [loading, setLoading]         = useState(false)
  const [flightCount, setFlightCount] = useState(null)
  const [apiKey, setApiKey]           = useState(() => localStorage.getItem('al_key') || '')
  const [queryCount, setQueryCount]   = useState(0)
  const [arcPoints, setArcPoints]     = useState([])
  const [airports, setAirports]       = useState([])      // [{lat,lon,code}]
  const [searchMsg, setSearchMsg]     = useState('')

  const mapRef      = useRef(null)
  const markersRef  = useRef({})
  const fetchTimer  = useRef(null)
  const abortRef    = useRef(null)

  // persist key
  useEffect(() => {
    if (apiKey) localStorage.setItem('al_key', apiKey)
    else localStorage.removeItem('al_key')
  }, [apiKey])

  // ── OpenSky fetch ───────────────────────────────────────────────────────────
  const fetchFlights = useCallback(async () => {
    const map = mapRef.current
    if (!map) return

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    const b = map.getBounds()
    const zoom = map.getZoom()

    // Cap bounding box on low zooms to avoid huge payloads
    const center = map.getCenter()
    const maxSpan = zoom < 4 ? 40 : zoom < 6 ? 25 : 999
    const lamin = Math.max(b.getSouth(), center.lat - maxSpan)
    const lamax = Math.min(b.getNorth(), center.lat + maxSpan)
    const lomin = Math.max(b.getWest(),  center.lng - maxSpan)
    const lomax = Math.min(b.getEast(),  center.lng + maxSpan)

    try {
      const bbox = `lamin=${lamin.toFixed(2)}&lomin=${lomin.toFixed(2)}&lamax=${lamax.toFixed(2)}&lomax=${lomax.toFixed(2)}`
      const openSkyUrl = `https://opensky-network.org/api/states/all?${bbox}`
      const url = `https://corsproxy.io/?url=${encodeURIComponent(openSkyUrl)}`
      const res = await fetch(url, { signal: abortRef.current.signal })
      if (!res.ok) return
      const data = await res.json()
      const next = {}
      ;(data.states || []).forEach(s => {
        const [icao, cs, country, , , lon, lat, alt, onGround, speed, heading] = s
        if (!lat || !lon || onGround) return
        next[icao] = {
          icao,
          callsign: (cs || '').trim() || icao,
          lat, lon, alt, speed,
          heading: heading || 0,
          country: country || '',
        }
      })
      setFlights(next)
      setFlightCount(Object.keys(next).length)
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('OpenSky fetch failed', e)
    }
  }, [])

  const scheduleFetch = useCallback(() => {
    clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(fetchFlights, 800)
  }, [fetchFlights])

  useEffect(() => {
    fetchFlights()
    const interval = setInterval(fetchFlights, 30000)
    return () => clearInterval(interval)
  }, [fetchFlights])

  // ── AviationStack enrichment ────────────────────────────────────────────────
  const enrichFlight = useCallback(async (callsign, icao) => {
    if (!apiKey) return null
    try {
      setQueryCount(q => q + 1)
      // AirLabs: search by flight_iata callsign or hex icao
      const param = callsign && callsign.length > 2 ? `flight_iata=${encodeURIComponent(callsign)}` : `hex=${icao}`
      const url = `https://airlabs.co/api/v9/flights?${param}&api_key=${apiKey}`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = await res.json()
      return data.response?.[0] || null
    } catch { return null }
  }, [apiKey])

  // ── Select a flight ─────────────────────────────────────────────────────────
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

    // build arc from dep → current → arr
    if (rich) {
      const dep = rich.dep_iata
      const arr = rich.arr_iata
      const AIRPORT_LOOKUP = {
        SFO:[37.619,-122.374], LAX:[33.942,-118.408], JFK:[40.641,-73.778],
        ORD:[41.974,-87.907], ATL:[33.641,-84.427], LHR:[51.477,-0.461],
        CDG:[49.013,2.550], DXB:[25.252,55.364], NRT:[35.765,140.386],
        SYD:[-33.946,151.177], AMS:[52.309,4.764], FRA:[50.037,8.562],
        SIN:[1.359,103.989], PEK:[40.080,116.584], HND:[35.549,139.780],
        MIA:[25.796,-80.287], SEA:[47.450,-122.309], DFW:[32.897,-97.038],
        BOS:[42.365,-71.010], SLC:[40.788,-111.978], DEN:[39.856,-104.674],
        LAS:[36.080,-115.152], PHX:[33.438,-112.008], IAH:[29.984,-95.341],
        MSP:[44.881,-93.222], DTW:[42.213,-83.353], PHL:[39.872,-75.241],
        CLT:[35.214,-80.943], BWI:[39.175,-76.669], IAD:[38.944,-77.456],
        EWR:[40.693,-74.168], MDW:[41.786,-87.752], MCO:[28.429,-81.309],
        FLL:[26.072,-80.153], TPA:[27.976,-82.533], SAN:[32.734,-117.190],
        PDX:[45.589,-122.593], HOU:[29.645,-95.279], AUS:[30.197,-97.666],
        BNA:[36.125,-86.678], RDU:[35.877,-78.787], MCI:[39.298,-94.714],
        STL:[38.748,-90.370], MSY:[29.993,-90.258], CLE:[41.412,-81.850],
        CMH:[39.998,-82.892], IND:[39.717,-86.294], MKE:[42.947,-87.897],
        PIT:[40.492,-80.233], CVG:[39.049,-84.667], OAK:[37.721,-122.221],
        SJC:[37.362,-121.929], SMF:[38.695,-121.591], BUR:[34.201,-118.359],
        GRU:[-23.432,-46.469], GIG:[-22.810,-43.251], EZE:[-34.822,-58.536],
        BOG:[4.702,-74.147], LIM:[-12.022,-77.114], SCL:[-33.393,-70.786],
        MEX:[19.436,-99.072], CUN:[21.037,-86.877], YYZ:[43.677,-79.631],
        YVR:[49.195,-123.184], YUL:[45.458,-73.750], YYC:[51.132,-114.013],
        MAN:[53.354,-2.275], BCN:[41.298,2.078], MAD:[40.472,-3.562],
        FCO:[41.800,12.239], MXP:[45.630,8.723], ZRH:[47.458,8.548],
        VIE:[48.110,16.570], BRU:[50.901,4.484], CPH:[55.618,12.656],
        ARN:[59.652,17.919], OSL:[60.194,11.100], HEL:[60.317,24.963],
        WAW:[52.166,20.967], PRG:[50.100,14.260], BUD:[47.437,19.261],
        ATH:[37.936,23.944], IST:[41.275,28.752], TLV:[32.009,34.887],
        DOH:[25.261,51.565], AUH:[24.433,54.651], KWI:[29.227,47.969],
        BOM:[19.089,72.868], DEL:[28.556,77.100], BLR:[13.198,77.706],
        MAA:[12.990,80.169], HYD:[17.231,78.430], CCU:[22.655,88.447],
        PVG:[31.144,121.805], CAN:[23.392,113.299],
        CTU:[30.579,103.947], SHA:[31.197,121.336], SZX:[22.640,113.812],
        ICN:[37.469,126.451], GMP:[37.558,126.791], KIX:[34.427,135.244],
        NGO:[34.858,136.805], CTS:[42.775,141.693], OKA:[26.196,127.646],
        BKK:[13.681,100.747], SGN:[10.819,106.652], HAN:[21.221,105.807],
        KUL:[2.746,101.710], CGK:[-6.126,106.656], MNL:[14.509,121.020],
        TPE:[25.077,121.233], HKG:[22.309,113.915], MFM:[22.150,113.592],
        SVO:[55.973,37.415], DME:[55.408,37.906], LED:[59.800,30.263],
        CAI:[30.122,31.406], ADD:[8.978,38.799], NBO:[-1.319,36.928],
        JNB:[-26.134,28.242], CPT:[-33.965,18.602], DKR:[14.741,-17.490],
        CMN:[33.367,-7.590], ALG:[36.691,3.215], TUN:[36.851,10.228],
        MEL:[-37.673,144.843], BNE:[-27.384,153.118],
        PER:[-31.940,115.967], ADL:[-34.945,138.531], AKL:[-37.008,174.792],
      }
      const pts = []
      const apts = []
      if (dep && AIRPORT_LOOKUP[dep]) {
        pts.push(AIRPORT_LOOKUP[dep])
        apts.push({ lat: AIRPORT_LOOKUP[dep][0], lon: AIRPORT_LOOKUP[dep][1], code: dep })
      }
      pts.push([base.lat, base.lon])
      if (arr && AIRPORT_LOOKUP[arr]) {
        pts.push(AIRPORT_LOOKUP[arr])
        apts.push({ lat: AIRPORT_LOOKUP[arr][0], lon: AIRPORT_LOOKUP[arr][1], code: arr })
      }
      if (pts.length >= 2) { setArcPoints(pts); setAirports(apts) }
    }
  }, [flights, enrichFlight])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setSelected(null)
    setArcPoints([])
    setAirports([])
  }, [])

  // ── Search ──────────────────────────────────────────────────────────────────
  const handleSearch = useCallback((q) => {
    const term = q.trim().toLowerCase()
    if (!term) return
    const found = Object.values(flights).find(
      d => d.callsign.toLowerCase().includes(term) || d.icao.toLowerCase().includes(term)
    )
    if (found) {
      selectFlight(found.icao)
      mapRef.current?.setView([found.lat, found.lon], 7, { animate: true, duration: 1 })
      setSearchMsg('')
    } else {
      setSearchMsg('not found')
      setTimeout(() => setSearchMsg(''), 2500)
    }
  }, [flights, selectFlight])

  // ── Render markers imperatively for performance ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set()
    Object.values(flights).forEach(d => {
      seen.add(d.icao)
      if (markersRef.current[d.icao]) {
        markersRef.current[d.icao].setLatLng([d.lat, d.lon])
        markersRef.current[d.icao].setIcon(planeIcon(d.heading, d.icao === selected))
      } else {
        const m = L.marker([d.lat, d.lon], {
          icon: planeIcon(d.heading, false),
          zIndexOffset: 100,
        }).addTo(map)
        m.on('click touchend', (e) => { L.DomEvent.stopPropagation(e); selectFlight(d.icao) })
        markersRef.current[d.icao] = m
      }
    })
    Object.keys(markersRef.current).forEach(icao => {
      if (!seen.has(icao)) {
        map.removeLayer(markersRef.current[icao])
        delete markersRef.current[icao]
      }
    })
  }, [flights, selected, selectFlight])

  // update selected marker highlight when selection changes
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([icao, m]) => {
      const d = flights[icao]
      if (d) m.setIcon(planeIcon(d.heading, icao === selected))
    })
  }, [selected, flights])

  return (
    <div className={styles.app}>
      <MapContainer
        center={[30, 0]}
        zoom={3}
        zoomControl={false}
        preferCanvas={true}
        attributionControl={false}
        className={styles.map}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" maxZoom={18} />
        <MapController onBoundsChange={scheduleFetch} mapRef={mapRef} />

        {arcPoints.length >= 2 && (
          <Polyline
            positions={arcPoints}
            pathOptions={{ color: 'rgba(196,98,45,0.35)', weight: 1, dashArray: '4 7' }}
          />
        )}
        {airports.map(a => (
          <CircleMarker
            key={a.code}
            center={[a.lat, a.lon]}
            radius={3}
            pathOptions={{ color: 'rgba(196,98,45,0.7)', fillColor: 'rgba(196,98,45,0.25)', fillOpacity: 1, weight: 1 }}
          />
        ))}
      </MapContainer>

      <Header count={flightCount} />
      <ApiKeyInput value={apiKey} onChange={setApiKey} queryCount={queryCount} />
      <SearchBar onSearch={handleSearch} message={searchMsg} />

      <FlightPanel
        open={panelOpen}
        onClose={closePanel}
        base={selected ? flights[selected] : null}
        rich={richData}
        loading={loading}
        hasApiKey={!!apiKey}
        ft={ft} kts={kts} fpm={fpm}
      />

      <button className={styles.refreshBtn} onClick={fetchFlights}>↻</button>
    </div>
  )
}
