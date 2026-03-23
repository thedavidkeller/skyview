import { useState } from 'react'
import styles from './SearchBar.module.css'

export default function SearchBar({ onSearch, message }) {
  const [value, setValue] = useState('')

  const submit = () => {
    if (value.trim()) onSearch(value)
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.bar}>
        <input
          className={styles.input}
          type="text"
          placeholder="callsign or ICAO..."
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          maxLength={20}
          spellCheck={false}
        />
        <button className={styles.btn} onClick={submit}>find</button>
      </div>
      {message && <span className={styles.msg}>{message}</span>}
    </div>
  )
}
