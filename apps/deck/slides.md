---
title: Show Studio
info: Mechatronics animation studio for amusement parks. Design, experience, team and plan.
colorSchema: dark
theme: default
fonts:
  sans: Geist
  serif: Instrument Serif
  mono: Geist Mono
  italic: true
transition: slide-left
mdc: true
layout: cover
---

<Backdrop name="twin" :opacity="0.55" />

<div class="relative z-10 h-full flex flex-col justify-center max-w-[36rem]">
  <Rise :delay="60"><h1 class="hero">Show <span class="serif grad">Studio</span></h1></Rise>
  <Rise :delay="260"><p class="lede text-lg">Design spectacular mechatronic shows in the cloud.<br/>Run them safely in the park.</p></Rise>
  <Rise :delay="420">
    <div class="flex gap-2 mt-9">
      <span class="chip">01 · Design</span>
      <span class="chip cy">02 · Experience</span>
      <span class="chip in">03 · Team &amp; plan</span>
      <span class="live">Live demo</span>
    </div>
  </Rise>
</div>

<!--
Timing (30 min): assumptions 2 · design 11 · experience and live demo 7 · team and plan 8 · what's next 2, then Q&A.
The experience part is a working prototype rather than a static mockup; I can switch to a live demo.
-->

---

<Rise><div class="kicker">Agenda</div></Rise>
<Rise :delay="80"><h1>Thirty minutes, <span class="serif grad">one working studio</span></h1></Rise>

<div class="grid grid-cols-5 gap-3 mt-9">
  <Rise :delay="160"><div class="glass h-full"><div class="stat grad">00</div><h3 class="mt-3">Assumptions</h3><p>What the brief leaves open</p><div class="chip ghost mt-3">2 min</div></div></Rise>
  <Rise :delay="240"><div class="glass lit h-full"><div class="stat grad">01</div><h3 class="mt-3">Design</h3><p>Cloud and park, data, flows, guardrails, devices, trust</p><div class="chip ghost mt-3">11 min</div></div></Rise>
  <Rise :delay="320"><div class="glass h-full"><div class="stat grad">02</div><h3 class="mt-3">Experience</h3><p>Two personas and a <b>live demo</b></p><div class="flex gap-2 mt-3"><span class="chip ghost">7 min</span><span class="live">Live</span></div></div></Rise>
  <Rise :delay="400"><div class="glass h-full"><div class="stat grad">03</div><h3 class="mt-3">Team &amp; plan</h3><p>Who, how fast, in which order</p><div class="chip ghost mt-3">8 min</div></div></Rise>
  <Rise :delay="480"><div class="glass h-full"><div class="stat grad">04</div><h3 class="mt-3">What's next</h3><p>An AI show assistant and new ideas</p><div class="chip ghost mt-3">2 min</div></div></Rise>
</div>

<Rise :delay="560"><p class="muted text-sm mt-8 text-center">Everything on these slides runs: the studio, the fleet manager and a game-engine twin of the attraction.</p></Rise>

---

<Rise><div class="kicker">Assumptions</div></Rise>
<Rise :delay="80"><h1>What I <span class="serif grad">assumed</span></h1></Rise>
<Rise :delay="160"><p class="lede">The brief is open on purpose. These numbers drive the design; I'd validate each one in week one.</p></Rise>

<div class="grid grid-cols-[1.25fr_1fr] gap-5 mt-6">
  <div class="grid grid-cols-2 gap-3">
    <Rise :delay="240"><div class="glass"><div class="stat grad">3–5</div><p class="mt-1">parks, ~20 attractions each</p></div></Rise>
    <Rise :delay="300"><div class="glass"><div class="stat grad">5–50</div><p class="mt-1">controllers per attraction</p></div></Rise>
    <Rise :delay="360"><div class="glass"><div class="stat grad">5–100</div><p class="mt-1">joints per figure</p></div></Rise>
    <Rise :delay="420"><div class="glass"><div class="stat grad">4</div><p class="mt-1">roles: engineer, animator, safety reviewer, operator</p></div></Rise>
  </div>
  <Rise :delay="480">
    <div class="glass lit h-full">
      <h3>Quick sizing</h3>
      <ul>
        <li>Raw motion: 100 joints × 100 Hz × 4 B × 10 min ≈ <b>24 MB</b> per figure</li>
        <li>As keyframes: <b>~100 KB</b> per show, so shows are cheap to sign and ship</li>
        <li>3D models and audio: <b>10–500 MB</b> each → object storage + CDN</li>
        <li>Metadata, revisions, audit → <b>Postgres</b></li>
      </ul>
    </div>
  </Rise>
</div>

<Rise :delay="560">
  <div class="flex items-center gap-2 mt-5">
    <span class="faint text-xs uppercase tracking-widest mr-1">Non-negotiable</span>
    <span class="chip">Runs with the internet down</span>
    <span class="chip cy">Four eyes on anything that moves</span>
    <span class="chip red">Hardwired e-stop outside software</span>
  </div>
</Rise>

<!--
The two assumptions that shape everything: controllers hold their own limits, and the show must run without the cloud.
-->

---
layout: center
---

<Divider n="01" title="Design" thesis="Author in the cloud, run in the park, prove every step." />

---

<Rise><div class="kicker">01 · Design · Architecture</div></Rise>
<Rise :delay="80"><h1>Design in the <span class="serif grad">cloud</span>. Run in the <span class="serif grad">park</span>.</h1></Rise>

<div class="grid grid-cols-[1fr_8.5rem_1fr] gap-3 mt-6 items-stretch">
  <Rise :delay="160" :x="-20" :y="0">
    <div class="glass h-full flex flex-col gap-2">
      <div class="kicker !mb-0">Cloud · studio</div>
      <div class="node cy">Web studio<small>React · three.js · timeline · review</small></div>
      <div class="grid grid-cols-2 gap-2">
        <div class="node em">Studio API<small>revisions · validation · signing · audit</small></div>
        <div class="node em">Fleet manager<small>desired state · deploy · launch · e-stop</small></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="node in">Postgres<small>documents · runs · audit chain</small></div>
        <div class="node in">Object store<small>models · audio · bundles by hash</small></div>
      </div>
    </div>
  </Rise>
  <div class="flex flex-col justify-center gap-6">
    <Rise :delay="420"><div class="text-center text-[0.6rem] muted mb-1">signed bundles</div><div class="flow"></div></Rise>
    <Rise :delay="520"><div class="text-center text-[0.6rem] muted mb-1">device protocol · WebSocket</div><div class="flow cy"></div></Rise>
    <Rise :delay="620"><div class="text-center text-[0.6rem] muted mb-1">status · telemetry</div><div class="flow back"></div></Rise>
  </div>
  <Rise :delay="300" :x="20" :y="0">
    <div class="glass lit h-full flex flex-col gap-2">
      <div class="kicker !mb-0">Park · edge · per attraction</div>
      <div class="node em">Local show controller<small>shared clock · sensor → response arbitration</small></div>
      <div class="grid grid-cols-4 gap-2 text-center">
        <div class="node">Figures</div><div class="node">Lights</div><div class="node">Audio</div><div class="node">Sensors</div>
      </div>
      <div class="node red">Operator console<small>RUN · E-STOP latches every controller locally</small></div>
    </div>
  </Rise>
</div>

<div v-click class="glass mt-5 flex items-center gap-3">
  <span class="dot pulse"></span>
  <p class="!text-sm"><b>The cloud is never in the real-time loop.</b> A launched show, its sensor responses and the e-stop keep working when the link drops.</p>
</div>

<!--
The single most important point. The cloud designs, validates, signs and distributes; the park plays. Bundles are local, sensor arbitration is local, the console e-stop is local.
-->

---

<Rise><div class="kicker">01 · Design · Architecture in detail</div></Rise>
<Rise :delay="80"><h1>Inside the <span class="serif grad">cloud</span></h1></Rise>

<div class="grid grid-cols-[6.8rem_1fr_1fr_7.6rem] gap-3 mt-5">
  <Rise :delay="140">
    <div class="flex flex-col gap-2 h-full justify-center">
      <div class="faint text-[0.55rem] uppercase tracking-widest">Clients</div>
      <div class="node cy">Studio app<small>browser · 3D</small></div>
      <div class="node">Control room<small>operators</small></div>
      <div class="node red">Devices<small>mTLS · outbound</small></div>
      <div class="node">Godot twin<small>same protocol</small></div>
    </div>
  </Rise>
  <Rise :delay="240">
    <div class="glass lit h-full flex flex-col gap-2">
      <div class="kicker !mb-0">Studio API · stateless</div>
      <div class="grid grid-cols-2 gap-2">
        <div class="node">Documents<small>drafts · locks · revisions</small></div>
        <div class="node em">Validator<small>shared library · 35 rules</small></div>
        <div class="node">Compiler<small>deterministic bundles</small></div>
        <div class="node em">Approval &amp; signing<small>four eyes · KMS</small></div>
        <div class="node">Projects &amp; access<small>teams · roles · RLS</small></div>
        <div class="node">Assets<small>sniff · hash · dedupe</small></div>
      </div>
      <div class="text-[0.58rem] muted mt-auto">REST <span class="code-chip">/api/v1</span> · request and response validated from the contract</div>
    </div>
  </Rise>
  <Rise :delay="340">
    <div class="glass h-full flex flex-col gap-2">
      <div class="kicker !mb-0">Fleet manager · per attraction</div>
      <div class="grid grid-cols-2 gap-2">
        <div class="node cy">Device gateway<small>WebSocket / MQTT</small></div>
        <div class="node">Reconciler<small>desired vs reported</small></div>
        <div class="node">Deployments<small>pre-check · all or nothing</small></div>
        <div class="node">Run scheduler<small>launch · swap · standby</small></div>
        <div class="node red">E-stop latch<small>command first, record after</small></div>
        <div class="node">Consoles &amp; keys<small>panel state · provisioning</small></div>
      </div>
      <div class="text-[0.58rem] muted mt-auto">Device protocol · AsyncAPI · every command idempotent</div>
    </div>
  </Rise>
  <Rise :delay="440">
    <div class="flex flex-col gap-2 h-full justify-center">
      <div class="faint text-[0.55rem] uppercase tracking-widest">State</div>
      <div class="node in">Postgres<small>docs · runs · latch · audit</small></div>
      <div class="node in">Object store<small>assets · bundles by hash</small></div>
      <div class="node em">KMS<small>per-tenant keys</small></div>
      <div class="node">Telemetry<small>OpenTelemetry · alerts</small></div>
    </div>
  </Rise>
</div>

<Rise :delay="560">
  <div class="glass mt-3 flex items-center gap-3 !py-2">
    <span class="chip">Shared core</span>
    <p><b>One contract</b> generates types, OpenAPI, AsyncAPI and JSON Schemas; <b>one playback library</b> interpolates, validates and compiles in the browser, the API, the devices and the twin.</p>
  </div>
</Rise>

<!--
The API and the fleet manager are one deployable today and split along this line when scale needs it (ADR 7). The fleet manager shards by attraction: each attraction's devices, run and latch live on one node.
-->

---

<Rise><div class="kicker">01 · Design · Architecture in detail</div></Rise>
<Rise :delay="80"><h1>Inside the <span class="serif grad">park</span></h1></Rise>

<div class="grid grid-cols-[1fr_2.2rem_1.25fr_2.2rem_0.8fr] gap-2 mt-5 items-center">
  <Rise :delay="140">
    <div class="glass lit flex flex-col gap-2">
      <div class="kicker !mb-0">Edge gateway · Linux IPC</div>
      <div class="node cy">Cloud uplink<small>mTLS · outbound · store and forward</small></div>
      <div class="node">Bundle cache<small>by hash · survives reboots</small></div>
      <div class="node em">Local show controller<small>shared clock · sensor arbitration</small></div>
      <div class="node">Local broker<small>MQTT on the show network</small></div>
      <div class="node red">Console backend<small>panel · RUN · RESET</small></div>
    </div>
  </Rise>
  <div class="flex flex-col gap-10"><div class="flow"></div><div class="flow back cy"></div></div>
  <Rise :delay="260">
    <div class="glass flex flex-col gap-2">
      <div class="kicker !mb-0">Device agent · on every controller</div>
      <div class="grid grid-cols-4 gap-2 text-center">
        <div class="node em">Verify<small>hash · signature · schema · limits</small></div>
        <div class="node">Stage<small>A/B · atomic</small></div>
        <div class="node">Play<small>shared runtime</small></div>
        <div class="node">Report<small>state · faults</small></div>
      </div>
      <div class="flow mx-2"></div>
      <div class="faint text-[0.55rem] uppercase tracking-widest">Adapters to proven controllers</div>
      <div class="flex flex-wrap gap-1">
        <span class="code-chip">EtherCAT / ADS</span><span class="code-chip">OPC UA</span><span class="code-chip">sACN · Art-Net</span><span class="code-chip">Dante · Q-SYS</span><span class="code-chip">digital I/O</span>
      </div>
    </div>
  </Rise>
  <div class="flex flex-col gap-10"><div class="flow"></div><div class="flow back cy"></div></div>
  <Rise :delay="380">
    <div class="flex flex-col gap-2">
      <div class="node">Servo drives<small>own loops · limits</small></div>
      <div class="node">Fixtures</div>
      <div class="node">DSP · amps</div>
      <div class="node">Sensors</div>
    </div>
  </Rise>
</div>

<Rise :delay="500">
  <div class="glass danger mt-4 flex items-center gap-3 !py-2">
    <span class="chip red">Separate and hardwired</span>
    <p>E-stop chain → <b>safety PLC</b> → <b>safe torque off</b> on every drive. Independent of every box above; software only reports it.</p>
  </div>
</Rise>

<!--
If the cloud link drops: playback continues from the cache, sensor responses keep being decided by the local show controller, the console e-stop latches locally, telemetry is buffered and shipped later.
-->

---

<Rise><div class="kicker">01 · Design · Lifecycle</div></Rise>
<Rise :delay="80"><h1>Every show has a <span class="serif grad">lifecycle</span></h1></Rise>
<Rise :delay="160"><p class="lede">“Good to go” is a fact the devices report, not a status someone sets.</p></Rise>

<div class="grid grid-cols-6 gap-2 mt-5">
  <Rise :delay="240"><div class="glass h-full !py-3"><div class="flex items-center gap-2 mb-1"><span class="chip ghost">1</span><h3 class="!m-0">Draft</h3></div><p>Autosave, undo, live checks</p></div></Rise>
  <Rise :delay="320"><div class="glass h-full !py-3"><div class="flex items-center gap-2 mb-1"><span class="chip ghost">2</span><h3 class="!m-0">Validated</h3></div><p>35 rules; server re-checks</p></div></Rise>
  <Rise :delay="400"><div class="glass lit h-full !py-3"><div class="flex items-center gap-2 mb-1"><span class="chip">3</span><h3 class="!m-0">Signed</h3></div><p>Second person; exact bytes</p></div></Rise>
  <Rise :delay="480"><div class="glass h-full !py-3"><div class="flex items-center gap-2 mb-1"><span class="chip ghost">4</span><h3 class="!m-0">Staged</h3></div><p>Every controller verifies</p></div></Rise>
  <Rise :delay="560"><div class="glass h-full !py-3"><div class="flex items-center gap-2 mb-1"><span class="chip ghost">5</span><h3 class="!m-0">Armed</h3></div><p>Shared start time</p></div></Rise>
  <Rise :delay="640"><div class="glass h-full !py-3"><div class="flex items-center gap-2 mb-1"><span class="chip cy">6</span><h3 class="!m-0">Running</h3></div><p>Local playback, e-stop</p></div></Rise>
</div>

<div class="flow mt-3 mx-6"></div>

<div class="grid grid-cols-2 gap-4 mt-4">
  <div v-click class="glass">
    <h3>Revisions of everything</h3>
    <ul>
      <li>Characters, layouts and shows: draft → <b>immutable revisions</b></li>
      <li>A show pins <span class="code-chip">layout@r3</span> and <span class="code-chip">dragon@r2</span>; newer ones are offered, never forced</li>
      <li>Diff with real values, restore as draft; <b>rollback = redeploy</b></li>
    </ul>
  </div>
  <div v-click class="glass">
    <h3>Release packages</h3>
    <ul>
      <li>Every signed revision downloads as an <b>offline install zip</b></li>
      <li>Exact signed bytes, signature, manifest, audio by hash, README</li>
      <li>Byte-identical per revision; verify with <span class="code-chip">openssl</span></li>
    </ul>
  </div>
</div>

<!--
Approval binds to the bundle hash, not to a document id. If anything changes, it's a new revision and needs a new approval. Rollback is deploying an older approved hash.
-->

---

<Rise><div class="kicker">01 · Design · Data</div></Rise>
<Rise :delay="80"><h1>One model, <span class="serif grad">versioned</span> end to end</h1></Rise>

<div class="grid grid-cols-[1.15fr_1fr] gap-5 mt-5">
  <Rise :delay="160">
    <div class="grid grid-cols-3 gap-2">
      <div class="glass !p-3"><div class="kicker !mb-2">Library</div><div class="flex flex-col gap-2"><div class="node">Character<small>joints · range · speed</small></div><div class="node in">Asset<small>by SHA-256</small></div></div></div>
      <div class="glass !p-3"><div class="kicker !mb-2">Locations</div><div class="flex flex-col gap-2"><div class="node">Environment<small>stage · devices · zones</small></div><div class="node">Device<small>state · staged</small></div></div></div>
      <div class="glass !p-3"><div class="kicker !mb-2">Projects</div><div class="flex flex-col gap-2"><div class="node em">Show<small>tracks · responses</small></div><div class="node">Team<small>project roles</small></div></div></div>
      <div class="glass !p-3 col-span-3">
        <div class="kicker !mb-2">Delivery</div>
        <div class="flex items-center gap-2">
          <div class="node flex-1">Revision</div><span class="muted">→</span>
          <div class="node em flex-1">Signed bundle</div><span class="muted">→</span>
          <div class="node flex-1">Deployment</div><span class="muted">→</span>
          <div class="node flex-1">Run · e-stop · audit</div>
        </div>
      </div>
    </div>
  </Rise>
  <Rise :delay="300">
    <div class="glass lit h-full">
      <h3>Formats and where they live</h3>
      <table class="w-full text-[0.66rem] mt-1"><tbody>
        <tr class="faint"><td class="pb-1">What</td><td>Format</td><td>Store</td></tr>
        <tr><td class="py-[3px]">3D models</td><td class="muted">glTF / GLB</td><td class="muted">object store</td></tr>
        <tr><td class="py-[3px]">Figure definitions</td><td class="muted">URDF → JSON</td><td class="muted">Postgres</td></tr>
        <tr><td class="py-[3px]">Layouts, shows</td><td class="muted">JSON, versioned schema</td><td class="muted">Postgres</td></tr>
        <tr><td class="py-[3px]">Bundles</td><td class="muted">JSON + RSA sig</td><td class="muted">object store</td></tr>
        <tr><td class="py-[3px]">Contracts</td><td class="muted">OpenAPI · AsyncAPI</td><td class="muted">git, CI-checked</td></tr>
      </tbody></table>
      <p class="mt-2">SI units; every document has a <span class="code-chip">schemaVersion</span>.</p>
    </div>
  </Rise>
</div>

<!--
One contract (zod) generates TypeScript types, OpenAPI, AsyncAPI and JSON Schemas. The Godot twin validates bundles against the same JSON Schema.
-->

---

<Rise><div class="kicker">01 · Design · Data model</div></Rise>
<Rise :delay="80"><h1>Entities and <span class="serif grad">relations</span></h1></Rise>

<Rise :delay="160">
<div class="erd mt-4">
  <svg viewBox="0 0 880 372">
    <path class="rel" d="M150,39 L182,39" /><text x="156" y="33">N:1</text>
    <path class="rel" d="M257,78 C257,100 400,95 400,115" /><text x="300" y="98">1:1 show</text>
    <path class="rel" d="M300,250 C300,228 400,232 400,207" /><text x="316" y="236">1:N environments</text>
    <path class="rel" d="M482,115 C482,60 520,39 546,39" /><text x="506" y="66">1:N</text>
    <path class="rel ref" d="M600,78 C600,104 528,100 506,115" /><text class="ref" x="548" y="106">pins env@r · char@r</text>
    <path class="rel live" d="M696,39 L728,39" /><text x="699" y="33">0..1</text>
    <path class="rel live" d="M803,78 L803,125" /><text x="808" y="105">1:N</text>
    <path class="rel live" d="M760,78 C760,102 680,100 680,125" /><text x="718" y="112">1:N</text>
    <path class="rel live" d="M621,203 L621,250" /><text x="626" y="231">N:1</text>
    <path class="rel" d="M514,192 C534,192 528,289 546,289" /><text x="520" y="258">1:N</text>
    <path class="rel" d="M439,207 L439,245" /><text x="444" y="230">1:N · 1:1</text>
    <path class="rel ref" d="M364,161 L332,161" /><text class="ref" x="334" y="154">by hash</text>
    <path class="rel ref" d="M75,125 L75,78" /><text class="ref" x="80" y="105">SSO</text>
    <path class="rel" d="M878,276 C910,276 910,306 878,306" /><text x="884" y="320">prev_hash</text>
    <circle class="end" cx="182" cy="39" r="2.5" /><circle class="end" cx="400" cy="115" r="2.5" /><circle class="end" cx="400" cy="207" r="2.5" />
    <circle class="end" cx="546" cy="39" r="2.5" /><circle class="end" cx="728" cy="39" r="2.5" /><circle class="end" cx="803" cy="125" r="2.5" />
    <circle class="end" cx="680" cy="125" r="2.5" /><circle class="end" cx="621" cy="250" r="2.5" /><circle class="end" cx="546" cy="289" r="2.5" />
    <circle class="end" cx="439" cy="245" r="2.5" /><circle class="end" cx="878" cy="306" r="2.5" />
  </svg>
  <div class="ent go" style="left:0;top:0"><div class="ent-t">project_members</div><div class="ent-f"><i>PK</i>project_id <i class="fk">FK</i></div><div class="ent-f"><i>PK</i>user_name</div><div class="ent-f">role: owner…viewer</div></div>
  <div class="ent go" style="left:182px;top:0"><div class="ent-t">projects</div><div class="ent-f"><i>PK</i>id = the show's id</div><div class="ent-f">created_by</div><div class="ent-f">deleted_at · deleted_by</div></div>
  <div class="ent au" style="left:546px;top:0"><div class="ent-t">revisions</div><div class="ent-f"><i>PK</i>doc_id · revision</div><div class="ent-f">content jsonb · sha256</div><div class="ent-f">status · reviewed_by</div><div class="ent-f"><i class="fk">FK</i>bundle_sha256</div></div>
  <div class="ent de" style="left:728px;top:0"><div class="ent-t">bundles</div><div class="ent-f"><i>PK</i>sha256</div><div class="ent-f"><i class="fk">FK</i>show_id · revision</div><div class="ent-f">body · exact bytes</div><div class="ent-f">signature</div></div>
  <div class="ent ghost go" style="left:0;top:125px"><div class="ent-t">people</div><div class="ent-f">from the IdP, not stored</div><div class="ent-f">workspace roles</div><div class="ent-f">from groups</div></div>
  <div class="ent au" style="left:182px;top:125px"><div class="ent-t">assets</div><div class="ent-f"><i>PK</i>id = sha256</div><div class="ent-f">kind: model · audio</div><div class="ent-f">mime · size</div></div>
  <div class="ent au hub" style="left:364px;top:115px"><div class="ent-t">documents</div><div class="ent-f"><i>PK</i>id</div><div class="ent-f">kind: character ·</div><div class="ent-f">  environment · show</div><div class="ent-f">draft jsonb · draft_version</div><div class="ent-f"><i class="fk">FK</i>project_id · location_id</div></div>
  <div class="ent de" style="left:546px;top:125px"><div class="ent-t">desired_bundles</div><div class="ent-f"><i>PK</i>environment_id</div><div class="ent-f"><i>PK</i>device_id</div><div class="ent-f"><i>PK</i>sha256 <i class="fk">FK</i></div></div>
  <div class="ent de" style="left:728px;top:125px"><div class="ent-t">deployments</div><div class="ent-f"><i>PK</i>id</div><div class="ent-f"><i class="fk">FK</i>sha256</div><div class="ent-f">environment_id</div><div class="ent-f">created_by</div></div>
  <div class="ent au" style="left:182px;top:250px"><div class="ent-t">locations</div><div class="ent-f"><i>PK</i>id</div><div class="ent-f">name · region</div><div class="ent-f">description</div></div>
  <div class="ent ru" style="left:364px;top:245px"><div class="ent-t">show_runs</div><div class="ent-f"><i>PK</i>id · environment_id</div><div class="ent-f">sha256 · start_at</div><div class="ent-f">launched_by · stopped_at</div></div>
  <div class="ent ru" style="left:364px;top:328px"><div class="ent-t">estops</div><div class="ent-f"><i>PK</i>environment_id</div><div class="ent-f">active · actor · reason</div></div>
  <div class="ent ru" style="left:546px;top:250px"><div class="ent-t">devices</div><div class="ent-f"><i>PK</i>environment_id · id</div><div class="ent-f">kind · firmware</div><div class="ent-f">state · staged jsonb</div></div>
  <div class="ent go" style="left:728px;top:250px"><div class="ent-t">audit_log</div><div class="ent-f"><i>PK</i>seq</div><div class="ent-f">actor · action · entity_id</div><div class="ent-f">prev_hash → hash</div></div>
  <div style="position:absolute;left:0;top:252px;width:160px" class="text-[0.55rem] leading-relaxed">
    <div class="flex items-center gap-2"><span style="width:18px;height:1.5px;background:rgb(143 153 171 / 70%)"></span><span class="muted">foreign key</span></div>
    <div class="flex items-center gap-2"><span style="width:18px;height:0;border-top:1.5px dashed var(--cyan)"></span><span class="muted">reference in JSON</span></div>
    <div class="flex items-center gap-2"><span style="width:18px;height:0;border-top:1.5px dashed var(--emerald)"></span><span class="muted">delivery path</span></div>
    <div class="flex gap-2 mt-1"><span style="color:var(--mint)">■ authoring</span><span style="color:var(--cyan)">■ delivery</span></div>
    <div class="flex gap-2"><span style="color:var(--indigo)">■ runtime</span><span style="color:#f9a8d4">■ access</span></div>
  </div>
</div>
</Rise>

<!--
Documents hold one JSON draft plus immutable revisions: the shape of a show evolves without migrations, and the shared contract validates every revision. Everything that must be queried, joined or locked is relational: revisions, bundles, deployments, desired state, runs, the e-stop latch, the audit chain. A show pins the environment and character revisions it was approved against inside its JSON; that's the dashed line. Production adds tenant_id to every table with row-level security.
-->
---

<Rise><div class="kicker">01 · Design · Data flow</div></Rise>
<Rise :delay="80"><h1>From approval to <span class="serif grad">applause</span></h1></Rise>

<div class="grid grid-cols-6 gap-2 mt-8">
  <div v-click class="glass h-full"><div class="faint text-[0.58rem] uppercase tracking-widest">Engineer</div><h3 class="mt-1">Publish</h3><p>Server re-validates, freezes the revision, compiles the bundle</p></div>
  <div v-click class="glass lit h-full"><div class="faint text-[0.58rem] uppercase tracking-widest">Safety reviewer</div><h3 class="mt-1">Approve</h3><p>Not the author. Signs the exact bytes</p></div>
  <div v-click class="glass h-full"><div class="faint text-[0.58rem] uppercase tracking-widest">Operator</div><h3 class="mt-1">Deploy</h3><p>Pre-check: every device online, right kind, right definition</p></div>
  <div v-click class="glass h-full"><div class="faint text-[0.58rem] uppercase tracking-widest">Controllers</div><h3 class="mt-1">Verify</h3><p>Hash, signature, schema, own limits → <b>good to go</b></p></div>
  <div v-click class="glass h-full"><div class="faint text-[0.58rem] uppercase tracking-widest">Operator · console</div><h3 class="mt-1">Launch</h3><p>Start time = now + lead; every device starts together</p></div>
  <div v-click class="glass lit h-full"><div class="faint text-[0.58rem] uppercase tracking-widest">Guest</div><h3 class="mt-1">Respond</h3><p>Sensor → local show controller → all devices react in sync</p></div>
</div>

<div class="grid grid-cols-6 gap-2 mt-4 items-center">
  <div class="col-span-3"><div class="flow cy"></div><div class="text-[0.6rem] muted mt-1 text-center">in the cloud</div></div>
  <div class="col-span-3"><div class="flow"></div><div class="text-[0.6rem] muted mt-1 text-center">in the park</div></div>
</div>

<Rise :delay="300">
  <div class="glass mt-6 flex items-center gap-4">
    <div class="stat grad !text-xl">Desired state</div>
    <p>The fleet manager knows what each device should hold and keeps nudging it there. Every command carries an id, so resending is always safe; reconnects heal themselves.</p>
  </div>
</Rise>

<!--
Several prepared shows can be staged at once; swap stops one and launches the other. The console's RUN goes through the same checks as the studio.
-->

---

<Rise><div class="kicker">01 · Design · Guardrails</div></Rise>
<Rise :delay="80"><h1>Guardrails at <span class="serif grad">every layer</span></h1></Rise>

<div class="grid grid-cols-3 gap-4 mt-6">
  <Rise :delay="160">
    <div class="glass h-full">
      <div class="flex items-baseline gap-2"><div class="stat grad">35</div><h3>rules while editing</h3></div>
      <p class="mt-1">Same code in the browser, the server and every device.</p>
      <div class="flex flex-wrap gap-1 mt-3">
        <span class="code-chip">motion-velocity-exceeded</span><span class="code-chip">motion-out-of-range</span>
        <span class="code-chip">behavior-blend-too-fast</span><span class="code-chip">placement-in-keep-out</span>
        <span class="code-chip">placement-overlap</span><span class="code-chip">audio-too-loud</span>
        <span class="code-chip">dmx-address-conflict</span><span class="code-chip">motion-not-home-at-end</span>
      </div>
    </div>
  </Rise>
  <Rise :delay="280">
    <div class="glass lit h-full">
      <h3>Before anything moves</h3>
      <ul>
        <li><b>Publish gate</b>: errors block</li>
        <li><b>Four eyes</b>: authors can't approve themselves</li>
        <li><b>Deploy pre-check</b>, all or nothing</li>
        <li><b>Device check</b> against limits it holds itself</li>
        <li><b>Zone clear</b> confirmed at launch</li>
      </ul>
    </div>
  </Rise>
  <Rise :delay="400">
    <div class="glass danger h-full">
      <h3>While running</h3>
      <ul>
        <li>Alarms: device offline, bundle rejected, deploy stuck</li>
        <li><b>E-stop latches</b> until an operator resets it; re-sent on reconnect</li>
        <li>A console mushroom pushed in blocks every reset</li>
        <li>The hardwired safety circuit sits outside all software</li>
      </ul>
    </div>
  </Rise>
</div>

<Rise :delay="520">
  <p class="muted text-sm mt-5">A property-based test generates random shows and proves it: <b class="text-white">if the validator passes, no joint ever exceeds its speed</b>, including blends into sensor responses from any pose.</p>
</Rise>

<!--
Path to certification: HARA/FMEA with the hardware team, IEC 61508 / ISO 13849, ASTM F24 for rides. The validator and the device agent are treated as safety-relevant code.
-->

---

<Rise><div class="kicker">01 · Design · Hardware</div></Rise>
<Rise :delay="80"><h1>Speak the park's <span class="serif grad">protocols</span></h1></Rise>

<div class="grid grid-cols-[1.2fr_1fr] gap-5 mt-6">
  <Rise :delay="160">
    <div class="glass h-full flex flex-col gap-2">
      <div class="kicker !mb-0">Segmented show network · no inbound internet</div>
      <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <div class="node em">Edge gateway<small>bundle cache · show controller</small></div>
        <div class="flow w-8"></div>
        <div class="node">Figure controllers<small>1 kHz loops · own limits</small></div>
        <div class="node">PTP grandmaster<small>shared clock</small></div>
        <div class="flow cy w-8"></div>
        <div class="node">Lighting node<small>DMX universes</small></div>
        <div class="node red">Operator console<small>RUN · RESET · E-STOP</small></div>
        <div class="flow w-8"></div>
        <div class="node">Audio · sensors<small>Dante · digital I/O</small></div>
      </div>
      <div class="glass danger !p-2 mt-1 flex items-center gap-2">
        <span class="chip red">Hardwired</span>
        <p>Mushroom E-STOP → certified safety PLC (PL e / SIL 3, per the risk assessment) → <b>safe torque off</b> on every drive</p>
      </div>
    </div>
  </Rise>
  <Rise :delay="300">
    <div class="glass lit h-full">
      <h3>Standards, not inventions</h3>
      <table class="w-full text-[0.68rem] mt-1"><tbody>
        <tr><td class="py-1 faint">Timing</td><td>PTP (IEEE 1588), SMPTE timecode</td></tr>
        <tr><td class="py-1 faint">Motion</td><td>EtherCAT, CAN</td></tr>
        <tr><td class="py-1 faint">Lighting</td><td>DMX512, Art-Net, sACN · GDTF / MVR</td></tr>
        <tr><td class="py-1 faint">Audio</td><td>Dante, AES67</td></tr>
        <tr><td class="py-1 faint">Show control</td><td>OSC</td></tr>
        <tr><td class="py-1 faint">3D and rigs</td><td>glTF / OpenUSD · URDF</td></tr>
        <tr><td class="py-1 faint">Cloud link</td><td>MQTT or WebSocket over mTLS, outbound only</td></tr>
      </tbody></table>
    </div>
  </Rise>
</div>

<!--
Real-time motion stays on the controllers and drives. We deliver keyframes and limits, never setpoints over the internet.
-->

---

<Rise><div class="kicker">01 · Design · On site</div></Rise>
<Rise :delay="80"><h1>What runs on the <span class="serif grad">devices</span></h1></Rise>
<Rise :delay="160"><p class="lede">Buy proven controllers and certified safety. Own the agent that connects them to the studio.</p></Rise>

<div class="grid grid-cols-3 gap-4 mt-6">
  <Rise :delay="240">
    <div class="glass h-full">
      <div class="kicker !mb-1">Edge gateway · one per attraction</div>
      <h3>Industrial PC, immutable Linux</h3>
      <ul>
        <li>Ubuntu Core or Yocto; A/B updates, secure boot, keys in a TPM</li>
        <li>Containers: uplink, bundle cache, <b>local show controller</b>, MQTT, console backend</li>
        <li>PTP grandmaster or client for the shared clock</li>
      </ul>
    </div>
  </Rise>
  <Rise :delay="360">
    <div class="glass h-full">
      <div class="kicker !mb-1">Controllers · buy proven</div>
      <h3>What parks already trust</h3>
      <ul>
        <li><b>Figures</b>: Beckhoff TwinCAT + EtherCAT servo drives (or the park's Siemens / Rockwell standard); drives hold limits</li>
        <li><b>Safety</b>: certified safety PLC, safe torque off</li>
        <li><b>Lights</b>: the park's console or Pharos / ETC via sACN</li>
        <li><b>Audio</b>: Q-SYS with Dante; limiter in the DSP</li>
      </ul>
    </div>
  </Rise>
  <Rise :delay="480">
    <div class="glass lit h-full">
      <div class="kicker !mb-1">Device agent · we build</div>
      <h3>One contract, small Rust binary</h3>
      <ul>
        <li>Verify, stage, play, report; same behaviour as the twin (shared test vectors)</li>
        <li>Talks <b>ADS / OPC UA</b> to the PLC, sACN to lighting, Dante / Q-SYS to audio</li>
        <li>For new figures we own: real-time Linux with an EtherCAT master</li>
        <li>OTA staged device → zone → park, automatic rollback</li>
      </ul>
    </div>
  </Rise>
</div>

<!--
No inbound ports anywhere on site. Where a park already has show control (Alcorn McBride, Medialon), the agent drives it through timecode / OSC instead of replacing it.
-->

---

<Rise><div class="kicker">01 · Design · Industry</div></Rise>
<Rise :delay="80"><h1>Industry-proven where it <span class="serif grad">moves</span></h1></Rise>
<Rise :delay="160"><p class="lede">Is it the best stack? Below the agent we don't invent; above it nobody offers this end to end.</p></Rise>

<Rise :delay="240">
  <div class="glass mt-5 !p-3">
    <table class="compare w-full text-[0.78rem]"><tbody>
      <tr class="faint"><td>Layer</td><td>Industry standard</td><td>This design</td></tr>
      <tr><td><b class="text-white">Motion</b></td><td class="muted">PLC / IPC (Beckhoff, Siemens, Rockwell) + EtherCAT drives</td><td>Use them; the agent talks ADS / OPC UA</td></tr>
      <tr><td><b class="text-white">Safety</b></td><td class="muted">Certified safety PLC, hardwired e-stop, safe torque off</td><td>Unchanged; software never in the safety path</td></tr>
      <tr><td><b class="text-white">Show control</b></td><td class="muted">Alcorn McBride, Medialon, SMPTE timecode</td><td>Integrate via timecode / OSC; replace only on new builds</td></tr>
      <tr><td><b class="text-white">Lighting · audio</b></td><td class="muted">grandMA / ETC / Pharos over sACN · Q-SYS over Dante</td><td>Output to them; never build consoles</td></tr>
      <tr><td><b class="text-white">Edge and fleet</b></td><td class="muted">Linux IPCs, containers, OTA (Mender, AWS IoT)</td><td>Same; buy the OTA</td></tr>
      <tr><td><b class="text-white">Authoring</b></td><td class="muted">Desktop tools per vendor, files on USB sticks</td><td class="text-white"><b>Cloud studio, review, signed bundles, fleet deploy</b></td></tr>
    </tbody></table>
  </div>
</Rise>

<Rise :delay="360"><p class="muted text-sm mt-4"><span class="text-white">Verdict:</span> proven controllers and certified safety at the bottom; our studio, validator and agent on top. That's where the value and the risk reduction are.</p></Rise>

<!--
Honest answer to "is it the best in industry": building our own motion controllers would not be. The industry-proven path is certified PLCs and drives; our differentiation is the authoring, review and deployment layer, which these vendors don't provide across a fleet.
-->

---

<Rise><div class="kicker">01 · Design · Trust</div></Rise>
<Rise :delay="80"><h1>Who can do <span class="serif grad">what</span>, and proof of it</h1></Rise>

<div class="grid grid-cols-3 gap-4 mt-6">
  <Rise :delay="160">
    <div class="glass h-full">
      <h3>Roles · two layers</h3>
      <p>Workspace role from SSO (engineer, safety, operator, admin) <b>and</b> a project role. Non-members get 404.</p>
      <table class="w-full text-[0.62rem] mt-2 text-center"><tbody>
        <tr class="faint"><td class="text-left"></td><td>owner</td><td>editor</td><td>review</td><td>oper.</td></tr>
        <tr><td class="text-left py-[2px]">Edit</td><td>●</td><td>●</td><td class="faint">·</td><td class="faint">·</td></tr>
        <tr><td class="text-left py-[2px]">Approve</td><td>●</td><td class="faint">·</td><td>●</td><td class="faint">·</td></tr>
        <tr><td class="text-left py-[2px]">Deploy · launch</td><td>●</td><td class="faint">·</td><td class="faint">·</td><td>●</td></tr>
        <tr><td class="text-left py-[2px]">E-stop</td><td>●</td><td>●</td><td>●</td><td>●</td></tr>
      </tbody></table>
    </div>
  </Rise>
  <Rise :delay="280">
    <div class="glass lit h-full">
      <h3>Tenant isolation</h3>
      <ul>
        <li><span class="code-chip">tenant_id</span> on every row + Postgres row-level security</li>
        <li><b>Per-tenant signing keys</b> in KMS</li>
        <li>Per-tenant blob prefixes, IdP and park networks</li>
        <li>Pool by default, dedicated deployment on demand</li>
      </ul>
      <p class="mt-2"><b>The rule that matters:</b> a bundle signed for one tenant can't be staged on another's devices.</p>
    </div>
  </Rise>
  <Rise :delay="400">
    <div class="glass h-full">
      <h3>Audit log · hash-chained</h3>
      <div class="flex flex-col gap-1 mt-2">
        <div class="node !text-[0.62rem]">#41 sam approved and signed r2<small class="mono">prev 9f3a… → c27e…</small></div>
        <div class="node !text-[0.62rem]">#42 olga deployed r2 to Dragon's Hoard<small class="mono">prev c27e… → 51b0…</small></div>
        <div class="node red !text-[0.62rem]">#43 console-01 pressed E-STOP<small class="mono">prev 51b0… → e8d4…</small></div>
      </div>
      <p class="mt-2">Append-only; tampering breaks the chain. People and devices are actors.</p>
    </div>
  </Rise>
</div>

<!--
Approve also needs the workspace "safety" role; deploy and launch need "operator". The UI hides what you can't do but always shows who you are and why an action is disabled.
-->

---

<Rise><div class="kicker">01 · Design · Platform</div></Rise>
<Rise :delay="80"><h1>Built to be <span class="serif grad">changed safely</span></h1></Rise>

<div class="grid grid-cols-3 gap-4 mt-5">
  <Rise :delay="160">
    <div class="glass h-full">
      <h3>Stack</h3>
      <div class="flex flex-wrap gap-1 mt-2">
        <span class="chip">zod contract</span><span class="chip ghost">OpenAPI · AsyncAPI · JSON Schema</span>
        <span class="chip ghost">Bun · Fastify</span><span class="chip ghost">Postgres</span>
        <span class="chip cy">React 19 · three.js</span><span class="chip ghost">TanStack · shadcn</span>
        <span class="chip in">Godot twin</span><span class="chip ghost">Rust device agent</span>
      </div>
      <p class="mt-2">One contract → types and schemas everywhere; CI fails on drift.</p>
    </div>
  </Rise>
  <Rise :delay="280">
    <div class="glass h-full">
      <h3>Cloud (AWS proposal)</h3>
      <ul>
        <li>CloudFront · ECS Fargate (stateless)</li>
        <li>Aurora Postgres · S3 by hash</li>
        <li>KMS signing · IoT Core with device certs</li>
        <li>OpenTelemetry alerts · Terraform</li>
      </ul>
      <p class="mt-1">Portable to GCP or Azure.</p>
    </div>
  </Rise>
  <Rise :delay="400">
    <div class="glass lit h-full">
      <h3>SDLC</h3>
      <ul>
        <li><b>Contract first</b>, trunk-based, ADRs</li>
        <li>Every PR runs the full pipeline below</li>
        <li>Simulator → test bay (HIL) → pilot → all parks</li>
        <li>Safety-relevant code: two approvers</li>
      </ul>
    </div>
  </Rise>
</div>

<Rise :delay="520">
  <div class="glass mt-4 !py-3">
    <div class="faint text-[0.55rem] uppercase tracking-widest mb-2">Every pull request, in CI</div>
    <div class="flex items-center gap-2 flex-wrap">
      <span class="chip ghost">lint · types</span><span class="muted">→</span>
      <span class="chip ghost">contracts current</span><span class="muted">→</span>
      <span class="chip">unit · property · conformance</span><span class="muted">→</span>
      <span class="chip cy">API with simulated devices</span><span class="muted">→</span>
      <span class="chip cy">UI end to end</span><span class="muted">→</span>
      <span class="chip in">Godot as the attraction</span><span class="muted">→</span>
      <span class="chip ghost">image scan</span>
    </div>
    <div class="flow mt-3"></div>
  </div>
</Rise>

<!--
Engineers own quality: there is no separate QA team. The simulators and the hardware-in-the-loop test bay run in CI, so a broken show or protocol change is caught before it reaches a park.
-->

---

<Rise><div class="kicker">01 · Design · Simulation</div></Rise>
<Rise :delay="80"><h1>One layout, <span class="serif grad">many twins</span></h1></Rise>

<div class="grid grid-cols-[1fr_1.15fr] gap-6 mt-6 items-center">
  <div class="flex flex-col gap-2">
    <Rise :delay="160"><div class="node em text-center !py-2">Environment layout<small>one published revision</small></div></Rise>
    <Rise :delay="240"><div class="grid grid-cols-3 gap-2 items-center"><div class="flow"></div><div class="flow"></div><div class="flow"></div></div></Rise>
    <Rise :delay="320">
      <div class="grid grid-cols-3 gap-2">
        <div class="node cy">Studio editor<small>three.js</small></div>
        <div class="node">Validator<small>+ compiler</small></div>
        <div class="node">Provisioning<small>devices + keys</small></div>
      </div>
    </Rise>
    <Rise :delay="400">
      <div class="grid grid-cols-3 gap-2">
        <div class="node in">Godot twin<small>builds the stage</small></div>
        <div class="node in">Headless fleet<small>CI</small></div>
        <div class="node em">Real controllers<small>the park</small></div>
      </div>
    </Rise>
    <Rise :delay="480">
      <div class="glass !p-3 mt-1">
        <p><b>Same math, proven:</b> conformance vectors generated from TypeScript replay in Godot on every build. Shows pin a layout revision, so a twin never runs a different stage than the park.</p>
      </div>
    </Rise>
  </div>
  <Rise :delay="300" :scale="0.96">
    <Shot name="twin" label="Godot twin · Dragon's Hoard" tilt="right" />
  </Rise>
</div>

<!--
The twin is a protocol and visual twin. Dynamics and collisions belong in a robotics simulator (MuJoCo / Isaac) as a later publish gate. Next step: push "layout changed" so the twin re-provisions without a restart.
-->

---
layout: center
---

<Divider n="02" title="Experience" thesis="Two tools for two kinds of people, and a prototype you can watch run." />

---

<Rise><div class="kicker">02 · Experience</div></Rise>
<Rise :delay="80"><h1>Two personas, <span class="serif grad">two tools</span></h1></Rise>

<div class="grid grid-cols-2 gap-10 mt-4 px-6">
  <Rise :delay="180" :x="-24" :y="0">
    <Shot name="show" label="Studio · Animate" tilt="left" />
    <div class="mt-3"><span class="chip cy">Engineer · animator</span></div>
    <p class="muted text-[0.8rem] mt-2">3D stage, a track per joint, light and sound; pose a figure to key it; live validation; sensor responses; simulate a guest.</p>
  </Rise>
  <Rise :delay="320" :x="24" :y="0">
    <Shot name="control" label="Control room · Burrow Hollow" tilt="right" />
    <div class="mt-3"><span class="chip">Operator</span></div>
    <p class="muted text-[0.8rem] mt-2">Big controls only: prepared shows, launch or swap, live floor plan, device health, one e-stop. Mirrored by the console on site.</p>
  </Rise>
</div>

<!--
Keeping the creative tool and the operator tool apart is a product decision: different people, different pressure, different failure modes.
-->

---

<Rise><div class="kicker">02 · Experience · Walkthrough</div></Rise>
<Rise :delay="80"><h1>From figure to park in <span class="serif grad">four steps</span></h1></Rise>

<div class="grid grid-cols-4 gap-4 mt-7">
  <Rise :delay="160"><Shot name="character" label="Characters" /><div class="mt-3 flex items-center gap-2"><span class="chip">1</span><span class="text-sm font-semibold">Upload &amp; refine</span></div><p class="muted text-xs mt-1">GLB + URDF; ranges, speeds, joint tester</p></Rise>
  <Rise :delay="280"><Shot name="layout" label="Layout" /><div class="mt-3 flex items-center gap-2"><span class="chip">2</span><span class="text-sm font-semibold">Describe the attraction</span></div><p class="muted text-xs mt-1">Stage, keep-out zones, lights, audio, sensors, console</p></Rise>
  <Rise :delay="400"><Shot name="responses" label="Animate" /><div class="mt-3 flex items-center gap-2"><span class="chip">3</span><span class="text-sm font-semibold">Choreograph</span></div><p class="muted text-xs mt-1">Motion, light, sound and responses to guests</p></Rise>
  <Rise :delay="520"><Shot name="deploy" label="Deploy" /><div class="mt-3 flex items-center gap-2"><span class="chip">4</span><span class="text-sm font-semibold">Review, deploy, launch</span></div><p class="muted text-xs mt-1">Signed, verified on every controller, good to go</p></Rise>
</div>

<Rise :delay="640">
  <p class="muted text-sm mt-7 text-center">Working prototype, not a mockup. <span class="text-white">Next: the live demo.</span></p>
</Rise>

<!--
If time allows, switch to the live demo: publish a change, approve as Sam, deploy as Olga, press RUN on the console in Godot, walk the guest into the door sensor, press E-STOP.
-->

---

<div class="grid grid-cols-[1fr_1.1fr] gap-8 h-full items-center">
  <div>
    <Rise><span class="live">Live demo · 5 min</span></Rise>
    <Rise :delay="100"><h1 class="!text-[2.6rem] mt-4">Watch it <span class="serif grad">run</span></h1></Rise>
    <Rise :delay="200"><p class="lede">The studio, the fleet manager and a Godot twin of The Dragon's Hoard, deployed to exactly like a park.</p></Rise>
    <Rise :delay="300" :scale="0.96">
      <div class="grid grid-cols-2 gap-3 mt-6">
        <div><Shot name="console" label="RUN · show running" /><div class="chip mt-2">Running 0:12 / 0:45</div></div>
        <div><Shot name="console-estop" label="E-STOP · latched" /><div class="chip red mt-2">E-STOP latched</div></div>
      </div>
    </Rise>
  </div>
  <Rise :delay="200">
    <div class="glass lit">
      <div class="steps">
        <div class="step"><span class="step-n">1</span><div><b>Alice publishes a change</b><p>Live validation; the server re-checks and compiles</p></div></div>
        <div class="step"><span class="step-n">2</span><div><b>Sam reviews the diff and signs</b><p>Real values, four eyes, exact bytes signed</p></div></div>
        <div class="step"><span class="step-n">3</span><div><b>Olga deploys</b><p>13 controllers verify and stage → good to go</p></div></div>
        <div class="step"><span class="step-n">4</span><div><b>RUN on the console in Godot</b><p>Every figure, light and speaker starts together</p></div></div>
        <div class="step"><span class="step-n">5</span><div><b>A guest walks to the door</b><p>The dragon reacts, decided locally in the park</p></div></div>
        <div class="step"><span class="step-n">6</span><div><b>E-STOP</b><p>Everything latches; no reset until the mushroom is twisted out</p></div></div>
      </div>
    </div>
  </Rise>
</div>

<!--
Backup if the network fails: everything runs on the laptop (API, studio, Godot), so no internet is needed. Keep a recorded run as a second backup.
-->

---
layout: center
---

<Divider n="03" title="Team &amp; plan" thesis="A small team, real hardware in six weeks, a park in three months." />

---

<Rise><div class="kicker">03 · Team</div></Rise>
<Rise :delay="80"><h1>A small team, <span class="serif grad">shaped like the architecture</span></h1></Rise>

<div class="grid grid-cols-3 gap-4 mt-6">
  <Rise :delay="160">
    <div class="glass h-full">
      <div class="flex items-center justify-between"><h3>Studio</h3><span class="chip cy">2</span></div>
      <ul class="mt-1">
        <li><b>Senior 3D / WebGL engineer</b>: stage, posing, timeline</li>
        <li><b>Senior frontend engineer</b>: editors, review, control room</li>
      </ul>
    </div>
  </Rise>
  <Rise :delay="260">
    <div class="glass lit h-full">
      <div class="flex items-center justify-between"><h3>Platform</h3><span class="chip">2</span></div>
      <ul class="mt-1">
        <li><b>Staff tech lead</b>: contracts, protocol, safety-relevant core</li>
        <li><b>Senior backend / cloud engineer</b>: API, fleet manager, infrastructure</li>
      </ul>
    </div>
  </Rise>
  <Rise :delay="360">
    <div class="glass h-full">
      <div class="flex items-center justify-between"><h3>Edge</h3><span class="chip in">2</span></div>
      <ul class="mt-1">
        <li><b>Senior embedded real-time engineer</b>: device agent, controllers</li>
        <li><b>Robotics / simulation engineer</b>: twin, motion, test bay</li>
      </ul>
    </div>
  </Rise>
</div>

<div class="grid grid-cols-[1fr_1.4fr] gap-4 mt-4">
  <Rise :delay="460">
    <div class="glass flex items-center gap-4 h-full">
      <div class="stat grad">6 + 1</div>
      <p>engineers plus me. A product designer and a functional-safety owner are shared with the product and hardware organisations.</p>
    </div>
  </Rise>
  <Rise :delay="560">
    <div class="glass h-full">
      <ul>
        <li><b>No separate QA:</b> engineers own quality; simulators and the test bay run in CI</li>
        <li><b>Hire first:</b> the tech lead and the embedded real-time engineer</li>
        <li>Start week 0 with internal transfers or contractors while hiring; scale after the pilot</li>
      </ul>
    </div>
  </Rise>
</div>

<Rise :delay="660">
  <div class="grid grid-cols-3 gap-3 mt-4">
    <div class="glass !p-3 flex items-center gap-3"><span class="step-n">1</span><p><b>Week 0</b> · tech lead, embedded real-time engineer</p></div>
    <div class="glass !p-3 flex items-center gap-3"><span class="step-n">2</span><p><b>Week 2</b> · robotics / simulation engineer, backend / cloud engineer</p></div>
    <div class="glass !p-3 flex items-center gap-3"><span class="step-n">3</span><p><b>Week 4</b> · 3D / WebGL engineer, frontend engineer</p></div>
  </div>
</Rise>

<!--
DRAFT: to confirm. Three surfaces (studio, cloud, edge) each need a senior owner; one staff engineer guards the contracts all three share. Hiring order follows the critical path: hardware people first (the test bay is due in week 4), studio last because the prototype studio already works.
-->

---

<Rise><div class="kicker">03 · Plan</div></Rise>
<Rise :delay="80"><h1>Hardware in six weeks, <span class="serif grad">a park in three months</span></h1></Rise>

<div class="relative mt-7">
  <div class="grid grid-cols-12 gap-2 text-[0.58rem] faint mb-2">
    <span class="col-span-2 border-l border-white/15 pl-1.5">Month 1</span><span class="col-span-2 border-l border-white/15 pl-1.5">Month 2</span><span class="col-span-2 border-l border-white/15 pl-1.5">Month 3</span><span class="col-span-2 border-l border-white/15 pl-1.5">Month 4</span><span class="col-span-2 border-l border-white/15 pl-1.5">Month 5</span><span class="col-span-2 border-l border-white/15 pl-1.5">Month 6</span>
  </div>
  <div class="grid grid-cols-12 gap-2">
    <div v-click class="col-span-3 glass lit">
      <div class="kicker !mb-1">Weeks 1–6</div>
      <h3>Thin slice</h3>
      <p>Controllers ordered in week 0; Rust agent on one; a show published, signed, deployed and played on the <b>test bay</b></p>
    </div>
    <div v-click class="col-span-3 glass">
      <div class="kicker !mb-1">Weeks 7–13</div>
      <h3>Pilot attraction</h3>
      <p>Lights, audio, sensors, edge gateway, console; <b>shadow mode</b> from week 9, <b>guest&#8209;ready</b> by week 13</p>
    </div>
    <div v-click class="col-span-6 glass">
      <div class="kicker !mb-1">Months 4–6</div>
      <h3>Production</h3>
      <p>Second park and tenant, several shows and swap, SSO, alerting, staged OTA. Every release goes simulator → test bay → park</p>
    </div>
  </div>
  <div class="flow mt-3"></div>
</div>

<div class="grid grid-cols-3 gap-4 mt-5">
  <Rise :delay="200"><div class="glass !p-3 flex items-center gap-3"><span class="dot pulse"></span><p><b>Week 6</b> · a show runs on real hardware</p></div></Rise>
  <Rise :delay="300"><div class="glass !p-3 flex items-center gap-3"><span class="dot pulse"></span><p><b>Month 3</b> · pilot ready for guests</p></div></Rise>
  <Rise :delay="400"><div class="glass !p-3 flex items-center gap-3"><span class="dot pulse"></span><p><b>Month 6</b> · a second park live</p></div></Rise>
</div>

<Rise :delay="500">
  <div class="grid grid-cols-3 gap-4 mt-4 text-[0.72rem] leading-snug muted">
    <p class="!leading-snug"><b class="text-white">Why it's possible:</b> month zero exists. The prototype's contracts, simulators and test vectors are the walking skeleton.</p>
    <p class="!leading-snug"><b class="text-white">We adapt, not build:</b> proven controllers and safety PLCs, so hardware work is an adapter, not a product.</p>
    <p class="!leading-snug"><b class="text-white">Safety runs in parallel:</b> the safety owner starts the risk assessment in week 1, not after the build.</p>
  </div>
</Rise>

<!--
DRAFT: to confirm. Incremental, not "everything on first release": each phase ends with something a park can use. Hardware in the loop by week 6 because that's where the surprises are; controllers are ordered in week 0 because drive and safety-PLC lead times can eat the first month. Week 13 is "ready for guests": the opening date belongs to the park's safety acceptance, which is why the risk assessment starts in week 1. Month 6 is a second park, not a fleet: parks need their figures installed, which we don't control.
-->
---

<Rise><div class="kicker">03 · Plan · Trade-offs</div></Rise>
<Rise :delay="80"><h1>Build, buy, and what I'd <span class="serif grad">cut</span></h1></Rise>

<div class="grid grid-cols-4 gap-3 mt-6">
  <Rise :delay="160">
    <div class="glass h-full">
      <h3>Buy</h3>
      <ul>
        <li>Managed cloud: Postgres, object store, IoT broker, KMS</li>
        <li>SSO from the customer's IdP</li>
        <li>Drives, safety PLCs, lighting and audio gear</li>
        <li>Godot for the twin</li>
      </ul>
    </div>
  </Rise>
  <Rise :delay="260">
    <div class="glass lit h-full">
      <h3>Build</h3>
      <ul>
        <li>The studio: 3D editor, timeline, responses</li>
        <li>Validator and signing</li>
        <li>Fleet manager and device agent</li>
      </ul>
      <p class="mt-2">That's the differentiator; the rest is commodity.</p>
    </div>
  </Rise>
  <Rise :delay="360">
    <div class="glass h-full">
      <h3>Depend on hardware</h3>
      <ul>
        <li>Controller interface and limits, agreed in week 2</li>
        <li>Safety PLC and safe torque off</li>
        <li>A test bay by week 4</li>
        <li>Time sync on site</li>
      </ul>
    </div>
  </Rise>
  <Rise :delay="460">
    <div class="glass danger h-full">
      <h3>If the time were halved</h3>
      <ul>
        <li>Keep: safety layers, one attraction</li>
        <li>Cut: multi-tenancy, standby responses, offline packages, co-editing</li>
        <li>Use the park's lighting and audio controllers instead of our nodes</li>
      </ul>
    </div>
  </Rise>
</div>

<Rise :delay="580">
  <div class="glass lit mt-5 text-center !py-4">
    <div class="text-xl font-semibold tracking-tight">Buy what <span class="serif grad">moves</span> and keeps people safe. Build what <span class="serif grad">designs, checks and ships</span> the show.</div>
  </div>
</Rise>

<!--
Build vs buy at the edge: existing show controllers run shows well, but they don't give a versioned, reviewed, fleet-wide studio. We integrate with them rather than replace them.
-->

---

<Rise><div class="kicker">Risks · open questions</div></Rise>
<Rise :delay="80"><h1>Risks I'd manage, <span class="serif grad">questions I'd ask</span></h1></Rise>

<div class="grid grid-cols-2 gap-5 mt-6">
  <Rise :delay="160">
    <div class="glass h-full">
      <h3>Risks</h3>
      <table class="w-full text-[0.76rem] mt-1"><tbody>
        <tr><td class="py-1 pr-2"><b class="text-white">Safety certification</b></td><td class="muted">Safety owner from day one; HARA/FMEA; hardwired stop outside software</td></tr>
        <tr><td class="py-1 pr-2"><b class="text-white">Hardware integration</b></td><td class="muted">Agent as an adapter; protocol agreed in week 2; test bay by week 4</td></tr>
        <tr><td class="py-1 pr-2"><b class="text-white">Sim ≠ real dynamics</b></td><td class="muted">Acceleration and jerk limits; collision gate in a robotics sim; HIL before park</td></tr>
        <tr><td class="py-1 pr-2"><b class="text-white">Creative scope creep</b></td><td class="muted">The pilot attraction defines the MVP; bounded sensor responses</td></tr>
      </tbody></table>
    </div>
  </Rise>
  <Rise :delay="300">
    <div class="glass lit h-full">
      <h3>Open questions</h3>
      <ul>
        <li>Who certifies the system, and against which standard?</li>
        <li>Which controller vendors and protocols are already in the parks?</li>
        <li>How many parks and attractions in year one?</li>
        <li>Do creative teams need real-time co-editing?</li>
        <li>What is success: idea-to-park time, shows per month, zero incidents?</li>
      </ul>
    </div>
  </Rise>
</div>

<!--
Likely follow-ups:
- Network drops mid-show? The show keeps playing from local copies; sensor responses and the e-stop are local.
- One figure faults? It latches and homes; the operator decides whether the show continues or stops (policy per attraction).
- Testing without the park? Godot twin and headless fleet in CI, then the test bay.
- Two engineers edit the same show? Optimistic locking today; per-track co-editing (CRDT) later.
- Firmware changes a joint limit? A new character revision; shows pinned to the old one are flagged and must be re-validated and re-approved.
- How do you measure success? Idea-to-park lead time, deploy success rate, incidents (target zero).
- Who would you hire first? The tech lead and the embedded real-time engineer.
- How did you use AI? Prepare your own answer.
-->

---
layout: center
---

<Divider n="04" title="What's next" thesis="An assistant that drafts shows, and a platform that learns from every run." />

---

<Rise><div class="kicker">04 · Next · AI show assistant</div></Rise>
<Rise :delay="80"><h1>An agent that <span class="serif grad">drafts</span>; people <span class="serif grad">sign</span></h1></Rise>

<div class="grid grid-cols-[1fr_1.05fr] gap-5 mt-4">
  <Rise :delay="160">
    <div class="glass lit h-full flex flex-col gap-3">
      <div>
        <div class="who text-right">Alice · engineer</div>
        <div class="bubble me">When a guest comes through the door, Ember should turn, snarl and blow smoke. Keep it under four seconds.</div>
      </div>
      <div>
        <div class="who">Show assistant</div>
        <div class="bubble ai">Drafted <b>“Ember notices a guest”</b>: neck turn, jaw open, smoke on light-02, snarl on audio-02, 3.6 s. Slowed the neck to <b>42 °/s</b> to stay under its 45 °/s limit. Rehearsed it in the twin: <b>0 issues</b>. It's in your draft for review.<span class="typing"><i></i><i></i><i></i></span></div>
      </div>
      <div class="flex flex-wrap gap-1 mt-auto">
        <span class="chip ghost">“Sync the jaw to this line”</span>
        <span class="chip ghost">“Light cues on the beat”</span>
        <span class="chip ghost">“Why is r4 rejected?”</span>
      </div>
    </div>
  </Rise>
  <div class="flex flex-col gap-2">
    <Rise :delay="260">
      <div class="glass">
        <h3>Its tools are the studio's own API</h3>
        <div class="flex flex-wrap gap-1 mt-2">
          <span class="code-chip">read layout &amp; limits</span><span class="code-chip">add keys &amp; cues</span>
          <span class="code-chip">run the 35 rules</span><span class="code-chip">rehearse in the twin</span>
          <span class="code-chip">diff revisions</span><span class="code-chip">explain an issue</span>
        </div>
      </div>
    </Rise>
    <Rise :delay="360">
      <div class="glass">
        <h3>Guardrails, by design</h3>
        <ul>
          <li>Acts <b>as the person</b>, with their role; can't approve, deploy or launch</li>
          <li>Writes only to a <b>draft</b>; the validator and four eyes still decide</li>
          <li>Every action audited: <span class="code-chip">alice via assistant</span></li>
        </ul>
      </div>
    </Rise>
    <Rise :delay="460">
      <div class="glass !py-2">
        <p><b>Also:</b> a review copilot (“what's riskiest in r4?”) and an operator copilot (“why isn't chest-01 staged?”).</p>
      </div>
    </Rise>
  </div>
</div>

<!--
Built on Claude with tool use: the tools are the same REST endpoints the studio uses, so the agent gets exactly the permissions of the signed-in person. The validator is the safety net; the agent can propose anything and still can't produce a show that moves outside the limits or skips review.
-->

---

<Rise><div class="kicker">04 · Next · Ideas</div></Rise>
<Rise :delay="80"><h1>Where this <span class="serif grad">can go</span></h1></Rise>

<div class="grid grid-cols-3 gap-3 mt-4">
  <Rise :delay="140"><div class="glass h-full"><div class="idea-icon">🎭</div><h3>Phone mocap</h3><p>Film an actor with a phone; pose estimation retargets the motion onto the figure, clamped to its limits.</p></div></Rise>
  <Rise :delay="220"><div class="glass h-full"><div class="idea-icon">🔧</div><h3>Predictive maintenance</h3><p>Motor current, temperature and tracking error from every run flag a tired joint weeks before it fails.</p></div></Rise>
  <Rise :delay="300"><div class="glass lit h-full"><div class="idea-icon">🌗</div><h3>Shows that adapt</h3><p>Queue length, time of day and weather pick a variant; every variant is still pre-approved and signed.</p></div></Rise>
  <Rise :delay="380"><div class="glass h-full"><div class="idea-icon">🥽</div><h3>Walk it before it's built</h3><p>The same twin in VR: creative directors stand in the attraction and sign off on sightlines.</p></div></Rise>
  <Rise :delay="460"><div class="glass h-full"><div class="idea-icon">🎆</div><h3>Park-wide spectaculars</h3><p>One timecode across attractions: a night show where every dragon, light and fountain moves together.</p></div></Rise>
  <Rise :delay="540"><div class="glass h-full"><div class="idea-icon">⚙️</div><h3>Beyond parks</h3><p>The same loop programs robotic cells: limits in the controller, reviewed changes, signed jobs, local execution.</p></div></Rise>
</div>

<Rise :delay="640"><p class="muted text-sm mt-4 text-center">Every idea reuses the same spine: <span class="text-white">versioned definitions, one validator, signed bundles, a twin, an audit trail.</span></p></Rise>

<!--
Pick one or two to talk about depending on the room. Predictive maintenance and adaptive shows are the most valuable for park operations; "beyond parks" is the link to robotic manufacturing.
-->

---
layout: center
---

<Backdrop name="twin" :opacity="0.22" />

<div class="relative z-10 text-center max-w-[44rem] mx-auto">
  <Rise><div class="kicker justify-center">One loop</div></Rise>
  <Rise :delay="120"><h1 class="!text-[2.6rem]">Design → validate → sign → deploy → <span class="serif grad">run with sensors</span></h1></Rise>
  <Rise :delay="280"><p class="lede mx-auto mt-3">The same loop runs a robotic manufacturing cell: limits in the controller, reviewed changes, signed artifacts, local execution, a human on the stop button.</p></Rise>
  <Rise :delay="440"><div class="mt-10 text-2xl serif grad">Thank you</div></Rise>
</div>

<!--
Close on the transferable idea. Then questions.
-->
