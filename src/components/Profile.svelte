<script lang="ts">
  // Profile ("Agent Profile") view — design/Homepage.dc.html lines 184-269,
  // PLAN.md Phase 7. All copy comes from src/data/profile.yaml (ProfileData);
  // this component only supplies structure/styling and the `r`
  // resume-download hotkey. PLAN.md Phase 1 items 15/16 removed the
  // `[q] close` pill entirely — view navigation is status-bar clicks / the
  // tmux prefix / the dashboard menu now, never a bare key or an in-view
  // click target, so there is nothing left here to close *to* the dashboard.
  //
  // Image src paths (portrait/field/retina-v/icon-*) are literal, same
  // convention as Wallpaper.svelte/Dashboard.svelte's hardcoded
  // `/assets/spiderman.svg` mask URLs — these are asset URLs, not
  // user-visible copy, so they live here rather than in the yaml (the
  // per-row contact `icon` paths are the one exception, already
  // data-driven in profile.yaml).
  //
  // The SIGNAL footer row's `border-top: 1px solid rgba(224, 69, 60,
  // 0.25)` declaration is authored here with the exact spacing the visual
  // pipeline's SIGNAL_ROW_SELECTOR substring-matches on
  // (tests/visual/pipeline.mjs) — this is the row the pipeline masks out
  // (the meter's bar heights and readout text depend on real load timing,
  // never frozen by the faked clock).
  import type { ProfileData } from "../lib/data";
  import { downloadResume } from "../lib/resume";
  import Meter from "./Meter.svelte";

  interface Props {
    profile: ProfileData;
  }

  const { profile }: Props = $props();

  function isMailto(href: string): boolean {
    return href.startsWith("mailto:");
  }

  /** `bind:this` + `handleKey(): boolean` delegation contract, same shape
   * Builds.svelte/Personnel.svelte already use (Terminal.svelte tries this
   * before falling back to its own generic q/Esc-to-dashboard handling —
   * Profile has nothing else to claim, only `r`). */
  export function handleKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() === "r") {
      downloadResume();
      return true;
    }
    return false;
  }
</script>

<div style="flex:1;min-height:0;display:flex;padding:16px 22px 12px">
  <div
    style="flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;background:rgba(9,13,18,.6);backdrop-filter:blur(3px);border:1px solid rgba(224,69,60,.4);border-radius:5px;padding:12px 14px;font-size:12px;box-shadow:0 24px 80px rgba(0,0,0,.5)"
  >
    <div style="flex:none;display:flex;align-items:center;gap:12px">
      <div
        style="display:flex;align-items:center;gap:8px;background:rgba(224,69,60,.16);border:1px solid rgba(224,69,60,.5);padding:4px 10px;clip-path:polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)"
      >
        <span
          style="width:12px;height:17px;background:#ff4a4a;mask:url(/assets/spiderman.svg) center/contain no-repeat;-webkit-mask:url(/assets/spiderman.svg) center/contain no-repeat;display:block"
        ></span>
        <span style="color:#e0453c;font-weight:700;letter-spacing:.2em">{profile.header.badge}</span>
      </div>
      <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(224,69,60,.5),rgba(224,69,60,.08))"></div>
      <span style="color:rgba(196,216,232,.45);letter-spacing:.14em">{profile.header.fileClearance}</span>
    </div>

    <div
      style="flex:none;background:linear-gradient(90deg,rgba(224,69,60,.28),rgba(224,69,60,.05));border-left:3px solid #e0453c;padding:6px 18px;clip-path:polygon(0 0,100% 0,calc(100% - 22px) 100%,0 100%)"
    >
      <div style="font-size:clamp(20px,4vh,34px);font-weight:700;letter-spacing:.16em;color:#f4ece9;line-height:1.05">
        {profile.title.name}
      </div>
      <div style="font-size:clamp(11px,1.8vh,14px);letter-spacing:.28em;color:#5fc6b4">{profile.title.subtitle}</div>
    </div>

    <div style="flex:1 1 auto;min-height:0;display:grid;grid-template-columns:196px minmax(0,1fr) 232px;gap:12px">
      <div style="min-height:0;display:flex;flex-direction:column;gap:10px">
        <div style="flex:1.6;min-height:0;position:relative;border:1px solid rgba(224,69,60,.5);overflow:hidden">
          <img
            src="/assets/portrait.jpg"
            alt={profile.images.portrait.alt}
            style="width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.85) contrast(1.05)"
          />
          <div
            style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(224,69,60,.1),rgba(11,16,22,.55))"
          ></div>
          <div style="position:absolute;left:0;bottom:0;background:rgba(11,16,22,.85);color:#5fc6b4;padding:2px 7px;font-size:11px">
            {profile.images.portrait.caption}
          </div>
        </div>
        <div style="flex:1;min-height:0;position:relative;border:1px solid rgba(224,69,60,.35);overflow:hidden">
          <img
            src="/assets/field.jpg"
            alt={profile.images.field.alt}
            style="width:100%;height:100%;object-fit:cover;object-position:50% 30%;display:block;filter:grayscale(.55) contrast(1.05)"
          />
          <div style="position:absolute;left:0;bottom:0;background:rgba(11,16,22,.85);color:rgba(196,216,232,.7);padding:2px 7px;font-size:11px">
            {profile.images.field.caption}
          </div>
        </div>
      </div>

      <div style="min-height:0;display:flex;flex-direction:column;gap:10px">
        <div
          style="flex:none;border:1px solid rgba(224,69,60,.35);padding:7px 10px;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;line-height:1.3"
        >
          {#each profile.fields as f (f.label)}
            <span style="color:#e0453c">{f.label}</span>
            {#if f.linkText}
              <span style="color:#5fc6b4"
                >{f.valuePrefix}<a href={f.linkHref} target="_blank" rel="noreferrer">{f.linkText}</a></span
              >
            {:else}
              <span style="color:rgba(196,216,232,.85)">{f.value}</span>
            {/if}
          {/each}
        </div>
        <div
          data-testid="profile-summary"
          data-copy-source
          style="flex:1 1 auto;min-height:64px;overflow-y:auto;border:1px solid rgba(224,69,60,.35);padding:6px 10px;display:flex;flex-direction:column;gap:3px;font-size:12px;line-height:1.32;color:rgba(196,216,232,.75)"
        >
          <div style="color:rgba(217,176,74,.85);letter-spacing:.16em">{profile.summary.heading}</div>
          {#each profile.summary.paragraphs as p (p)}
            <div>{p}</div>
          {/each}
        </div>
        <div
          data-testid="profile-dossier"
          data-copy-source
          style="flex:1.4 1 auto;min-height:84px;overflow-y:auto;border:1px solid rgba(224,69,60,.35);padding:6px 10px;display:flex;flex-direction:column;gap:5px;font-size:11.5px;line-height:1.34;color:rgba(196,216,232,.75)"
        >
          <div style="color:rgba(217,176,74,.85);letter-spacing:.16em">{profile.dossier.heading}</div>
          {#each profile.dossier.paragraphs as p (p)}
            <div>{p}</div>
          {/each}
        </div>
        <div
          style="flex:0 1 auto;height:38.5%;max-height:38.5%;min-height:84px;box-sizing:border-box;position:relative;border:1px solid rgba(224,69,60,.35);overflow:hidden"
        >
          <img
            src="/assets/retina-v.png"
            alt={profile.images.retinaV.alt}
            style="width:100%;height:100%;object-fit:cover;object-position:50% 62%;display:block"
          />
          <div style="position:absolute;left:0;bottom:0;background:rgba(11,16,22,.85);color:#5fc6b4;padding:2px 7px;font-size:11px">
            {profile.images.retinaV.caption}
          </div>
        </div>
      </div>

      <div style="min-height:0;display:flex;flex-direction:column;gap:10px">
        <div
          style="flex:none;border:1px solid rgba(95,198,180,.4);padding:6px 10px;display:flex;flex-direction:column;gap:3px;font-size:12px"
        >
          <div style="color:#5fc6b4;letter-spacing:.14em;font-size:11px">{profile.recordDatabase.title}</div>
          {#each profile.recordDatabase.stats as s (s.label)}
            <div style="display:flex;justify-content:space-between;color:rgba(196,216,232,.7)">
              <span>{s.label}</span><span style="color:#e0453c">{s.value}</span>
            </div>
          {/each}
        </div>
        <div
          style="flex:none;border:1px solid rgba(217,176,74,.4);padding:6px 10px;display:flex;flex-direction:column;gap:3px;font-size:12px"
        >
          <div style="color:rgba(217,176,74,.9);letter-spacing:.14em;font-size:11px">{profile.cv.title}</div>
          <a
            href={"/" + profile.cv.href}
            download
            data-testid="profile-cv-link"
            class="profile-link"
            style="color:rgba(196,216,232,.7)"
            >{profile.cv.fileLabel} <span style="color:rgba(196,216,232,.35)">{profile.cv.meta}</span></a
          >
          <div style="color:rgba(196,216,232,.35);font-size:11px">
            {profile.cv.hintPrefix}<span style="color:rgba(217,176,74,.9)">{profile.cv.hintKey}</span
            >{profile.cv.hintSuffix}
          </div>
        </div>
        <div style="flex:none;border:1px solid rgba(95,198,180,.4);padding:6px 10px;display:flex;flex-direction:column;gap:5px">
          <div style="color:#5fc6b4;letter-spacing:.14em;font-size:11px">{profile.contact.title}</div>
          <div style="display:flex;flex-direction:column;gap:3px;font-size:11.5px">
            {#each profile.contact.rows as row (row.text)}
              {#if row.href}
                <a
                  href={row.href}
                  target={isMailto(row.href) ? undefined : "_blank"}
                  rel={isMailto(row.href) ? undefined : "noreferrer"}
                  data-testid="profile-contact-link"
                  class="profile-link"
                  style="display:flex;align-items:center;gap:9px;color:rgba(196,216,232,.78)"
                >
                  <img src={"/" + row.icon} alt={row.alt} style="width:15px;height:15px;flex:none;display:block" />{row.text}
                </a>
              {:else}
                <span
                  data-testid="profile-contact-nonlink"
                  style="display:flex;align-items:center;gap:9px;color:rgba(196,216,232,.78)"
                >
                  <img src={"/" + row.icon} alt={row.alt} style="width:15px;height:15px;flex:none;display:block" />{row.text}
                </span>
              {/if}
            {/each}
          </div>
        </div>
        <div
          data-testid="profile-education"
          style="flex:none;border:1px solid rgba(217,176,74,.4);padding:6px 10px;display:flex;flex-direction:column;gap:5px"
        >
          <div style="color:rgba(217,176,74,.9);letter-spacing:.14em;font-size:11px">{profile.education.title}</div>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:11px">
            {#each profile.education.rows as row (row.degree)}
              <div data-testid="profile-education-row" style="display:flex;flex-direction:column;gap:1px">
                <span style="color:rgba(196,216,232,.85)">{row.degree}</span>
                <span style="color:rgba(196,216,232,.6)">{row.school} · {row.loc}</span>
                <span style="color:rgba(196,216,232,.45)">{row.dates}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <div
      data-testid="profile-signal-row"
      style="flex:none;display:flex;align-items:center;gap:10px;border-top: 1px solid rgba(224, 69, 60, 0.25);padding-top:8px;color:rgba(196,216,232,.4);font-size:11px"
    >
      <span style="color:#e0453c">{profile.signal.label}</span>
      <Meter initialReadout={profile.signal.initialReadout} />
      <span>{profile.signal.coords}</span>
    </div>
  </div>
</div>

<style>
  .profile-link:hover {
    color: #e0453c;
  }
</style>
