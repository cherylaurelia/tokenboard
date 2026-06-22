// §5.3 personal/free email providers. A free mailbox is valid but must NOT form a company board.
// O(1) on the lowercased domain. Kept separate from the disposable list (different refresh
// cadence/source). Expanded with ISP/country variants + a proton.* suffix catch.
export const FREE_PROVIDERS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "live.co.uk",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "yahoo.ca",
  "yahoo.fr",
  "yahoo.de",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "protonmail.ch",
  "pm.me",
  "aol.com",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "mail.com",
  "email.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "qq.com",
  "163.com",
  "126.com",
  "sina.com",
  "fastmail.com",
  "fastmail.fm",
  "hey.com",
  // common US ISP mail
  "comcast.net",
  "verizon.net",
  "sbcglobal.net",
  "att.net",
  "cox.net",
  "charter.net",
  "bellsouth.net",
]);

export function isFreeProvider(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (FREE_PROVIDERS.has(d)) return true;
  if (d === "proton.me" || d.endsWith(".proton.me")) return true; // proton sub-aliases
  return false;
}
