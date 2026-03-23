import { useState } from 'react'
import styles from './ApiKeyInput.module.css'

export default function ApiKeyInput({ value, onChange, queryCount }) {
  const [open, setOpen] = useState(!value)
  const active = value && value.length > 10

  return (
    <div className={styles.wrapper}>
      {active && !open ? (
        <button
          className={styles.pill}
          onClick={() => setOpen(true)}
          title="Edit API key"
        >
          <span className={styles.pillDot} />
          airlabs
        </button>
      ) : (
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            type="password"
            placeholder="airlabs api key"
            value={value}
            onChange={e => onChange(e.target.value)}
            spellCheck={false}
            autoFocus={active}
          />
          {active && (
            <button className={styles.done} onClick={() => setOpen(false)}>
              done
            </button>
          )}
        </div>
      )}
      {!active && (
        <span className={styles.status}>no key — opensky only</span>
      )}
      {active && open && queryCount > 0 && (
        <span className={styles.status}>{queryCount} queries used</span>
      )}
    </div>
  )
}
