import styles from './Header.module.css'

export default function Header({ count, nearbyCount, alert }) {
  return (
    <header className={styles.header}>
      <div className={styles.logo}>Skyview</div>
      <div className={styles.status}>
        <span className={styles.dot} />
        <span className={styles.count}>
          {count === null ? 'connecting...' : `${count.toLocaleString()} flights`}
        </span>
        {nearbyCount > 0 && (
          <span className={`${styles.nearby} ${alert ? styles.alert : ''}`}>
            {nearbyCount} nearby
          </span>
        )}
      </div>
    </header>
  )
}
