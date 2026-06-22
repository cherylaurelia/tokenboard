// /auth/auth-code-error — minimal OAuth failure page so failure redirects don't 404.
// Phase 7 restyles.
export default function AuthCodeError() {
  return (
    <main>
      <h1>Sign-in failed</h1>
      <p>The GitHub sign-in could not be completed.</p>
      <p>
        <a href="/api/auth/login">Try again</a>
      </p>
    </main>
  );
}
