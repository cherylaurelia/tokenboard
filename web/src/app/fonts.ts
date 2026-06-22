// next/font/google definitions — each maps to a CSS variable the prototypes' :root used. This is a
// font-config module (it owns the font setup), not a barrel. Press Start 2P / VT323 / Space Mono are
// NON-variable Google fonts, so `weight` is mandatory (next/font throws at build otherwise); the
// other three are variable. display:"swap" + latin subset for the perf-correct setup.
import {
  Press_Start_2P,
  VT323,
  Space_Mono,
  JetBrains_Mono,
  Fira_Code,
  Geist_Mono,
} from "next/font/google";

export const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--pixel",
});
export const term = VT323({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--term",
});
export const money = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--money",
});
export const num = Geist_Mono({ subsets: ["latin"], display: "swap", variable: "--num" });
export const handle = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--handle" });
export const sans = Fira_Code({ subsets: ["latin"], display: "swap", variable: "--sans" });

// Applied on <html> so all six families preload on every route.
export const fontVars = `${pixel.variable} ${term.variable} ${money.variable} ${num.variable} ${handle.variable} ${sans.variable}`;
