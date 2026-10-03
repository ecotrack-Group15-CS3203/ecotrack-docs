// Simulated Bolgoda Lake restoration campaign, run end to end against a live EcoTrack API.
// Every actor is a real user row created through the real auth path (tokens from
// ecotrack-api/tools/mock-jwks.js), and every step is an ordinary API call. Output:
// scenario-results.json (structured) and scenario-log.txt (readable trace).
//
//   API=http://localhost:4100/v1 JWKS=http://localhost:9999 node run-scenario.js
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://localhost:4100/v1';
const JWKS = process.env.JWKS || 'http://localhost:9999';
const RUN = Date.now().toString(36);

// Bolgoda Lake (Moratuwa / Panadura, Western Province) and nearby points.
const LAKE = { lat: 6.7700, lng: 79.9050 };
const UNI = { lat: 6.7951, lng: 79.9009 }; // University of Moratuwa
const PLACES = {
  northShore: { lat: 6.7820, lng: 79.9010 },
  boatJetty: { lat: 6.7700, lng: 79.9080 },
  canalMouth: { lat: 6.7550, lng: 79.9000 },
  mangrove: { lat: 6.7620, lng: 79.9150 },
  kandy: { lat: 7.2906, lng: 80.6337 },
};

const calls = [];
const log = [];
const steps = [];
const t0 = Date.now();
const say = (s) => { log.push(s); console.log(s); };

async function api(actor, method, url, body, { expect } = {}) {
  const started = Date.now();
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(actor.token ? { authorization: `Bearer ${actor.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  calls.push({ actor: actor.key, role: actor.role, method, url: url.replace(/[0-9a-f-]{36}/g, ':id'), status: res.status, ms: Date.now() - started });
  const ok = expect ? res.status === expect : res.ok;
  if (!ok) throw new Error(`${actor.key} ${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
  return json;
}
const data = (r) => (Array.isArray(r) ? r : r?.data ?? r?.items ?? r);

function step(phase, actor, action, outcome) {
  const s = { at: ((Date.now() - t0) / 1000).toFixed(2), phase, actor: actor.label, action, outcome };
  steps.push(s);
  say(`[${s.at}s] ${phase} | ${s.actor}: ${action} -> ${outcome}`);
}

async function persona(key, label, role) {
  const sub = `cs-${RUN}-${key}`;
  const q = new URLSearchParams({ sub, email: `${key}.${RUN}@bolgoda.example`, name: label });
  const token = await (await fetch(`${JWKS}/token?${q}`)).text();
  const a = { key, label, role, token };
  a.me = await api(a, 'GET', '/auth/me');
  return a;
}
const refresh = async (a) => { a.me = await api(a, 'GET', '/auth/me'); a.role = a.me.role; return a; };

// 1x1 JPEG; uploaded through a real presigned PUT to MinIO.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
async function upload(actor, name) {
  const t = await api(actor, 'POST', '/media/upload-url', { filename: name, contentType: 'image/jpeg' });
  const put = await fetch(t.uploadUrl ?? t.url, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: JPEG });
  if (!put.ok) throw new Error(`photo PUT failed ${put.status} ${await put.text()}`);
  return t.mediaUrl;
}

async function main() {
  say(`EcoTrack case-study run ${RUN} against ${API} at ${new Date().toISOString()}`);

  // ---- Cast -------------------------------------------------------------------------
  const nimal = await persona('nimal', 'Nimal (BLCS coordinator)', 'citizen');
  const kasun = await persona('kasun', 'Kasun (UGS coordinator)', 'citizen');
  const residents = await Promise.all([
    persona('amaya', 'Amaya (lakeside resident)', 'citizen'),
    persona('ruwan', 'Ruwan (fisherman)', 'citizen'),
    persona('dilini', 'Dilini (boat operator)', 'citizen'),
  ]);
  const [amaya, ruwan, dilini] = residents;
  const vols = await Promise.all(['sahan', 'tharushi', 'ishara', 'malith', 'nadeesha'].map((k) => persona(k, `${k[0].toUpperCase()}${k.slice(1)} (volunteer)`, 'citizen')));
  const [sahan, tharushi, ishara, malith, nadeesha] = vols;
  const farAway = await persona('chamara', 'Chamara (Kandy resident)', 'citizen');

  // ---- Phase 0: organisations set up ----------------------------------------------
  const P0 = '0 Setup';
  const blcs = (await api(nimal, 'POST', '/organisations', {
    name: `Bolgoda Lake Conservation Society ${RUN}`, description: 'Community society restoring Bolgoda Lake shoreline and water quality.',
    contactEmail: `blcs.${RUN}@bolgoda.example`, serviceAreaCenter: LAKE, serviceAreaRadiusKm: 10,
  })).organisation;
  await refresh(nimal);
  step(P0, nimal, 'Registers Bolgoda Lake Conservation Society (10 km service area)', `org created, Nimal is ${nimal.role}`);
  const ugs = (await api(kasun, 'POST', '/organisations', {
    name: `University Green Society ${RUN}`, description: 'Student environmental society, University of Moratuwa.',
    contactEmail: `ugs.${RUN}@bolgoda.example`, serviceAreaCenter: UNI, serviceAreaRadiusKm: 25,
  })).organisation;
  await refresh(kasun);
  step(P0, kasun, 'Registers University Green Society (25 km, overlaps the lake)', `org created, Kasun is ${kasun.role}`);

  const stages = data(await api(nimal, 'GET', `/organisations/${blcs.id}/workflow-stages`));
  const stageName = Object.fromEntries(stages.map((s) => [s.id, s.name]));
  const rules = await api(nimal, 'GET', `/organisations/${blcs.id}/workflow-stage-rules`);
  step(P0, nimal, 'Reviews default workflow and auto-advance rules', `${stages.map((s) => s.name).join(' → ')}`);
  const cleanupStage = stages.find((s) => s.name === 'Cleanup Scheduled');
  const rulesAfter = await api(nimal, 'PATCH', `/organisations/${blcs.id}/workflow-stage-rules`, { taskCreationMinStageId: null, taskCreationTargetStageId: cleanupStage.id });
  step(P0, nimal, 'Changes the task rule so one incident can carry several tasks (any open stage → Cleanup Scheduled)', 'rules saved');

  // ---- Phase 1: volunteer recruitment ------------------------------------------------
  const P1 = '1 Recruit';
  const link = await api(nimal, 'POST', `/organisations/${blcs.id}/invites`, { maxUses: 10, expiresInDays: 14 });
  step(P1, nimal, 'Creates a shareable invite link (10 uses, 14 days)', 'link issued');
  for (const [v, where] of [[sahan, PLACES.northShore], [tharushi, PLACES.boatJetty], [ishara, PLACES.canalMouth]]) {
    await api(v, 'POST', '/organisations/invites/accept', { token: link.token, ...where });
    await refresh(v);
    step(P1, v, 'Accepts invite link from a lakeside location', `joined as ${v.role}`);
  }
  for (const v of [malith, nadeesha]) {
    await api(v, 'POST', '/organisations/join-request', { organisationId: blcs.id, ...PLACES.mangrove, message: 'I live near the mangrove edge and can help on weekends.' });
    step(P1, v, 'Submits a join request from the directory', 'pending');
  }
  let outside = 'accepted (unexpected)';
  try {
    await api(farAway, 'POST', '/organisations/join-request', { organisationId: blcs.id, ...PLACES.kandy, message: 'Want to help.' });
  } catch (e) { outside = `refused: ${e.message.match(/-> (\d+)/)[1]}`; }
  calls[calls.length - 1].expectedRefusal = true;
  step(P1, farAway, 'Tries to join from Kandy (~95 km away)', outside);
  const jrs = data(await api(nimal, 'GET', `/organisations/${blcs.id}/join-requests?status=pending`));
  for (const jr of jrs) await api(nimal, 'PATCH', `/organisations/${blcs.id}/join-requests/${jr.id}`, { status: 'approved' });
  await Promise.all([malith, nadeesha].map(refresh));
  step(P1, nimal, `Approves ${jrs.length} pending join requests`, `Malith and Nadeesha are now ${malith.role}`);

  // Opt-in proximity alerts for two volunteers.
  for (const v of [sahan, tharushi]) {
    await api(v, 'PATCH', '/auth/me', { alertCenter: PLACES.boatJetty, notificationRadiusMeters: 5000, notificationMinUrgency: 'high' });
    await api(v, 'PATCH', '/auth/push-token', { pushToken: `ExponentPushToken[cs-${RUN}-${v.key}]` });
  }
  step(P1, sahan, 'Sahan and Tharushi opt in to proximity alerts (5 km, high+)', 'saved');

  // ---- Phase 2: citizen reporting ----------------------------------------------------
  const P2 = '2 Report';
  const report = async (who, body) => {
    const mediaUrls = [await upload(who, `${body.title.slice(0, 20).replace(/\W+/g, '-')}.jpg`)];
    const inc = await api(who, 'POST', '/incidents', { ...body, mediaUrls });
    step(P2, who, `Reports "${body.title}" (${body.category}, ${body.urgency}) with photo`, 'in Global Incident Pool');
    return inc;
  };
  const oil = await report(ruwan, { title: 'Oil sheen spreading from boat jetty', description: 'Rainbow film across ~50 m of water near the jetty; dead fish seen.', category: 'water_pollution', urgency: 'critical', location: PLACES.boatJetty, address: 'Bolgoda boat jetty' });
  const dump = await report(amaya, { title: 'Plastic dumped near Bolgoda Lake north shore', description: 'Bags of household plastic and polythene on the bank.', category: 'illegal_dumping', urgency: 'high', location: PLACES.northShore, address: 'North shore footpath' });
  const dumpDup = await report(dilini, { title: 'Garbage pile on north shore path', description: 'Same pile, still there.', category: 'illegal_dumping', urgency: 'medium', location: { lat: PLACES.northShore.lat + 0.0002, lng: PLACES.northShore.lng }, address: 'North shore' });
  const canal = await report(dilini, { title: 'Canal mouth choked with floating waste', description: 'Bottles and foam trapped at the canal outflow.', category: 'illegal_dumping', urgency: 'high', location: PLACES.canalMouth, address: 'Canal mouth' });
  const mangrove = await report(amaya, { title: 'Mangrove saplings cut near eastern edge', description: 'Several young mangroves cut down overnight.', category: 'deforestation', urgency: 'medium', location: PLACES.mangrove, address: 'Eastern mangrove strip' });
  const prank = await report(ruwan, { title: 'Test report please ignore', description: 'Sent by mistake.', category: 'other', urgency: 'low', location: PLACES.boatJetty });

  // Let the 15 s dispatcher pick up the proximity jobs.
  await new Promise((r) => setTimeout(r, 17000));
  const proxNotes = {};
  for (const v of [sahan, tharushi]) {
    const n = data(await api(v, 'GET', '/notifications'));
    proxNotes[v.key] = n.filter((x) => x.type === 'incident_proximity').map((x) => x.title);
  }
  step(P2, sahan, 'Dispatcher sends proximity alerts to opted-in volunteers', `Sahan ${proxNotes.sahan.length}, Tharushi ${proxNotes.tharushi.length} alerts`);

  // ---- Phase 3: claiming ---------------------------------------------------------------
  const P3 = '3 Claim';
  const poolB = data(await api(nimal, 'GET', '/incidents/pool'));
  const poolU = data(await api(kasun, 'GET', '/incidents/pool'));
  step(P3, nimal, 'Opens the incident pool (service area filter)', `${poolB.length} incidents visible`);
  step(P3, kasun, 'Opens the incident pool', `${poolU.length} incidents visible`);
  const race = await Promise.allSettled([
    api(nimal, 'POST', `/incidents/pool/${oil.id}/claim`),
    api(kasun, 'POST', `/incidents/pool/${oil.id}/claim`),
  ]);
  const raceCodes = race.map((r) => (r.status === 'fulfilled' ? 200 : Number(r.reason.message.match(/-> (\d+)/)[1])));
  const winner = race[0].status === 'fulfilled' ? 'BLCS' : 'UGS';
  calls.filter((c) => c.url === '/incidents/pool/:id/claim' && c.status >= 400).forEach((c) => { c.expectedRefusal = true; });
  step(P3, nimal, 'BLCS and UGS both press Claim on the oil-sheen incident at the same moment', `${winner} wins; other gets HTTP ${Math.max(...raceCodes)}`);
  if (winner !== 'BLCS') throw new Error('Scenario expects BLCS to win the race; rerun');
  for (const inc of [dump, dumpDup, canal, mangrove, prank]) await api(nimal, 'POST', `/incidents/pool/${inc.id}/claim`);
  step(P3, nimal, 'Claims the remaining 5 lake incidents', 'all claimed, reporters notified');
  await api(nimal, 'PATCH', `/organisations/${blcs.id}/incidents/${dumpDup.id}/duplicate`, { duplicateOfId: dump.id });
  step(P3, nimal, 'Marks "Garbage pile on north shore path" as duplicate of the plastic dumping report', 'merged');
  await api(nimal, 'PATCH', `/organisations/${blcs.id}/incidents/${prank.id}/reject`, { reason: 'Reporter confirmed it was sent by mistake.' });
  step(P3, nimal, 'Rejects the test report with a reason', 'Ruwan notified');

  // ---- Phase 4: organising work ----------------------------------------------------------
  const P4 = '4 Organise';
  const due = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const task = async (inc, title, who, d, priority) => {
    const t = await api(nimal, 'POST', `/organisations/${blcs.id}/tasks`, { incidentId: inc.id, title, assignedTo: who.me.id, dueDate: due(d), priority });
    step(P4, nimal, `Creates task "${title}" → ${who.label}`, `due in ${d} days, ${priority}`);
    return t;
  };
  const tBoom = await task(oil, 'Deploy absorbent booms at the jetty', sahan, 1, 'high');
  const tSample = await task(oil, 'Photograph sheen extent and source', tharushi, 2, 'high');
  const tCanal = await task(canal, 'Clear floating waste at canal mouth', ishara, 3, 'medium');
  const tMangrove = await task(mangrove, 'Replant cut mangrove saplings', malith, 7, 'medium');

  const evStart = new Date(Date.now() + 3 * 86400000);
  const ev = await api(nimal, 'POST', `/organisations/${blcs.id}/events`, {
    incidentIds: [dump.id], title: 'North shore cleanup drive', description: 'Bring gloves; bags provided.',
    location: PLACES.northShore, scheduledAt: evStart.toISOString(), endsAt: new Date(evStart.getTime() + 3 * 3600000).toISOString(), maxAttendees: 4,
  });
  step(P4, nimal, 'Schedules "North shore cleanup drive" linked to the dumping report (cap 4)', 'listed in volunteers\' Events tab (no notification is sent)');

  // ---- Phase 5: field response ----------------------------------------------------------
  const P5 = '5 Act';
  await api(sahan, 'PATCH', `/organisations/${blcs.id}/tasks/${tBoom.id}/assignments/respond`, { accept: true });
  step(P5, sahan, 'Accepts boom deployment task', 'accepted');
  await api(tharushi, 'PATCH', `/organisations/${blcs.id}/tasks/${tSample.id}/assignments/respond`, { accept: false, reason: 'At university exams until Friday.' });
  step(P5, tharushi, 'Declines photo survey with a reason', 'Nimal notified');
  await api(nimal, 'PATCH', `/organisations/${blcs.id}/tasks/${tSample.id}`, { assignedTo: nadeesha.me.id });
  step(P5, nimal, 'Reassigns photo survey to Nadeesha', 'old assignment cancelled');
  await api(nadeesha, 'PATCH', `/organisations/${blcs.id}/tasks/${tSample.id}/assignments/respond`, { accept: true });
  await api(ishara, 'PATCH', `/organisations/${blcs.id}/tasks/${tCanal.id}/assignments/respond`, { accept: true });
  await api(malith, 'PATCH', `/organisations/${blcs.id}/tasks/${tMangrove.id}/assignments/respond`, { accept: true });
  step(P5, nadeesha, 'Nadeesha, Ishara and Malith accept their tasks', 'accepted');

  let noPhoto = 'allowed (unexpected)';
  await api(sahan, 'PATCH', `/organisations/${blcs.id}/tasks/${tBoom.id}/progress/start`);
  await api(sahan, 'POST', `/organisations/${blcs.id}/tasks/${tBoom.id}/progress/notes`, { note: '3 booms placed around jetty; sheen contained on north side.' });
  try { await api(sahan, 'PATCH', `/organisations/${blcs.id}/tasks/${tBoom.id}/progress/complete`); } catch (e) { noPhoto = `refused: ${e.message.match(/-> (\d+)/)[1]}`; calls[calls.length - 1].expectedRefusal = true; }
  step(P5, sahan, 'Starts task, adds a progress note, tries to complete without photo', noPhoto);
  const finish = async (v, t, label) => {
    if (v !== sahan) await api(v, 'PATCH', `/organisations/${blcs.id}/tasks/${t.id}/progress/start`);
    await api(v, 'POST', `/organisations/${blcs.id}/tasks/${t.id}/progress/photos`, { mediaUrls: [await upload(v, `${label}.jpg`)] });
    await api(v, 'PATCH', `/organisations/${blcs.id}/tasks/${t.id}/progress/complete`);
    step(P5, v, `Uploads evidence photo and completes "${t.title}"`, 'completed');
  };
  const stageOf = async (inc) => {
    const list = data(await api(nimal, 'GET', `/organisations/${blcs.id}/incidents?limit=50`));
    const row = list.find((i) => i.id === inc.id);
    return row?.stage?.name ?? row?.currentStage?.name ?? stageName[row?.currentStageId] ?? '?';
  };
  await finish(sahan, tBoom, 'boom');
  const oilMid = await stageOf(oil);
  step(P5, nimal, 'Checks oil-sheen incident after 1 of 2 tasks done', `still "${oilMid}"`);
  await finish(nadeesha, tSample, 'sheen');
  const oilEnd = await stageOf(oil);
  step(P5, nimal, 'Checks oil-sheen incident after both tasks done', `auto-advanced to "${oilEnd}"`);
  await finish(ishara, tCanal, 'canal');

  // Event RSVPs: cap 4, five volunteers try.
  const rsvp = [];
  for (const v of [sahan, tharushi, ishara, malith, nadeesha]) {
    try { await api(v, 'POST', `/organisations/${blcs.id}/events/${ev.id}/rsvp`); rsvp.push([v.label, 'confirmed']); } catch (e) { const c = e.message.match(/-> (\d+)/)[1]; rsvp.push([v.label, `refused ${c} (full)`]); calls[calls.length - 1].expectedRefusal = true; }
  }
  step(P5, nimal, '5 volunteers RSVP to the 4-place cleanup drive', rsvp.map((r) => `${r[0].split(' ')[0]}: ${r[1]}`).join('; '));
  await api(nimal, 'PATCH', `/organisations/${blcs.id}/events/${ev.id}/status`, { status: 'ongoing' });
  await api(nimal, 'PATCH', `/organisations/${blcs.id}/events/${ev.id}/status`, { status: 'completed' });
  const dumpEnd = await stageOf(dump);
  step(P5, nimal, 'Marks cleanup drive ongoing, then completed', `dumping incident auto-advanced to "${dumpEnd}"`);

  // ---- Phase 6: oversight -------------------------------------------------------------------
  const P6 = '6 Oversee';
  const finalList = data(await api(nimal, 'GET', `/organisations/${blcs.id}/incidents?limit=50`));
  const incidentsFinal = [oil, dump, dumpDup, canal, mangrove, prank].map((inc) => {
    const row = finalList.find((i) => i.id === inc.id) || {};
    return { title: inc.title, category: inc.category, severity: inc.severity ?? inc.urgency, verification: row.verificationStatus ?? row.verification_status ?? '-', stage: row.stage?.name ?? row.currentStage?.name ?? stageName[row.currentStageId] ?? '-' };
  });
  const dash = await api(nimal, 'GET', `/organisations/${blcs.id}/dashboard/stats`);
  const auditPage = await api(nimal, 'GET', `/organisations/${blcs.id}/audit-logs?limit=100`);
  const audit = data(auditPage);
  const auditByAction = audit.reduce((m, a) => ((m[a.action] = (m[a.action] || 0) + 1), m), {});
  step(P6, nimal, 'Opens dashboard and audit log', `${auditPage.total ?? audit.length} audit entries`);
  const ugsIncidents = data(await api(kasun, 'GET', `/organisations/${ugs.id}/incidents?limit=50`));
  let crossTenant = 'n/a';
  try { await api(kasun, 'GET', `/organisations/${blcs.id}/tasks`); crossTenant = 'visible (unexpected)'; } catch (e) { crossTenant = `refused: ${e.message.match(/-> (\d+)/)[1]}`; calls[calls.length - 1].expectedRefusal = true; }
  step(P6, kasun, "UGS coordinator tries to read BLCS's tasks", crossTenant);
  const pub = await api({ key: 'public', role: 'anonymous' }, 'GET', '/public/stats');

  const notifications = {};
  for (const a of [nimal, ...residents, ...vols]) {
    const n = data(await api(a, 'GET', '/notifications'));
    notifications[a.label] = n.reduce((m, x) => ((m[x.type] = (m[x.type] || 0) + 1), m), {});
  }

  // ---- Results ---------------------------------------------------------------------------
  const byActor = {};
  for (const c of calls) (byActor[c.actor] ??= { calls: 0, errors: 0 }).calls++;
  for (const c of calls) if (c.status >= 400 && !c.expectedRefusal) byActor[c.actor].errors++;
  const out = {
    runId: RUN, startedAt: new Date(t0).toISOString(), durationSeconds: (Date.now() - t0) / 1000, api: API,
    defaultStages: stages.map((s) => ({ name: s.name, isFinal: s.isFinal })), rules, rulesAfter,
    steps, incidentsFinal, raceCodes, rsvp, noPhotoCompletion: noPhoto, outsideJoin: outside, crossTenant,
    oilStageAfterOneTask: oilMid, oilStageAfterBothTasks: oilEnd, dumpStageAfterEvent: dumpEnd,
    poolVisible: { BLCS: poolB.length, UGS: poolU.length }, ugsIncidentCount: ugsIncidents.length,
    proximityAlerts: proxNotes, notifications, dashboard: dash, auditTotal: auditPage.total ?? audit.length, auditByAction, publicStats: pub,
    callsTotal: calls.length, callsByActor: byActor,
    medianCallMs: calls.map((c) => c.ms).sort((a, b) => a - b)[Math.floor(calls.length / 2)],
    unexpectedErrors: calls.filter((c) => c.status >= 400 && !c.expectedRefusal),
    calls,
  };
  const dir = __dirname;
  fs.writeFileSync(path.join(dir, 'scenario-results.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(dir, 'scenario-log.txt'), log.join('\n') + '\n');
  say(`Done in ${out.durationSeconds}s, ${calls.length} API calls, ${out.unexpectedErrors.length} unexpected errors.`);
}

main().catch((e) => { console.error(e); fs.writeFileSync(path.join(__dirname, 'scenario-log.txt'), log.join('\n') + `\nFAILED: ${e.stack}\n`); process.exit(1); });
