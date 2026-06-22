// Board title (dashboard-pixel .title). Splits a "name-with-dashes" so the first dash renders coral
// via a class (NO inline style). Server component.
import styles from "./board.module.css";

export function BoardTitle({ name }: { name: string }) {
  const upper = name.toUpperCase();
  const i = upper.indexOf("-");
  if (i < 0) return <h1 className={styles.title}>{upper}</h1>;
  return (
    <h1 className={styles.title}>
      {upper.slice(0, i)}
      <span className={styles.dash}>-</span>
      {upper.slice(i + 1)}
    </h1>
  );
}
