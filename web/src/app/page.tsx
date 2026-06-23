// Landing "/" — ported from prototypes/landing-dark. Server component; the only client bits are the
// CopyCommand buttons and the Reveal scroll-in wrapper. The .surfaceLanding class scopes the Fira
// body + dotted-grid to this route only. CTAs point at real routes (sign-in -> /global when anon).
import Link from "next/link";
import styles from "./page.module.css";
import { CopyCommand } from "@/components/landing/copy-command";
import { Reveal } from "@/components/landing/reveal";
import { SiteFooter } from "@/components/site-footer";
import { getViewer } from "@/lib/auth/get-viewer";

const NPX = "npx @tokenboard/cli";

export default async function LandingPage() {
  const v = await getViewer();
  const viewer = v === "outage" ? null : v;
  const leaderboardCta = viewer ? "/global" : "/api/auth/login?next=/global";

  return (
    <div className={styles.surfaceLanding}>
      <nav className={styles.nav} aria-label="Primary">
        <div className={`${styles.wrap} ${styles.navInner}`}>
          <a className={styles.wordmark} href="#top">
            <span className={styles.caret} aria-hidden="true">
              &gt;_
            </span>
            TOKENBOARD
          </a>
          <ul className={styles.navLinks}>
            <li>
              <Link href="/global">Leaderboard</Link>
            </li>
            <li>
              <Link href="/communities">Communities</Link>
            </li>
            <li>
              <a href="https://github.com/angelafeliciaa/tokenboard" target="_blank" rel="noopener">
                GitHub
              </a>
            </li>
          </ul>
          <div className={styles.spacer} />
          <Link className={styles.navCta} href={leaderboardCta}>
            Leaderboard
          </Link>
        </div>
      </nav>

      <main id="top">
        <div className={styles.wrap}>
          <section className={styles.hero}>
            <Reveal as="h1" delay={1} className={styles.headline}>
              See who&rsquo;s burning the <span className={styles.accent}>most tokens.</span>
            </Reveal>
            <Reveal as="p" delay={2} className={styles.subline}>
              Track your spend across Claude Code, Codex, Opencode and more — then race your friends
              to the top of the board.
            </Reveal>
            <Reveal delay={3} className={styles.ctaRow}>
              <a className={styles.btnPrimary} href="#how">
                Get started
              </a>
              <a
                className={styles.btnSecondary}
                href="https://github.com/angelafeliciaa/tokenboard"
                target="_blank"
                rel="noopener"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                GitHub
              </a>
            </Reveal>

            <Reveal delay={4} className={styles.termWrap} id="how">
              <div className={styles.terminal}>
                <div className={styles.termBar}>
                  <span className={styles.dots} aria-hidden="true">
                    <span className={styles.r} />
                    <span className={styles.y} />
                    <span className={styles.g} />
                  </span>
                  <span className={styles.termTitle}>~/steel-cartel — zsh</span>
                </div>
                <div className={styles.termBody}>
                  <div className={styles.ln}>
                    <span className={styles.pr}>$</span>
                    <span className={styles.cmd}>
                      npx <b>@tokenboard/cli</b>
                    </span>
                    <span className={styles.cmt}># see your number + claim your spot</span>
                    <CopyCommand value={NPX} />
                  </div>
                  <div className={styles.ln}>
                    <span className={styles.pr}>$</span>
                    <span className={styles.cmd}>
                      tokenboard <b>sync</b>
                    </span>
                    <span className={styles.cmt}># push usage (hourly cron)</span>
                  </div>
                  <div className={styles.ln}>
                    <span className={styles.pr}>$</span>
                    <span className={styles.cmd}>
                      tokenboard <b>board</b> steel-cartel
                    </span>
                  </div>
                  <p className={styles.termOut}>
                    <span className={styles.ok}>&#10003; synced 6.9M tokens</span>{" "}
                    <span className={styles.hl}>&middot;</span> you&rsquo;re{" "}
                    <span className={styles.you}>#5</span> in{" "}
                    <span className={styles.hl}>steel-cartel</span>
                  </p>
                </div>
              </div>
            </Reveal>
          </section>

          <Reveal as="section" className={styles.shotSection}>
            <div className={styles.shotFrame}>
              {/* plain <img> matches the prototype + avoids the optimizer/remotePatterns config */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/shots/dashboard-pixel.png"
                width={1200}
                height={760}
                alt="The tokenboard leaderboard showing the steel-cartel community ranked by token spend."
              />
            </div>
            <p className={styles.shotCap}>
              The live board — climb it at <Link href="/global">tokenboard.sh/global</Link>
            </p>
          </Reveal>

          <Reveal as="section" className={styles.works}>
            <span className={styles.lbl}>Works with</span>
            <div className={styles.tools}>
              <span className={styles.t}>Claude Code</span>
              <span className={styles.pipe} aria-hidden="true">
                |
              </span>
              <span className={styles.t}>Codex</span>
              <span className={styles.pipe} aria-hidden="true">
                |
              </span>
              <span className={styles.t}>Opencode</span>
              <span className={styles.pipe} aria-hidden="true">
                |
              </span>
              <span className={styles.t}>Grok</span>
              <span className={styles.pipe} aria-hidden="true">
                |
              </span>
              <span className={styles.t}>Droid</span>
              <span className={styles.pipe} aria-hidden="true">
                |
              </span>
              <span className={`${styles.t} ${styles.more}`}>+ more via ccusage</span>
            </div>
          </Reveal>

          <section className={styles.bottomCta}>
            <Reveal className={styles.ctaTerm}>
              <div className={styles.bar}>
                <span className={styles.dots} aria-hidden="true">
                  <span className={styles.r} />
                  <span className={styles.y} />
                  <span className={styles.g} />
                </span>
                <span className={styles.ttl}>run it</span>
                <CopyCommand value={NPX} />
              </div>
              <div className={styles.ctaBody}>
                <span className={styles.pr}>$</span>
                <span className={styles.cmd}>
                  npx <b>@tokenboard/cli</b>
                </span>
                <span className={styles.blink} aria-hidden="true" />
              </div>
            </Reveal>
          </section>
        </div>
      </main>

      <SiteFooter variant="landing" />
    </div>
  );
}
