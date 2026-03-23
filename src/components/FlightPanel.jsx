import styles from './FlightPanel.module.css'

function StatBox({ label, value, unit }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>
        {value}
        {unit && <span className={styles.statUnit}>{unit}</span>}
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoKey}>{label}</span>
      <span className={`${styles.infoVal} ${highlight ? styles.highlight : ''}`}>{value || '—'}</span>
    </div>
  )
}

export default function FlightPanel({ open, onClose, base, rich, loading, hasApiKey, ft, kts, fpm }) {
  if (!base) return (
    <aside className={`${styles.panel} ${open ? styles.open : ''}`}>
      <div className={styles.empty}>select a flight</div>
    </aside>
  )

  // AirLabs field mapping
  // rich.alt (meters), rich.speed (km/h), rich.dir, rich.v_speed (m/s)
  // rich.dep_iata, rich.arr_iata, rich.airline_iata, rich.aircraft_icao
  // rich.flight_iata, rich.reg_number, rich.squawk, rich.status

  const altFt   = rich?.alt   ? ft(rich.alt)          : ft(base.alt)
  const spKts   = rich?.speed ? Math.round(rich.speed * 0.539957) : kts(base.speed)
  const vrFpm   = rich?.v_speed ? fpm(rich.v_speed) : null
  const heading = Math.round(rich?.dir || base.heading || 0)
  const fl      = altFt > 0 ? `FL${Math.round(altFt / 100)}` : '—'

  const airline  = rich?.airline_iata  || null
  const status   = rich?.status        || 'en-route'
  const aircraft = rich?.aircraft_icao || null
  const reg      = rich?.reg_number    || base.icao.toUpperCase()
  const dep      = rich?.dep_iata      || null
  const arr      = rich?.arr_iata      || null
  const squawk   = rich?.squawk        || '—'
  const callsign = rich?.flight_iata || base.callsign || base.icao

  return (
    <aside className={`${styles.panel} ${open ? styles.open : ''}`}>
      <div className={styles.topRow}>
        <div>
          <div className={styles.callsign}>{callsign}</div>
          <div className={styles.sub}>
            {airline ? `${airline} · ` : ''}{base.country || 'unknown origin'}
          </div>
        </div>
        <button className={styles.close} onClick={onClose}>✕</button>
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.loading}>fetching data...</div>
        )}

        {!loading && (dep || arr) && (
          <div className={styles.route}>
            <div className={styles.routeApt}>
              <div className={styles.aptCode}>{dep || '???'}</div>
              <div className={styles.aptName}>origin</div>
            </div>
            <div className={styles.routeMid}>
              <svg viewBox="0 0 80 24" className={styles.arcSvg}>
                <path d="M4 20 Q40 2 76 20" stroke="rgba(196,98,45,0.35)" strokeWidth="1" strokeDasharray="3 5" fill="none"/>
                <circle cx="40" cy="11" r="2.5" fill="#c4622d" opacity="0.8"/>
              </svg>
              <div className={styles.routeDots}>· · ·</div>
            </div>
            <div className={styles.routeApt}>
              <div className={styles.aptCode}>{arr || '???'}</div>
              <div className={styles.aptName}>destination</div>
            </div>
          </div>
        )}

        {!loading && !dep && !arr && (
          <div className={styles.noRoute}>
            {hasApiKey
              ? 'route data unavailable for this flight'
              : 'add airlabs key for route, airline & aircraft data'}
          </div>
        )}

        <div className={styles.statGrid}>
          <StatBox label="altitude" value={altFt > 0 ? altFt.toLocaleString() : '—'} unit="ft" />
          <StatBox label="speed"    value={spKts > 0 ? spKts : '—'} unit="kt" />
          <StatBox label="heading"  value={heading} unit="°" />
        </div>

        <div className={styles.divider} />

        <InfoRow label="flight level"  value={fl} highlight />
        <InfoRow label="vert rate"     value={vrFpm !== null ? `${vrFpm > 0 ? '+' : ''}${vrFpm.toLocaleString()} fpm` : '—'} />
        <InfoRow label="aircraft"      value={aircraft} />
        <InfoRow label="registration"  value={reg} />
        <InfoRow label="status"        value={status} highlight />
        <InfoRow label="squawk"        value={squawk} />
        <InfoRow label="position"      value={`${base.lat.toFixed(3)}° ${base.lon.toFixed(3)}°`} />

        <div className={styles.footer}>
          {hasApiKey ? 'opensky radar · airlabs enriched' : 'opensky radar only · add airlabs key for full data'}
        </div>
      </div>
    </aside>
  )
}
