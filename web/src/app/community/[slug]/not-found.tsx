// 404/403 state for an unknown or private board, in the token palette. notFound() from the page
// renders this; we don't distinguish 403 from 404 in copy (don't reveal a private board exists).
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import styles from "./board.module.css";
import notFoundStyles from "./not-found.module.css";

export default function BoardNotFound() {
  return (
    <div className={`${styles.surfaceBoardBase}`}>
      <main className={notFoundStyles.center}>
        <p className={notFoundStyles.code}>404</p>
        <h1 className={notFoundStyles.title}>No board here</h1>
        <p className={notFoundStyles.lede}>
          This community doesn&rsquo;t exist, or it&rsquo;s private and you&rsquo;re not a member.
        </p>
        <Link className={notFoundStyles.link} href="/global">
          Go to the global board
        </Link>
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
