import styles from './FlightPanel.module.css'

function StatBox({ label, value, unit, warn }) {
  return (
    <div className={`${styles.stat} ${warn ? styles.warn : ''}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>
        {value}
        {unit && <span className={styles.statUnit}>{unit}</span>}
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight, warn }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoKey}>{label}</span>
      <span className={`${styles.infoVal} ${highlight ? styles.highlight : ''} ${warn ? styles.warn : ''}`}>{value || '—'}</span>
    </div>
  )
}

export default function FlightPanel({ open, onClose, base, rich, loading, hasApiKey, userPos, ft, kts, fpm, distanceMi, closingSpeed }) {
  if (!base) return (
    <aside className={`${styles.panel} ${open ? styles.open : ''}`}>
      <div className={styles.empty}>select a flight</div>
    </aside>
  )

  const altFt   = rich?.alt   ? ft(rich.alt)   : ft(base.alt)
  const spKts   = rich?.speed ? Math.round(rich.speed * 0.539957) : kts(base.speed)
  const vrFpm   = rich?.v_speed ? fpm(rich.v_speed) : (base.vSpeed ? fpm(base.vSpeed) : null)
  const heading = Math.round(rich?.dir || base.heading || 0)
  const fl      = altFt > 0 ? `FL${Math.round(altFt / 100)}` : '—'

  const airline  = rich?.airline_iata || null
  const status   = rich?.status       || 'en-route'
  const aircraft = rich?.aircraft_icao || null
  const reg      = rich?.reg_number   || base.icao.toUpperCase()
  const dep      = rich?.dep_iata     || null
  const arr      = rich?.arr_iata     || null
  const squawk   = rich?.squawk       || '—'
  const callsign = rich?.flight_iata  || base.callsign || base.icao

  const craftType = base.category === 'A7' ? 'helicopter'
    : base.category === 'B6' ? 'drone'
    : base.category === 'B1' ? 'glider'
    : 'airplane'

  const distMi = userPos ? distanceMi(userPos.lat, userPos.lon, base.lat, base.lon) : null
  const closing = userPos ? closingSpeed(userPos.lat, userPos.lon, base) : null
  const isLow  = altFt > 0 && altFt < 1500
  const isNear = distMi !== null && distMi < 3

  return (
    <aside className={`${styles.panel} ${open ? styles.open : ''}`}>
      <div className={styles.topRow}>
        <div>
          <div className={styles.callsign}>{callsign}</div>
          <div className={styles.sub}>{craftType}{airline ? ` · ${airline}` : ''}{base.country ? ` · ${base.country}` : ''}</div>
        </div>
        <button className={styles.close} onClick={onClose}>✕</button>
      </div>

      <div className={styles.body}>
        {loading && <div className={styles.loading}>fetching data...</div>}

        {!loading && (dep || arr) && (
          <div className={styles.route}>
            <div className={styles.routeApt}>
              <div className={styles.aptCode}>{dep || '???'}</div>
              <div className={styles.aptName}>origin</div>
            </div>
            <div className={styles.routeMid}>
              <svg viewBox="0 0 80 24" className={styles.arcSvg}>
                <path d="M4 20 Q40 2 76 20" stroke="rgba(13,108,242,0.4)" strokeWidth="1" strokeDasharray="3 5" fill="none"/>
                <circle cx="40" cy="11" r="2.5" fill="#0d6cf2" opacity="0.9"/>
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
            {hasApiKey ? 'route data unavailable' : 'add airlabs key for route & airline data'}
          </div>
        )}

        <div className={styles.statGrid}>
          <StatBox label="altitude" value={altFt > 0 ? altFt.toLocaleString() : '—'} unit="ft" warn={isLow} />
          <StatBox label="speed"    value={spKts > 0 ? spKts : '—'} unit="kt" />
          <StatBox label="heading"  value={heading} unit="°" />
        </div>

        {/* Distance + closing speed block */}
        {distMi !== null && (
          <div className={`${styles.distBlock} ${isNear && isLow ? styles.distWarn : ''}`}>
            <div className={styles.distItem}>
              <div className={styles.distLabel}>distance</div>
              <div className={styles.distValue}>{distMi.toFixed(1)}<span className={styles.distUnit}>mi</span></div>
            </div>
            <div className={styles.distDivider} />
            <div className={styles.distItem}>
              <div className={styles.distLabel}>closing</div>
              <div className={`${styles.distValue} ${closing > 20 ? styles.approaching : closing < -20 ? styles.departing : ''}`}>
                {closing !== null ? `${closing > 0 ? '+' : ''}${closing}` : '—'}
                <span className={styles.distUnit}>kt</span>
              </div>
            </div>
            <div className={styles.distDivider} />
            <div className={styles.distItem}>
              <div className={styles.distLabel}>vert rate</div>
              <div className={styles.distValue}>
                {vrFpm !== null ? `${vrFpm > 0 ? '+' : ''}${vrFpm.toLocaleString()}` : '—'}
                <span className={styles.distUnit}>fpm</span>
              </div>
            </div>
          </div>
        )}

        <div className={styles.divider} />

        <InfoRow label="flight level"  value={fl} highlight />
        <InfoRow label="aircraft"      value={aircraft} />
        <InfoRow label="registration"  value={reg} />
        <InfoRow label="status"        value={status} highlight />
        <InfoRow label="squawk"        value={squawk} />
        <InfoRow label="position"      value={`${base.lat.toFixed(3)}° ${base.lon.toFixed(3)}°`} />

        <div className={styles.footer}>
          {hasApiKey ? 'opensky radar · airlabs enriched' : 'opensky radar · add airlabs key for full data'}
        </div>
      </div>
    </aside>
  )
}
