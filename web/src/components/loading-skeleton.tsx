// Shared route-transition skeleton rendered by each route's loading.tsx. App Router shows this
// instantly on navigation while the force-dynamic server work (getViewer + DB + Redis) runs, so the
// click feels responsive instead of stalling on the previous page. No props: loading.tsx has no
// access to params/data, so this is purely cosmetic placeholder blocks.
import styles from "./loading-skeleton.module.css";

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.surface}>
      <div className={styles.bar} aria-hidden="true" />
      <main className={styles.shell} aria-busy="true" aria-label="Loading">
        <div className={`${styles.block} ${styles.title}`} />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={`${styles.block} ${styles.row}`} />
        ))}
      </main>
    </div>
  );
}
