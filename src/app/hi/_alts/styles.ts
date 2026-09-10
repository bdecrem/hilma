export const styles = `@font-face {
  font-family: Instrument;
  src: url('/hi/alts/assets/instrument-serif.ttf') format('truetype');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: Instrument;
  src: url('/hi/alts/assets/instrument-serif-italic.ttf') format('truetype');
  font-style: italic;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: Tight;
  src: url('/hi/alts/assets/inter-tight.ttf') format('truetype');
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: Tight;
  src: url('/hi/alts/assets/inter-tight-semibold.ttf') format('truetype');
  font-weight: 600;
  font-display: swap;
}

@font-face {
  font-family: Plex;
  src: url('/hi/alts/assets/plex-mono.ttf') format('truetype');
  font-weight: 400;
  font-display: swap;
}

:root {
  font-family: Tight,Arial,sans-serif;
  font-synthesis: none;
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  -webkit-font-smoothing: antialiased;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}

img {
  display: block;
  max-width: 100%;
}

button,a {
  -webkit-tap-highlight-color: transparent;
}

button:focus-visible,a:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 6px;
}

::selection {
  background: #d75030;
  color: #fff;
}

.mono {
  font: 10px/1.55 Plex,monospace;
  letter-spacing: .03em;
}

.edition-nav {
  position: fixed;
  right: 25px;
  bottom: 19px;
  z-index: 40;
  display: flex;
  gap: 3px;
  align-items: center;
  background: #f2f0e9f2;
  color: #332f29;
  border: 1px solid #d2cfc5;
  box-shadow: 0 3px 16px #00000008;
  padding: 4px 7px 4px 13px;
  backdrop-filter: blur(14px);
  border-radius: 3px;
}

.edition-nav a {
  display: grid;
  place-items: center;
  font: 11px Plex,monospace;
  width: 30px;
  height: 28px;
}

.edition-nav a:hover {
  background: #e6e0d7;
}

.edition-nav a[aria-current] {
  background: #272722;
  color: #f3f2ec;
}

.edition-nav .edition-label {
  width: auto;
  padding-right: 6px;
  font: 9px Plex,monospace;
  margin-right: 12px;
  color: #827f74;
}

 {
  background: #f5f3ec;
  color: #282b27;
  padding: 0 6.25%;
}

 {
  max-width: 1400px;
  margin: auto;
}

 {
  height: 129px;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  font-size: 14px;
}

 {
  font-weight: 600;
}

 {
  font-size: 12px;
  line-height: 1.5;
  color: #777b70;
}

 {
  font-size: 12px;
}

 {
  padding-top: 30px;
}

 {
  position: relative;
  display: grid;
  grid-template-columns: 15% 1fr;
  align-items: start;
}

 {
  padding-top: 25px;
  color: #858577;
}

 {
  font: 400 clamp(100px,13.75vw,208px)/.79 Instrument,Georgia,serif;
  letter-spacing: -.055em;
  margin: 0;
  position: relative;
  z-index: 1;
}

 {
  font-weight: 400;
}

 {
  position: absolute;
  right: 7%;
  top: 45px;
  width: 142px;
  height: 194px;
  background: #cc492a;
  color: #f5f3ec;
  transform: rotate(5deg);
  padding: 15px 17px;
  box-shadow: 1px 3px 0 #00000008;
  transition: transform .6s cubic-bezier(.2,.8,.2,1);
}

 {
  transform: rotate(0) translateY(-5px);
}

 {
  font-size: 9px;
}

 {
  font: 400 118px/.95 Instrument,serif;
  letter-spacing: -.09em;
  display: block;
  margin-top: 4px;
}

 {
  position: absolute;
  bottom: 11px;
  right: 14px;
  font-size: 22px;
}

 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 50px;
  margin-top: 55px;
  margin-left: 15%;
}

 {
  display: flex;
  gap: 18px;
  align-items: center;
  align-self: center;
  color: #8b8d80;
}

 {
  font: 400 75px Instrument,serif;
  color: #c5c5b5;
}

 {
  font: italic 20px/1.22 Instrument,serif;
  margin: 0;
}

 {
  max-width: 430px;
  padding-right: 10px;
}

 {
  font-size: 17px;
  line-height: 1.55;
  letter-spacing: -.02em;
  margin: 0 0 17px;
}

 {
  color: #747b6c;
}

 {
  font-size: 14px;
  margin-top: 26px;
}

 {
  color: #353c30;
}

 {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #bcbdb0;
  padding: 3px 0 8px;
  margin-top: 25px;
  font-size: 13px;
  color: #ae4329;
}

 {
  border-top: 1px solid #bfc2b1;
  border-bottom: 1px solid #d9dbcf;
  display: flex;
  align-items: center;
  gap: 44px;
  margin-top: 62px;
  padding: 22px 0;
}

 {
  color: #858877;
  margin-right: auto;
}

 {
  font: 400 33px Instrument,serif;
  letter-spacing: -.02em;
  white-space: nowrap;
  transition: color .2s;
}

 {
  color: #bc4228;
}

 {
  font: 8px Plex,monospace;
  color: #a39f8f;
  margin-left: 7px;
  vertical-align: top;
  position: relative;
  top: 7px;
}

 {
  font-size: 9px;
  margin-left: auto;
  color: #777a6a;
}

 {
  padding: 22px 0 85px;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #7c8173;
  gap: 20px;
}

 {
  display: flex;
  gap: 26px;
}

 {
  font-size: 9px;
}

@media (min-width:1700px) {
   {
    padding-top: 6vh;
  }
   {
    margin-top: 70px;
  }
   {
    margin-top: 80px;
  }
}

@media (max-width:800px) {
   {
    padding: 0 7%;
  }
   {
    height: 100px;
    grid-template-columns: 1fr auto;
  }
   {
    display: none;
  }
   {
    padding-top: 22px;
  }
   {
    grid-template-columns: 1fr;
  }
   {
    padding: 0 0 25px;
    font-size: 9px;
  }
   {
    display: none;
  }
   {
    font-size: clamp(90px,19vw,140px);
    line-height: .85;
  }
   {
    right: 1%;
    top: -5px;
    width: 64px;
    height: 91px;
    padding: 8px;
    transform: rotate(5deg);
  }
   {
    font-size: 51px;
  }
   {
    font-size: 7px;
  }
   {
    font-size: 14px;
    bottom: 6px;
    right: 8px;
  }
   {
    margin: 40px 0 0 18%;
    grid-template-columns: 1fr;
    gap: 25px;
  }
   {
    display: none;
  }
   {
    font-size: 16px;
  }
   {
    max-width: none;
    padding: 0;
  }
   {
    flex-wrap: wrap;
    gap: 18px 25px;
    margin-top: 43px;
    padding: 20px 0;
  }
   {
    width: 100%;
    font-size: 9px;
  }
   {
    display: none;
  }
   {
    font-size: 30px;
  }
   {
    margin-left: 0;
  }
   {
    flex-wrap: wrap;
    font-size: 10px;
    gap: 20px;
  }
   {
    display: none;
  }
   {
    gap: 20px;
  }
  .edition-nav {
    right: 15px;
    bottom: 14px;
  }
}

 {
  background: #191b18;
  color: #e7e7db;
}

 {
  padding: 35px 5%;
  height: 104px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font: 10px/1.5 Plex,monospace;
  letter-spacing: .03em;
}

 {
  font-size: 9px;
  color: #8b9481;
}

 {
  color: #b8c19e;
}

 {
  position: relative;
  max-width: 1600px;
  margin: auto;
  min-height: 840px;
  height: calc(100svh - 104px);
  max-height: 1100px;
  isolation: isolate;
}

 {
  position: absolute;
  left: 32%;
  right: 5%;
  top: 44px;
  bottom: 58px;
  margin: 0;
  background: #6e7156;
}

 {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 49% 54%;
  filter: saturate(.72);
  transition: filter .6s;
}

 {
  filter: saturate(1);
}

 {
  display: flex;
  justify-content: space-between;
  position: absolute;
  top: calc(100% + 15px);
  left: 0;
  right: 0;
  color: #888d7d;
  font-size: 8px;
  gap: 15px;
}

 {
  position: absolute;
  z-index: 2;
  left: 10%;
  top: 21px;
  font: 400 clamp(155px,18vw,282px)/.73 Instrument,Georgia,serif;
  letter-spacing: -.05em;
  margin: 0;
  pointer-events: none;
  color: #ebece0;
  text-shadow: 0 2px 25px #1319140a;
}

 {
  font-weight: 400;
  display: block;
  margin-left: 13vw;
}

 {
  position: absolute;
  top: 68px;
  left: 5%;
  height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #8e9781;
}

 {
  font-size: 8px;
}

 {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

 {
  position: absolute;
  left: 10%;
  top: 56%;
  z-index: 3;
  width: 195px;
}

 {
  font-size: 29px;
  color: #b9c995;
}

 {
  font: 400 29px/1.25 Instrument,serif;
  margin: 17px 0 28px;
  color: #dce0ce;
}

 {
  font-size: 8px;
  color: #98a18b;
  border-bottom: 1px solid #737e66;
  padding-bottom: 8px;
}

 {
  position: absolute;
  z-index: 3;
  bottom: 92px;
  right: 7.7%;
  display: flex;
  gap: 45px;
  align-items: center;
  padding: 13px 16px;
  background: #e9eadbe8;
  color: #283025;
  font-size: 12px;
  backdrop-filter: blur(10px);
}

 {
  background: #fff;
}

 {
  max-width: 1400px;
  margin: 25px auto 0;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 12%;
  padding: 75px 10% 95px;
}

 {
  font-size: 8px;
  color: #94a17f;
}

 {
  font: 400 65px/1.01 Instrument,serif;
  letter-spacing: -.025em;
  margin: 25px 0 0;
}

 {
  color: #b1c398;
}

 {
  padding-top: 32px;
}

 {
  font-size: 16px;
  line-height: 1.65;
  color: #909a85;
  margin: 0 0 23px;
}

 {
  font-size: 22px;
  line-height: 1.45;
  letter-spacing: -.025em;
  color: #dce0ce;
}

 {
  text-decoration: underline;
  text-underline-offset: 4px;
  color: #bec7b1;
}

 {
  display: inline-block;
  border-bottom: 1px solid #657357;
  padding: 8px 0;
  font-size: 13px;
  color: #c6d3b6;
}

 {
  border-top: 1px solid #3d4435;
  margin: 0 5%;
  padding: 24px 0 90px;
  display: flex;
  gap: 26px;
  font-size: 10px;
  color: #949c89;
}

 {
  margin-left: auto;
  font-size: 9px;
}

.edition-four .edition-nav {
  background: #2b2b28e8;
  border-color: #53534d;
  color: #e4e5d9;
}

.edition-four .edition-nav a[aria-current] {
  background: #e4e5d9;
  color: #282a23;
}

.edition-four .edition-nav a:hover {
  background: #686c5d;
}

/* III — images as punctuation, not as a project grid. */

.edition-three {
  background: #fff6ea;
  color: #2b2118;
  padding: 0 calc(7% + env(safe-area-inset-right)) env(safe-area-inset-bottom) calc(7% + env(safe-area-inset-left));
  --clay: #d64a22;
  --muted: #9c8a74;
}

.three-main {
  max-width: 1110px;
  margin: 112px auto 0;
}

.three-title {
  font: 400 clamp(22px,2.1vw,28px)/1.2 Tight,Arial,sans-serif;
  letter-spacing: -.02em;
  color: #6f6152;
  margin: 0 0 22px;
}

.three-letter {
  margin-left: 0;
  padding-bottom: 4px;
}

.letter-line {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 115px;
  white-space: nowrap;
  font-size: clamp(48px,6.6vw,99px);
  font-weight: 400;
  line-height: 1.06;
  letter-spacing: -.016em;
}

.letter-line em {
  font-style: normal;
  font-weight: 600;
  letter-spacing: -.024em;
}

.inline-object {
  position: relative;
  text-decoration: none;
  border: 0;
  background: none;
  display: inline-block;
  flex-shrink: 0;
  width: 110px;
  height: 100px;
  padding: 0;
  margin: 0 5px;
  z-index: 2;
  transform: translate(0,0) scale(1);
  transition: transform .55s cubic-bezier(.16,1,.3,1);
}

.inline-object img {
  position: absolute;
  border: 4px solid #fffdf8;
  box-shadow: 2px 4px 6px #4a301c1f;
  object-fit: cover;
  transition: transform .65s cubic-bezier(.15,.9,.2,1.3),box-shadow .4s;
  width: 71px;
  height: 99px;
  top: 0;
  left: 0;
  border-radius: 2px;
}

.inline-object .inline-front {
  z-index: 2;
  transform: rotate(-10deg);
  object-position: 50% 47%;
}

.inline-object .inline-back {
  left: 36px;
  top: 0;
  transform: rotate(9deg);
  object-position: center 34%;
}

@media (hover: hover) {
  .inline-object:hover .inline-front,.inline-object:focus-visible .inline-front {
    transform: translate(-18px,-14px) rotate(-12deg) scale(1.22);
    box-shadow: 3px 12px 16px #4a301c2e;
  }
  .inline-object:hover .inline-back,.inline-object:focus-visible .inline-back {
    transform: translate(16px,-8px) rotate(12deg) scale(1.22);
    box-shadow: 3px 12px 16px #4a301c2e;
  }
  .inline-object:hover .object-index,.inline-object:focus-visible .object-index {
    opacity: 1;
    color: var(--clay);
  }
}

/* Touch: a tap lifts the object to the middle of the screen at ~3x with its address
   showing, over a scrim. Tapping it again follows the link; anywhere else closes.
   JS sets --ox/--oy/--ok per object, measured from where it actually sits. */

.obj-scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: #2b2118;
  opacity: 0;
  pointer-events: none;
  transition: opacity .4s ease;
}

.obj-scrim.on {
  opacity: .52;
  pointer-events: auto;
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}

@media (prefers-reduced-motion: reduce) {
  .inline-object,
  .inline-object img,
  .obj-scrim {
    transition-duration: .01ms;
  }
}

.inline-object.is-open {
  z-index: 60;
  transform: translate(var(--ox,0px),var(--oy,0px)) scale(var(--ok,3));
}

.inline-object.is-open img {
  box-shadow: 1px 4px 7px #4a301c3d;
}

/* .is-measuring is .is-open's photo positions without the parent's scale, so the script
   can read where the address should hang before the swoosh starts. */
.inline-object.is-measuring img {
  transition: none;
}

.inline-object.is-open .inline-front,
.inline-object.is-measuring .inline-front {
  transform: translate(-13%,-7%) rotate(-11deg);
}

.inline-object.is-open .inline-back,
.inline-object.is-measuring .inline-back {
  transform: translate(11%,-4%) rotate(11deg);
}

/* The address rides on a scaled parent, so divide by the scale to keep it a
   constant 13px sitting 16px under the photo, instead of tripling into the line below. */
.inline-object.is-open .object-index {
  opacity: 1;
  transition: opacity .3s ease .22s;
  color: #ff7a4d;
  font-size: calc(13px / var(--ok,3));
  letter-spacing: calc(.4px / var(--ok,3));
  top: calc(var(--otag,0px) + 15px / var(--ok,3));
  bottom: auto;
}

.inline-jam {
  width: 139px;
  height: 79px;
}

.inline-jam img {
  width: 102px;
  height: 74px;
  border-color: #fffdf8;
}

.inline-jam .inline-front {
  object-position: center 51%;
  transform: rotate(6deg);
  left: 0;
  top: 7px;
}

.inline-jam .inline-back {
  object-position: center 22%;
  transform: rotate(-8deg);
  left: 39px;
  top: -5px;
}

.inline-mac {
  width: 98px;
  height: 142px;
  margin-left: 18px;
}

.inline-mac img {
  width: 84px;
  height: 115px;
  object-position: center;
  border: 7px solid #fffdf8;
  border-bottom-width: 20px;
  border-radius: 1px;
  transform: rotate(-5deg);
  transition: transform .5s,box-shadow .4s;
}

.inline-mac:hover img,.inline-mac:focus-visible img {
  transform: rotate(-1deg) translateY(-10px) scale(1.16);
  box-shadow: 3px 12px 16px #4a301c2e;
}

.inline-mac .object-index {
  bottom: -6px;
}

.object-index {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: -15px;
  white-space: nowrap;
  font-size: 8px;
  color: var(--muted);
  letter-spacing: .04em;
  opacity: 0;
  transition: opacity .3s;
}

.inline-jam .object-index {
  bottom: -12px;
}

.last-letter {
  padding-left: 1px;
  min-height: 96px;
}

.three-bottom {
  padding: 34px 0 46px;
}

.three-bio {
  max-width: 52ch;
}

.three-bio p {
  font-size: 17px;
  line-height: 1.55;
  letter-spacing: -.01em;
  margin: 0 0 15px;
  color: #6f6152;
}

.three-bio a {
  color: var(--clay);
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1.5px solid #f4633a55;
  transition: border-color .2s;
}

.three-bio a:hover {
  border-color: var(--clay);
}

/* decremental.com's contact block: the bio on the left, a quiet message form beside it.
   Fields are ruled lines rather than boxes, so they read as part of the page. */

.three-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.talk-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--clay);
  font-weight: 600;
  border-bottom: 1.5px solid #f4633a55;
  transition: border-color .2s;
}

.talk-link:hover {
  border-bottom-color: var(--clay);
}

.note-dialog {
  width: min(440px,calc(100vw - 40px));
  padding: 30px 30px 28px;
  border: 0;
  border-radius: 16px;
  background: #fffdf8;
  color: #2b2118;
  box-shadow: 0 24px 60px #4a301c33;
  overflow: visible;
}

.note-dialog::backdrop {
  background: #2b211859;
}

.note-close {
  position: absolute;
  top: 10px;
  right: 14px;
  padding: 4px 8px;
  font-size: 22px;
  line-height: 1;
  color: #b6a48d;
  background: none;
  border: 0;
  transition: color .2s;
}

.note-close:hover {
  color: var(--clay);
}

.form-label {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #2b2118;
}

.form-field {
  width: 100%;
  padding: 6px 0;
  font: 400 16px/1.4 Tight,Arial,sans-serif;
  color: #2b2118;
  background: none;
  border: 0;
  border-bottom: 1.5px solid #e2d3bf;
  border-radius: 0;
  outline: none;
  transition: border-color .2s;
  -webkit-appearance: none;
}

textarea.form-field {
  resize: none;
  overflow: hidden;
  min-height: 46px;
}

.form-field::placeholder {
  color: #b6a48d;
}

.form-field:focus {
  border-bottom-color: var(--clay);
}

.form-trap {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.form-foot {
  display: flex;
  align-items: center;
  gap: 14px;
}

.form-hint {
  font-size: 13px;
  color: #a5937c;
}

.form-send {
  display: inline-block;
  text-decoration: none;
  padding: 8px 20px;
  font-size: 15px;
  font-weight: 600;
  color: #fff6ea;
  background: var(--clay);
  border: 0;
  border-radius: 999px;
  transition: opacity .2s,transform .2s;
}

.form-send:hover:not(:disabled) {
  transform: translateY(-1px);
}

.form-send:disabled {
  opacity: .5;
  cursor: default;
}

.three-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 30px;
  max-width: 1110px;
  margin: auto;
  padding: 0 0 84px;
  font-size: 13px;
  letter-spacing: -.005em;
  color: #857563;
}

.foot-sep {
  display: none;
}

.three-footer a {
  padding-bottom: 2px;
  border-bottom: 1.5px solid transparent;
  transition: color .2s,border-color .2s;
}

.three-footer a:hover {
  color: var(--clay);
  border-color: #f4633a55;
}

@media (max-width:1100px) {
   {
    min-height: 760px;
  }
   {
    font-size: 19vw;
  }
   {
    left: 29%;
    right: 5%;
  }
   {
    left: 7%;
    width: 180px;
  }
   {
    padding-left: 7%;
    padding-right: 7%;
    gap: 10%;
  }
   {
    font-size: 54px;
  }
  .letter-line {
    gap: 15px;
    min-height: 105px;
  }
  .three-letter {
    margin-left: 4%;
  }
  .three-bio {
    max-width: none;
  }
}

@media (max-width:700px) {
   {
    height: 90px;
    padding: 25px 7%;
    font-size: 9px;
  }
   {
    display: none;
  }
   {
    min-height: 820px;
    height: auto;
  }
   {
    left: 18%;
    right: 7%;
    top: 126px;
    bottom: 126px;
  }
   {
    object-position: 51% 62%;
  }
   {
    font-size: clamp(104px,28vw,180px);
    left: 7%;
    top: 13px;
    line-height: .78;
  }
   {
    margin-left: 17vw;
  }
   {
    display: none;
  }
   {
    top: auto;
    bottom: 10px;
    left: 7%;
    width: auto;
    display: flex;
    align-items: center;
    gap: 15px;
  }
   {
    font-size: 25px;
  }
   {
    font-size: 24px;
    line-height: 1.18;
    margin: 0;
  }
   {
    display: none;
  }
   {
    margin-left: 18px;
    max-width: 95px;
    line-height: 1.6;
    font-size: 8px;
  }
   {
    bottom: 143px;
    right: 11%;
    font-size: 10px;
    padding: 11px 12px;
    gap: 20px;
  }
   {
    font-size: 6px;
    top: calc(100% + 12px);
  }
   {
    grid-template-columns: 1fr;
    gap: 18px;
    margin-top: 35px;
    padding: 50px 8% 60px;
  }
   {
    font-size: 58px;
  }
   {
    padding-top: 10px;
  }
   {
    font-size: 16px;
  }
   {
    flex-wrap: wrap;
    gap: 18px 22px;
    margin: 0 8%;
    padding-bottom: 100px;
  }
   {
    display: none;
  }
  .edition-three {
    padding: 0 6%;
  }
  .edition-three {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
  }
  /* Both variants centre and are sized to nearly fill the screen, so any leftover space
     falls as an even margin top and bottom instead of a hole under the headline. */
  .edition-three {
    justify-content: center;
  }
  .three-main {
    margin: 0;
    width: 100%;
  }
  .three-title {
    font-size: 21px;
    margin-bottom: 12px;
  }
  .three-letter {
    margin: 0;
    padding-bottom: 8px;
  }
  .letter-line {
    font-size: clamp(28px,8.9vw,60px);
    gap: 9px;
    min-height: 71px;
  }
  .last-letter {
    min-height: 67px;
  }
  .letter-line em {
    font-size: 1.17em;
  }
  .inline-object {
    width: 71px;
    height: 67px;
    margin: 0 1px;
  }
  .inline-object img {
    width: 45px;
    height: 64px;
    border-width: 3px;
  }
  .inline-object .inline-back {
    left: 23px;
  }
  .inline-jam {
    width: 83px;
    height: 58px;
  }
  .inline-jam img {
    width: 61px;
    height: 48px;
  }
  .inline-jam .inline-back {
    left: 25px;
    top: 2px;
  }
  .inline-jam .inline-front {
    top: 7px;
  }
  .inline-mac {
    width: 62px;
    height: 88px;
    margin-left: 8px;
  }
  .inline-mac img {
    width: 51px;
    height: 70px;
    border-width: 4px;
    border-bottom-width: 13px;
  }
  .object-index {
    font-size: 7px;
    bottom: -13px;
  }
  .three-bottom {
    padding: 24px 0 26px;
  }
  .three-form {
    max-width: none;
    gap: 8px;
  }
  .form-label {
    font-size: 16px;
  }
  .form-field {
    font-size: 16px;
    padding: 5px 0;
  }
  textarea.form-field {
    min-height: 36px;
  }
  .form-send {
    padding: 7px 18px;
    font-size: 14px;
  }
  .three-bio p {
    font-size: 16px;
    line-height: 1.48;
    margin: 0 0 12px;
  }
  .three-bio p:last-child {
    margin-bottom: 0;
  }
  .three-footer {
    display: block;
    margin: 0;
    width: 100%;
    padding-bottom: 22px;
    font-size: 14px;
    line-height: 1.9;
  }
  .foot-sep {
    display: inline;
    /* No space before the rule, one after, so a wrapped line never starts with it. */
    margin-left: 9px;
    color: #c4b39c;
  }
}

/* The 1600x900 share poster (/hi/card): the same sentence, photos about a third larger
   relative to the type, no bio or footer. Fixed pixel sizes on purpose — it is a canvas,
   not a page, and it is only ever rendered at that one size. */

.edition-card {
  width: 1600px;
  height: 900px;
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.edition-card .three-main {
  margin: 0;
  /* Optical centring, not box centring: the tilted photos bleed ~10px past the text
     column on the left, and the block ends higher than its box does. */
  padding: 50px 86px 0 106px;
  max-width: none;
  width: 100%;
}

.edition-card .three-title,
.edition-card .three-footer {
  display: none;
}

.edition-card .three-letter {
  margin: 0;
  padding: 0;
}

.edition-card .letter-line {
  font-size: 90px;
  min-height: 176px;
  gap: 30px;
}

.edition-card .last-letter {
  min-height: 296px;
  padding-left: 0;
  gap: 8px;
}

.edition-card .inline-object {
  width: 182px;
  height: 165px;
  margin: 0 8px;
}

.edition-card .inline-object img {
  width: 118px;
  height: 165px;
  border-width: 6px;
}

.edition-card .inline-object .inline-back {
  left: 60px;
}

.edition-card .inline-jam {
  width: 232px;
  height: 132px;
}

.edition-card .inline-jam img {
  width: 170px;
  height: 123px;
}

.edition-card .inline-jam .inline-back {
  left: 65px;
  top: -8px;
}

.edition-card .inline-jam .inline-front {
  top: 11px;
}

.edition-card .inline-mac {
  width: 206px;
  height: 296px;
  margin: 0 -26px 0 0;
}

.edition-card .inline-mac img {
  width: 176px;
  height: 242px;
  border: 13px solid #fffdf8;
  border-bottom-width: 41px;
}


/* Short phones (SE, or any phone with the browser bars taking a big bite): the same
   layout, stepped down ~15% so the footer still lands inside the first screen. */

@media (max-width:700px) and (max-height:700px) {
  .three-main {
    margin-top: 14px;
  }
  .three-title {
    font-size: 18px;
    margin-bottom: 8px;
  }
  .three-letter {
    padding-bottom: 4px;
  }
  .letter-line {
    font-size: min(26px,7.2vw);
    min-height: 50px;
  }
  .last-letter {
    min-height: 46px;
  }
  .inline-object {
    width: 53px;
    height: 49px;
  }
  .inline-object img {
    width: 33px;
    height: 47px;
  }
  .inline-object .inline-back {
    left: 17px;
  }
  .inline-jam {
    width: 61px;
    height: 43px;
  }
  .inline-jam img {
    width: 45px;
    height: 36px;
  }
  .inline-jam .inline-back {
    left: 19px;
  }
  .inline-mac {
    width: 46px;
    height: 65px;
  }
  .inline-mac img {
    width: 37px;
    height: 51px;
    border-bottom-width: 10px;
  }
  .three-bottom {
    padding: 8px 0 18px;
  }
  .three-bio p {
    font-size: 14px;
    margin-bottom: 9px;
  }
  .three-footer {
    gap: 9px 26px;
    padding-bottom: 14px;
  }
  /* The wider phone tier's .site-decremental rules outrank the bare selectors above
     on specificity, so restate them here or decremental ends up taller than bartin16. */
  .three-form {
    gap: 6px;
  }
  .form-label {
    font-size: 15px;
  }
  textarea.form-field {
    min-height: 32px;
  }
}

/* IV — a dark studio, a chrome room number, and working objects. */

.edition-four {
  background: #231e25;
  color: #f0eae1;
}

.four-stage {
  position: relative;
  max-width: 1800px;
  margin: auto;
  height: 1080px;
  min-height: 95svh;
  isolation: isolate;
  overflow: hidden;
}

.four-sculpture {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 42%;
  z-index: -2;
  transform: scale(1.025) translate(calc(var(--mouse-x,0px) * -.4),calc(var(--mouse-y,0px) * -.4));
  transition: transform 1.5s ease-out;
}

.four-stage::after {
  content: '';
  position: absolute;
  inset: 65% 0 0;
  background: linear-gradient(transparent,#231e25);
  z-index: -1;
  pointer-events: none;
}

.four-header {
  height: 120px;
  padding: 0 6%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.four-brand {
  font-size: 29px;
  letter-spacing: -.07em;
  font-weight: 600;
}

.four-brand>span:not(.brand-period) {
  font: italic 27px Instrument,serif;
  color: #baaa99;
  margin: 0 3px;
}

.brand-period {
  color: #dc6f41;
}

.four-header>.mono {
  font-size: 8px;
  line-height: 1.7;
  color: #a09698;
  margin-left: 13%;
}

.four-header>a:last-child {
  font-size: 12px;
}

.four-intro {
  position: absolute;
  top: 177px;
  left: 8%;
  z-index: 1;
}

.four-intro>.mono {
  font-size: 8px;
  color: #b29f96;
  letter-spacing: .08em;
}

.four-intro h1 {
  font: 400 clamp(75px,8.6vw,134px)/.91 Tight,sans-serif;
  letter-spacing: -.07em;
  margin: 28px 0 30px;
}

.four-intro h1 em {
  font: italic 400 1.3em/.7 Instrument,serif;
  letter-spacing: -.035em;
}

.four-intro p {
  font-size: 15px;
  line-height: 1.65;
  color: #b3a4a4;
  letter-spacing: -.01em;
}

.four-studio-caption {
  position: absolute;
  right: 6%;
  top: 160px;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-size: 7px;
  color: #b6a49b;
}

.four-studio-caption>span:last-child {
  color: #dbcdc0;
}

.four-objects {
  position: absolute;
  inset: 0;
  pointer-events: none;
  perspective: 1500px;
}

.studio-object {
  position: absolute;
  pointer-events: auto;
  border: 0;
  background: none;
  padding: 0;
  transform: translate(var(--drag-x,0px),var(--drag-y,0px)) rotate(var(--angle,0deg));
  transition: transform .7s cubic-bezier(.22,1,.22,1),filter .5s;
  will-change: transform;
  touch-action: pan-y;
  cursor: grab;
}

.studio-object:active {
  cursor: grabbing;
}

.studio-object:hover,.studio-object:focus-visible {
  transform: translate(var(--drag-x,0px),calc(var(--drag-y,0px) - 14px)) rotate(0deg) scale(1.025);
  z-index: 12 !important;
}

.studio-object.is-dragging {
  transition: none;
  z-index: 20 !important;
  transform: translate(var(--drag-x,0px),var(--drag-y,0px)) rotate(0deg) scale(1.035);
}

.studio-label {
  display: flex;
  justify-content: space-between;
  text-align: left;
  font-size: 14px;
  padding: 14px 3px 0;
  color: #e4d9cb;
}

.studio-label small {
  display: block;
  font: 7px Plex,monospace;
  letter-spacing: .1em;
  margin-bottom: 6px;
  color: #a98f85;
}

.studio-label>span:last-child {
  padding-top: 11px;
  font-size: 19px;
  color: #baa497;
}

.studio-mac {
  width: 224px;
  left: 25%;
  top: 650px;
  --angle: -13deg;
  z-index: 2;
}

.studio-print {
  position: relative;
  display: block;
  padding: 9px 9px 31px;
  background: #e8ded0;
  box-shadow: 2px 3px 0 #ac9d91,1px 9px 3px #0003,12px 27px 23px #0005;
}

.studio-print>img {
  width: 100%;
  height: 175px;
  object-fit: cover;
  object-position: 50% 61%;
  filter: saturate(.65);
  transition: filter .5s;
}

.studio-mac:hover img {
  filter: saturate(1);
}

.mac-greeting {
  position: absolute;
  bottom: 9px;
  left: 12px;
  right: 12px;
  color: #5d5144;
  font: italic 14px Instrument,serif;
  letter-spacing: .03em;
  opacity: 0;
  transform: translateY(5px);
  transition: opacity .4s,transform .4s;
}

.studio-mac:hover .mac-greeting,.studio-mac:focus-visible .mac-greeting {
  opacity: 1;
  transform: none;
}

.mac-greeting>span {
  animation: cursor-blink 1.1s steps(2) infinite;
}

.studio-dodo {
  width: 159px;
  right: 16%;
  top: 510px;
  --angle: 12deg;
  z-index: 4;
}

.studio-screen {
  display: block;
  height: 286px;
  padding: 5px;
  background: linear-gradient(135deg,#5f6260,#1e292b 30%,#101d21 65%,#858a78);
  border-radius: 16px;
  box-shadow: 1px 3px 0 #0f1518,4px 10px 2px #0002,14px 30px 25px #0005;
  overflow: hidden;
}

.studio-screen>img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 45%;
  border-radius: 11px;
}

.screen-front {
  position: relative;
  z-index: 2;
  transition: transform .7s cubic-bezier(.2,1,.2,1);
}

.screen-back {
  position: absolute;
  inset: 0;
  transform: translate(-9px,-7px) rotate(-5deg);
  transition: transform .7s cubic-bezier(.2,1,.2,1);
}

.screen-back>img {
  object-position: 50% 30%;
}

.studio-dodo:hover .screen-back,.studio-dodo:focus-visible .screen-back {
  transform: translate(-108px,-24px) rotate(-14deg);
}

.studio-dodo:hover .screen-front,.studio-dodo:focus-visible .screen-front {
  transform: translate(18px,0) rotate(5deg);
}

.studio-jam {
  width: 294px;
  left: 46%;
  top: 734px;
  --angle: 6deg;
  z-index: 6;
}

.studio-synth {
  display: block;
  background: #252929;
  border: 1px solid #545957;
  border-radius: 8px;
  padding: 9px;
  box-shadow: 0 3px 0 #141717,1px 7px 0 #101414,9px 26px 24px #0006;
  overflow: hidden;
}

.synth-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1px 2px 8px;
  color: #c9cabe;
  font: 8px Plex,monospace;
  letter-spacing: .04em;
}

.synth-status-right {
  color: #ec9063;
  font-size: 7px;
}

.synth-image {
  display: block;
  height: 129px;
  position: relative;
  overflow: hidden;
  border-radius: 3px;
  background: #191c1f;
}

.synth-image>img {
  position: absolute;
  width: 100%;
  max-width: none;
  top: -100px;
  left: 0;
}

.synth-image>.synth-hover {
  top: -176px;
  opacity: 0;
  transition: opacity .4s;
}

.studio-jam:hover .synth-hover,.studio-jam:focus-visible .synth-hover {
  opacity: 1;
}

.synth-meter {
  display: flex;
  height: 23px;
  align-items: center;
  gap: 3px;
  padding: 7px 1px 0;
}

.synth-meter>i {
  height: 3px;
  width: 3px;
  background: #b0e1bb;
}

.synth-meter>span {
  font: 7px Plex,monospace;
  color: #859184;
  margin-left: auto;
  letter-spacing: .06em;
}

.studio-jam:hover .synth-meter>i,.studio-jam:focus-visible .synth-meter>i {
  animation: meter .55s ease-in-out infinite alternate;
}

.synth-meter>i:nth-child(3n) {
  animation-delay: -.35s !important;
}

.synth-meter>i:nth-child(2n) {
  animation-delay: -.15s !important;
}

.synth-meter>i:nth-child(5n) {
  animation-delay: -.45s !important;
}

.four-floor {
  position: absolute;
  bottom: 24px;
  left: 6%;
  right: 6%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-top: 1px solid #ffffff18;
  padding-top: 18px;
  color: #aa9291;
}

.four-floor>.mono {
  font-size: 7px;
}

.desk-reset {
  border: 0;
  background: none;
  padding: 4px;
  font-size: 7px;
  color: #bfa59b;
}

.desk-reset:hover {
  color: #fff;
}

.touch-instructions {
  display: none;
}

.four-about {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 10%;
  padding: 72px 8% 62px;
  max-width: 1600px;
  margin: auto;
}

.four-about .mono {
  font-size: 8px;
  color: #a68d83;
}

.four-about h2 {
  font: 400 clamp(37px,4vw,58px)/1.08 Instrument,serif;
  letter-spacing: -.02em;
  margin: 23px 0 0;
}

.four-about h2 em {
  color: #ab9288;
}

.four-bio {
  padding-top: 20px;
}

.four-bio p {
  font-size: 15px;
  line-height: 1.65;
  color: #ae9996;
  max-width: 355px;
  margin: 0 0 20px;
}

.four-bio>a {
  display: inline-block;
  font-size: 13px;
  padding-bottom: 8px;
  border-bottom: 1px solid #7c6056;
  color: #e0bfa9;
}

.four-footer {
  margin: 0 6%;
  border-top: 1px solid #ffffff18;
  display: flex;
  gap: 27px;
  align-items: center;
  padding: 24px 0 90px;
  font-size: 10px;
  color: #b99e95;
}

.four-footer>.mono {
  margin-left: auto;
  font-size: 8px;
}

/* A closer look at the supplied images, plus a small playable rhythm sketch. */

.project-dialog {
  border: 1px solid #bbb6ac;
  border-radius: 4px;
  background: #f1efe8;
  color: #30372d;
  padding: 43px;
  width: min(850px,calc(100vw - 35px));
  max-height: calc(100svh - 50px);
  overflow: auto;
}

.project-dialog::backdrop {
  background: #141411b3;
  backdrop-filter: blur(14px);
}

.project-dialog[open] {
  animation: dialog-in .35s ease-out;
}

.dialog-close {
  position: absolute;
  right: 15px;
  top: 12px;
  background: none;
  border: 0;
  width: 36px;
  height: 36px;
  font-size: 26px;
}

.dialog-copy>.mono {
  font-size: 9px;
  color: #8c8b7e;
}

.dialog-copy h2 {
  font: 400 53px/.98 Instrument,serif;
  letter-spacing: -.02em;
  margin: 20px 0 16px;
}

.dialog-copy p {
  max-width: 590px;
  font-size: 16px;
  line-height: 1.6;
  color: #78816d;
}

.dialog-copy>a {
  display: inline-block;
  font-size: 13px;
  margin: 0 0 24px;
  padding-bottom: 6px;
  border-bottom: 1px solid #aab09b;
}

.dialog-images {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 18px;
}

.dialog-images img {
  width: calc(50% - 9px);
  max-width: 250px;
  border-radius: 6px;
}

.dialog-images img:only-child {
  width: 100%;
  max-width: 530px;
}

.dialog-instrument {
  padding: 24px 0 0;
  margin-top: 25px;
  border-top: 1px solid #c5c7b8;
}

.dialog-instrument[hidden] {
  display: none;
}

.beat-toggle {
  padding: 10px 14px;
  background: #323f31;
  color: #fff;
  border: 0;
  font-size: 12px;
}

.dialog-instrument>.mono {
  font-size: 8px;
  margin-left: 15px;
  color: #7e8974;
}

.beat-steps {
  display: grid;
  grid-template-columns: repeat(16,1fr);
  gap: 5px;
  margin-top: 16px;
}

.beat-steps button {
  height: 29px;
  border: 1px solid #bdc2b4;
  background: #d6d9ce;
  border-radius: 2px;
  font: 8px Plex,monospace;
}

.beat-steps button[aria-pressed=true] {
  background: #c8663e;
  border-color: #c8663e;
  color: #fff;
}

.beat-steps button.is-playing {
  outline: 2px solid #334b36;
  outline-offset: 2px;
}

@keyframes meter {
  to {
    transform: scaleY(4);
  }
}

@keyframes cursor-blink {
  to {
    opacity: 0;
  }
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (min-width:1650px) {
  .four-stage {
    height: 1220px;
  }
  .four-intro {
    top: 215px;
  }
  .studio-dodo {
    top: 580px;
    width: 182px;
  }
  .studio-screen {
    height: 329px;
  }
  .studio-mac {
    top: 730px;
    width: 250px;
  }
  .studio-print>img {
    height: 198px;
  }
  .studio-jam {
    top: 828px;
    width: 330px;
  }
  .synth-image {
    height: 147px;
  }
  .synth-image>img {
    top: -113px;
  }
  .synth-image>.synth-hover {
    top: -201px;
  }
}

@media (max-width:1050px) {
  .four-stage {
    height: 1100px;
  }
  .four-sculpture {
    object-position: 52% 50%;
  }
  .four-intro {
    top: 165px;
    left: 7%;
  }
  .four-intro h1 {
    font-size: 90px;
  }
  .four-studio-caption {
    display: none;
  }
  .studio-mac {
    left: 11%;
    top: 650px;
    width: 200px;
  }
  .studio-print>img {
    height: 154px;
  }
  .studio-dodo {
    right: 16%;
    top: 522px;
    width: 147px;
  }
  .studio-screen {
    height: 264px;
  }
  .studio-jam {
    left: 43%;
    top: 768px;
    width: 280px;
  }
  .synth-image>img {
    top: -95px;
  }
  .synth-image>.synth-hover {
    top: -167px;
  }
  .four-floor>.mono:last-child {
    display: none;
  }
  .four-about {
    gap: 8%;
    padding-left: 7%;
    padding-right: 7%;
  }
}

@media (max-width:700px) {
  .four-stage {
    height: 1170px;
  }
  .four-sculpture {
    height: 690px;
    object-fit: cover;
    object-position: 58% 50%;
    top: 40px;
    opacity: .73;
  }
  .four-stage::after {
    inset: 440px 0 0;
    background: linear-gradient(transparent,#231e25 250px);
  }
  .four-header {
    height: 98px;
    padding: 0 7%;
  }
  .four-header>.mono {
    display: none;
  }
  .four-header>a:last-child {
    font-size: 11px;
  }
  .four-brand {
    font-size: 25px;
  }
  .four-intro {
    top: 139px;
    left: 7%;
  }
  .four-intro>.mono {
    font-size: 7px;
  }
  .four-intro h1 {
    font-size: clamp(70px,18vw,110px);
    margin: 28px 0 27px;
  }
  .four-intro p {
    font-size: 14px;
    color: #c0acad;
    text-shadow: 0 1px 5px #231e25;
  }
  .studio-mac {
    width: 173px;
    left: 9%;
    top: 620px;
    --angle: -12deg;
  }
  .studio-print {
    padding: 7px 7px 24px;
  }
  .studio-print>img {
    height: 142px;
  }
  .mac-greeting {
    font-size: 12px;
    bottom: 6px;
  }
  .studio-dodo {
    width: 127px;
    right: 12%;
    top: 480px;
    --angle: 11deg;
  }
  .studio-screen {
    height: 228px;
    border-radius: 13px;
    padding: 4px;
  }
  .studio-screen>img {
    border-radius: 9px;
  }
  .studio-jam {
    width: 243px;
    left: 26%;
    top: 868px;
    --angle: 7deg;
  }
  .synth-image {
    height: 104px;
  }
  .synth-image>img {
    top: -80px;
  }
  .synth-image>.synth-hover {
    top: -144px;
  }
  .studio-label {
    font-size: 12px;
    padding-top: 11px;
  }
  .studio-label small {
    font-size: 6px;
    margin-bottom: 4px;
  }
  .studio-label>span:last-child {
    font-size: 15px;
  }
  .four-floor {
    bottom: 22px;
    left: 7%;
    right: 7%;
    gap: 10px;
  }
  .four-floor>.mono {
    font-size: 6px;
  }
  .desk-reset {
    font-size: 6px;
  }
  .four-about {
    grid-template-columns: 1fr;
    gap: 23px;
    padding: 45px 7%;
  }
  .four-about h2 {
    font-size: 40px;
  }
  .four-bio {
    padding-top: 0;
  }
  .four-bio p {
    font-size: 16px;
    max-width: none;
  }
  .four-footer {
    flex-wrap: wrap;
    gap: 20px;
    font-size: 10px;
    margin: 0 7%;
    padding-bottom: 100px;
  }
  .four-footer>.mono {
    display: none;
  }
  .project-dialog {
    padding: 37px 20px 25px;
  }
  .dialog-copy h2 {
    font-size: 43px;
  }
  .dialog-copy p {
    font-size: 15px;
  }
  .dialog-images {
    gap: 10px;
  }
  .dialog-images img {
    width: calc(50% - 5px);
  }
  .dialog-instrument>.mono {
    display: block;
    margin: 14px 0 0;
    font-size: 7px;
  }
  .beat-steps {
    gap: 4px;
    grid-template-columns: repeat(8,1fr);
  }
}

@media (hover:none) {
  .desktop-instructions {
    display: none;
  }
  .touch-instructions {
    display: inline;
  }
  .desk-reset {
    display: none;
  }
}

@media (prefers-reduced-motion:reduce) {
  *,*::before,*::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
  .four-sculpture {
    transform: none;
  }
}
`
