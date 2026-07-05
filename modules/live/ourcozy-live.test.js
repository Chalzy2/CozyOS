'use strict';

/**
 * Regression test suite for core/modules/live/ourcozy-live.js
 * Covers v1.0.0 (base orchestration), v1.1.0 (streams/speakers/cameras/
 * displays/devices/attendance/plugins/timeline), and v1.2.0 (event graph,
 * venue digital twin, service registry, accessibility/preferences,
 * Hardware Capability Profile) in one consolidated suite.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createOurCozyLive,
  EVENT_TYPES,
  KNOWN_SUBSYSTEMS,
  HOST_TYPES,
  PERMISSIONS,
  ERROR_CODES,
  STREAM_STATUSES,
  DEVICE_TYPES,
  DISPLAY_TYPES,
  ATTENDANCE_METHODS,
  VENUE_KINDS,
  VENUE_FEATURE_TYPES,
  DEVICE_HEALTH_STATUSES,
  CozyLiveError
} = require('../../core/modules/live/ourcozy-live.js');

function makeFullSession(engine) {
  const session = engine.createSession({ title: 'Sunday Service', primaryLanguage: 'sw' });
  engine.startSession(session.id);
  const room = engine.createRoom(session.id, { name: 'Main Sanctuary' });
  return { session, room };
}

/* ------------------------------------------------------------------ */
/* METADATA / VERSION                                                   */
/* ------------------------------------------------------------------ */

test('module exposes frozen metadata and version', () => {
  const engine = createOurCozyLive();
  assert.equal(typeof engine.getVersion(), 'string');
  const meta = engine.getMetadata();
  assert.equal(meta.isMediaEngine, false);
  assert.equal(meta.isTranslationEngine, false);
  assert.throws(() => {
    meta.isMediaEngine = true;
  });
});

test('public API object is frozen and cannot be extended or reassigned', () => {
  const engine = createOurCozyLive();
  assert.ok(Object.isFrozen(engine));
  assert.throws(() => {
    engine.createSession = () => {};
  }, TypeError);
});

/* ------------------------------------------------------------------ */
/* SESSION LIFECYCLE                                                    */
/* ------------------------------------------------------------------ */

test('createSession requires a non-empty title', () => {
  const engine = createOurCozyLive();
  assert.throws(() => engine.createSession({}), CozyLiveError);
  assert.throws(() => engine.createSession({ title: '   ' }), CozyLiveError);
});

test('createSession rejects secret-like metadata fields', () => {
  const engine = createOurCozyLive();
  assert.throws(
    () => engine.createSession({ title: 'X', metadata: { apiKey: 'abc' } }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.FORBIDDEN
  );
});

test('full session lifecycle: create -> start -> stop -> end', () => {
  const engine = createOurCozyLive();
  const events = [];
  engine.on(EVENT_TYPES.SESSION_CREATED, (p) => events.push(p.eventType));
  engine.on(EVENT_TYPES.SESSION_STARTED, (p) => events.push(p.eventType));
  engine.on(EVENT_TYPES.SESSION_STOPPED, (p) => events.push(p.eventType));
  engine.on(EVENT_TYPES.SESSION_ENDED, (p) => events.push(p.eventType));

  const session = engine.createSession({ title: 'Evening Service' });
  assert.equal(session.state, 'CREATED');

  const started = engine.startSession(session.id);
  assert.equal(started.state, 'STARTED');

  const stopped = engine.stopSession(session.id);
  assert.equal(stopped.state, 'STOPPED');

  const ended = engine.endSession(session.id);
  assert.equal(ended, true);
  assert.throws(() => engine.getSession(session.id), CozyLiveError);

  assert.deepEqual(events, [
    EVENT_TYPES.SESSION_CREATED,
    EVENT_TYPES.SESSION_STARTED,
    EVENT_TYPES.SESSION_STOPPED,
    EVENT_TYPES.SESSION_ENDED
  ]);
});

test('cannot start an already-started session', () => {
  const engine = createOurCozyLive();
  const session = engine.createSession({ title: 'X' });
  engine.startSession(session.id);
  assert.throws(
    () => engine.startSession(session.id),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.INVALID_STATE
  );
});

test('cannot stop a session that was never started', () => {
  const engine = createOurCozyLive();
  const session = engine.createSession({ title: 'X' });
  assert.throws(
    () => engine.stopSession(session.id),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.INVALID_STATE
  );
});

test('getSession/listSessions return frozen, non-live snapshots', () => {
  const engine = createOurCozyLive();
  const session = engine.createSession({ title: 'X' });
  const fetched = engine.getSession(session.id);
  assert.ok(Object.isFrozen(fetched));
  assert.throws(() => {
    fetched.title = 'mutated';
  });
  // mutating the returned snapshot must never affect internal state
  const list = engine.listSessions();
  assert.equal(list.length, 1);
  assert.ok(Object.isFrozen(list));
});

/* ------------------------------------------------------------------ */
/* PARTICIPANTS                                                         */
/* ------------------------------------------------------------------ */

test('joinSession / leaveSession lifecycle with events', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const joined = [];
  const left = [];
  engine.on(EVENT_TYPES.PARTICIPANT_JOINED, (p) => joined.push(p.participant.id));
  engine.on(EVENT_TYPES.PARTICIPANT_LEFT, (p) => left.push(p.participant.id));

  const p1 = engine.joinSession(session.id, { id: 'user-1', languageCode: 'en' });
  assert.equal(p1.languageCode, 'en');
  assert.equal(engine.listParticipants(session.id).length, 1);

  assert.throws(
    () => engine.joinSession(session.id, { id: 'user-1' }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.ALREADY_EXISTS
  );

  engine.leaveSession(session.id, 'user-1');
  assert.equal(engine.listParticipants(session.id).length, 0);
  assert.deepEqual(joined, ['user-1']);
  assert.deepEqual(left, ['user-1']);
});

test('joinSession rejects participant payloads carrying secret-like fields', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  assert.throws(
    () => engine.joinSession(session.id, { id: 'u1', authToken: 'xyz' }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.FORBIDDEN
  );
});

test('updateParticipantLanguage updates state and emits both LANGUAGE_CHANGED and PARTICIPANT_LANGUAGE_CHANGED', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'u1', languageCode: 'en' });

  const seen = [];
  engine.on(EVENT_TYPES.LANGUAGE_CHANGED, (p) => seen.push('LANGUAGE_CHANGED'));
  engine.on(EVENT_TYPES.PARTICIPANT_LANGUAGE_CHANGED, (p) => seen.push('PARTICIPANT_LANGUAGE_CHANGED'));

  const updated = engine.updateParticipantLanguage(session.id, 'u1', 'fr');
  assert.equal(updated.languageCode, 'fr');
  assert.deepEqual(seen.sort(), ['LANGUAGE_CHANGED', 'PARTICIPANT_LANGUAGE_CHANGED'].sort());
});

test('assignParticipantToRoom validates the room exists', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'u1' });
  assert.throws(
    () => engine.assignParticipantToRoom(session.id, 'u1', 'nonexistent-room'),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.NOT_FOUND
  );
});

/* ------------------------------------------------------------------ */
/* ROOMS / ZONES                                                        */
/* ------------------------------------------------------------------ */

test('rooms can be assigned to zones and updated', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const zone = engine.createZone(session.id, { name: 'Zone A' });
  const room = engine.createRoom(session.id, { name: 'Arabic Room', zoneId: zone.id });
  assert.equal(room.zoneId, zone.id);

  const updated = engine.updateRoom(session.id, room.id, { name: 'Arabic Room (Overflow)' });
  assert.equal(updated.name, 'Arabic Room (Overflow)');
});

test('createRoom rejects an unknown zoneId', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  assert.throws(
    () => engine.createRoom(session.id, { name: 'X', zoneId: 'no-such-zone' }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.NOT_FOUND
  );
});

test('removeZone clears zoneId on rooms that referenced it, without deleting the rooms', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const zone = engine.createZone(session.id, { name: 'Zone A' });
  const room = engine.createRoom(session.id, { name: 'French Room', zoneId: zone.id });

  engine.removeZone(session.id, zone.id);
  const refetched = engine.getRoom(session.id, room.id);
  assert.equal(refetched.zoneId, null);
});

test('removeRoom cascades to language/audio/subtitle channels', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const lang = engine.createLanguageChannel(session.id, room.id, 'fr');
  const audio = engine.createAudioChannel(session.id, room.id, lang.id);
  const subs = engine.createSubtitleChannel(session.id, room.id, lang.id);

  engine.removeRoom(session.id, room.id);

  assert.throws(() => engine.getRoom(session.id, room.id), CozyLiveError);
  // channel lookups keyed by the now-orphaned ids must come back empty, not throw
  assert.equal(engine.listAudioChannels(lang.id).length, 0);
  assert.equal(engine.listSubtitleChannels(lang.id).length, 0);
});

/* ------------------------------------------------------------------ */
/* LANGUAGE / AUDIO / SUBTITLE CHANNELS                                 */
/* ------------------------------------------------------------------ */

test('language channel + audio + subtitle channel creation and listing', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const lang = engine.createLanguageChannel(session.id, room.id, 'ar');
  assert.equal(lang.languageCode, 'ar');

  const audio = engine.createAudioChannel(session.id, room.id, lang.id, { codec: 'opus' });
  assert.equal(audio.codec, 'opus');
  assert.equal(engine.listAudioChannels(lang.id).length, 1);

  const subs = engine.createSubtitleChannel(session.id, room.id, lang.id);
  assert.equal(engine.listSubtitleChannels(lang.id).length, 1);

  engine.removeAudioChannel(lang.id, audio.id);
  assert.equal(engine.listAudioChannels(lang.id).length, 0);

  engine.removeSubtitleChannel(lang.id, subs.id);
  assert.equal(engine.listSubtitleChannels(lang.id).length, 0);
});

test('removeLanguageChannel cascades to its audio/subtitle channels', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const lang = engine.createLanguageChannel(session.id, room.id, 'fr');
  engine.createAudioChannel(session.id, room.id, lang.id);
  engine.createSubtitleChannel(session.id, room.id, lang.id);

  engine.removeLanguageChannel(session.id, room.id, lang.id);
  assert.equal(engine.listAudioChannels(lang.id).length, 0);
  assert.equal(engine.listSubtitleChannels(lang.id).length, 0);
  assert.equal(engine.listLanguageChannels(session.id, room.id).length, 0);
});

/* ------------------------------------------------------------------ */
/* HOSTS                                                                */
/* ------------------------------------------------------------------ */

test('host hierarchy registration, re-parenting, and unregistration', () => {
  const engine = createOurCozyLive();
  const main = engine.registerHost({ hostType: HOST_TYPES.MAIN_HOST });
  const regional = engine.registerHost({ hostType: HOST_TYPES.REGIONAL_HOST, parentHostId: main.id });
  const zoneHost = engine.registerHost({ hostType: HOST_TYPES.ZONE_HOST, parentHostId: regional.id });

  assert.equal(engine.listHosts({ hostType: HOST_TYPES.ZONE_HOST }).length, 1);

  engine.unregisterHost(regional.id);
  const refetchedZoneHost = engine.listHosts().find((h) => h.id === zoneHost.id);
  assert.equal(refetchedZoneHost.parentHostId, null);
});

test('registerHost rejects unknown hostType and unknown parentHostId', () => {
  const engine = createOurCozyLive();
  assert.throws(() => engine.registerHost({ hostType: 'NOT_A_TYPE' }), CozyLiveError);
  assert.throws(
    () => engine.registerHost({ hostType: HOST_TYPES.CLIENT_DEVICE, parentHostId: 'ghost' }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.NOT_FOUND
  );
});

/* ------------------------------------------------------------------ */
/* PERMISSIONS / MODERATORS                                             */
/* ------------------------------------------------------------------ */

test('moderators implicitly hold native PERMISSIONS entries', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'mod-1' });
  engine.assignModerator(session.id, 'mod-1');

  assert.equal(engine.isModerator(session.id, 'mod-1'), true);
  assert.equal(engine.checkPermission(session.id, 'mod-1', PERMISSIONS.MANAGE_ROOMS), true);
  assert.equal(engine.checkPermission(session.id, 'mod-1', PERMISSIONS.MODERATE), true);

  engine.revokeModerator(session.id, 'mod-1');
  assert.equal(engine.checkPermission(session.id, 'mod-1', PERMISSIONS.MANAGE_ROOMS), false);
});

test('non-moderator participants only hold explicitly granted permissions', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'p1' });

  assert.equal(engine.checkPermission(session.id, 'p1', PERMISSIONS.BROADCAST_ANNOUNCEMENT), false);
  engine.grantPermission(session.id, 'p1', PERMISSIONS.BROADCAST_ANNOUNCEMENT);
  assert.equal(engine.checkPermission(session.id, 'p1', PERMISSIONS.BROADCAST_ANNOUNCEMENT), true);

  engine.revokePermission(session.id, 'p1', PERMISSIONS.BROADCAST_ANNOUNCEMENT);
  assert.equal(engine.checkPermission(session.id, 'p1', PERMISSIONS.BROADCAST_ANNOUNCEMENT), false);
});

/* ------------------------------------------------------------------ */
/* ANNOUNCEMENTS                                                        */
/* ------------------------------------------------------------------ */

test('broadcastAnnouncement records and lists announcements', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  engine.broadcastAnnouncement(session.id, 'Service starting soon');
  engine.broadcastAnnouncement(session.id, 'Fire drill', { roomId: room.id, priority: 'emergency' });

  const list = engine.listAnnouncements(session.id);
  assert.equal(list.length, 2);
  assert.equal(list[1].priority, 'emergency');
});

/* ------------------------------------------------------------------ */
/* SUBSYSTEM REGISTRY + PIPELINE COORDINATION                          */
/* ------------------------------------------------------------------ */

test('registerSubsystem only accepts KNOWN_SUBSYSTEMS names', () => {
  const engine = createOurCozyLive();
  assert.throws(() => engine.registerSubsystem('NotARealSubsystem', {}), CozyLiveError);
  for (const name of KNOWN_SUBSYSTEMS) {
    assert.equal(engine.registerSubsystem(name, {}), true);
    assert.equal(engine.hasSubsystem(name), true);
  }
});

test('relaySpeechSegment fails clearly when required subsystems are not registered', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  assert.throws(
    () => engine.relaySpeechSegment(session.id, room.id, { uri: 'file://seg1.raw' }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.SUBSYSTEM_NOT_REGISTERED
  );
});

test('relaySpeechSegment requires the session to be STARTED', () => {
  const engine = createOurCozyLive();
  const session = engine.createSession({ title: 'X' });
  const room = engine.createRoom(session.id, { name: 'Main' });
  engine.registerSubsystem('CozySpeech', {
    transcribe: () => ({ text: 'hello' }),
    synthesize: () => ({ audioRef: 'a' })
  });
  engine.registerSubsystem('CozyTranslate', { translate: () => ({ text: 'bonjour' }) });

  assert.throws(
    () => engine.relaySpeechSegment(session.id, room.id, {}),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.INVALID_STATE
  );
});

test('relaySpeechSegment orchestrates transcribe -> translate -> synthesize purely via adapters', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine); // primaryLanguage: 'sw'
  const enChannel = engine.createLanguageChannel(session.id, room.id, 'en');
  const frChannel = engine.createLanguageChannel(session.id, room.id, 'fr');

  const transcribeCalls = [];
  const translateCalls = [];
  const synthesizeCalls = [];

  engine.registerSubsystem('CozySpeech', {
    transcribe: (audioRef, sourceLanguage) => {
      transcribeCalls.push({ audioRef, sourceLanguage });
      return { text: 'Habari za asubuhi' };
    },
    synthesize: (text, languageCode) => {
      synthesizeCalls.push({ text, languageCode });
      return { audioRef: `synth-${languageCode}` };
    }
  });
  engine.registerSubsystem('CozyTranslate', {
    translate: (text, sourceLanguage, targetLanguage) => {
      translateCalls.push({ text, sourceLanguage, targetLanguage });
      return { text: `[${targetLanguage}] ${text}` };
    }
  });

  const relayed = [];
  engine.on(EVENT_TYPES.PIPELINE_SEGMENT_RELAYED, (p) => relayed.push(p));

  const result = engine.relaySpeechSegment(session.id, room.id, { uri: 'seg-1' });

  assert.equal(transcribeCalls.length, 1);
  assert.equal(transcribeCalls[0].sourceLanguage, 'sw');
  assert.equal(translateCalls.length, 2);
  assert.equal(synthesizeCalls.length, 2);

  assert.equal(result.transcript, 'Habari za asubuhi');
  assert.equal(result.translations.length, 2);
  const en = result.translations.find((t) => t.languageChannelId === enChannel.id);
  assert.equal(en.languageCode, 'en');
  assert.equal(en.text, '[en] Habari za asubuhi');
  assert.equal(en.audioRef, 'synth-en');

  assert.equal(relayed.length, 1);
});

test('relaySpeechSegment surfaces a contract violation if CozyTranslate returns the wrong shape', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  engine.createLanguageChannel(session.id, room.id, 'en');
  engine.registerSubsystem('CozySpeech', {
    transcribe: () => ({ text: 'hi' }),
    synthesize: () => ({ audioRef: 'a' })
  });
  engine.registerSubsystem('CozyTranslate', { translate: () => ('not-an-object') });

  assert.throws(
    () => engine.relaySpeechSegment(session.id, room.id, {}),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.SUBSYSTEM_CONTRACT_VIOLATION
  );
});

/* ------------------------------------------------------------------ */
/* EVENT SYSTEM                                                         */
/* ------------------------------------------------------------------ */

test('on() returns an unsubscribe function that stops future delivery', () => {
  const engine = createOurCozyLive();
  let count = 0;
  const unsubscribe = engine.on(EVENT_TYPES.SESSION_CREATED, () => {
    count += 1;
  });
  engine.createSession({ title: 'A' });
  unsubscribe();
  engine.createSession({ title: 'B' });
  assert.equal(count, 1);
});

test('once() only fires a single time', () => {
  const engine = createOurCozyLive();
  let count = 0;
  engine.once(EVENT_TYPES.SESSION_CREATED, () => {
    count += 1;
  });
  engine.createSession({ title: 'A' });
  engine.createSession({ title: 'B' });
  assert.equal(count, 1);
});

test('registerEventType + emitCustomEvent supports future features without core changes', () => {
  const engine = createOurCozyLive();
  engine.registerEventType('VOTE_CAST');
  let received = null;
  engine.on('VOTE_CAST', (p) => {
    received = p;
  });
  engine.emitCustomEvent('VOTE_CAST', { choice: 'yes' });
  assert.equal(received.choice, 'yes');
});

test('registerEventType rejects collisions with built-in event type names', () => {
  const engine = createOurCozyLive();
  assert.throws(() => engine.registerEventType(EVENT_TYPES.SESSION_CREATED), CozyLiveError);
});

test('emitCustomEvent rejects event names that were never registered', () => {
  const engine = createOurCozyLive();
  assert.throws(() => engine.emitCustomEvent('NEVER_REGISTERED', {}), CozyLiveError);
});

test('a throwing handler does not prevent other handlers from running', () => {
  const engine = createOurCozyLive();
  let secondRan = false;
  engine.on(EVENT_TYPES.SESSION_CREATED, () => {
    throw new Error('boom');
  });
  engine.on(EVENT_TYPES.SESSION_CREATED, () => {
    secondRan = true;
  });
  engine.createSession({ title: 'X' });
  assert.equal(secondRan, true);
});

/* ------------------------------------------------------------------ */
/* DIAGNOSTICS / HEALTH / STATISTICS                                    */
/* ------------------------------------------------------------------ */

test('getDiagnostics reflects only real tracked counters', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'u1' });
  engine.joinSession(session.id, { id: 'u2' });
  engine.leaveSession(session.id, 'u1');

  const diag = engine.getDiagnostics(session.id);
  assert.equal(diag.participantsJoined, 2);
  assert.equal(diag.participantsLeft, 1);
});

test('getHealth reports registered subsystems and active session count', () => {
  const engine = createOurCozyLive();
  engine.createSession({ title: 'X' });
  engine.registerSubsystem('CozyLogger', {});
  const health = engine.getHealth();
  assert.equal(health.activeSessions, 1);
  assert.deepEqual(health.registeredSubsystems, ['CozyLogger']);
});

test('getStatistics aggregates counts correctly', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'u1' });
  engine.createZone(session.id, { name: 'Zone A' });

  const stats = engine.getStatistics(session.id);
  assert.equal(stats.participantCount, 1);
  assert.equal(stats.roomCount, 1);
  assert.equal(stats.zoneCount, 1);
});

/* ------------------------------------------------------------------ */
/* EXPORT / IMPORT                                                      */
/* ------------------------------------------------------------------ */

test('exportSession -> importSession round-trips full session state into a fresh instance', () => {
  const engineA = createOurCozyLive();
  const { session, room } = makeFullSession(engineA);
  const zone = engineA.createZone(session.id, { name: 'Zone A' });
  engineA.updateRoom(session.id, room.id, { zoneId: zone.id });
  const lang = engineA.createLanguageChannel(session.id, room.id, 'en');
  engineA.createAudioChannel(session.id, room.id, lang.id);
  engineA.createSubtitleChannel(session.id, room.id, lang.id);
  engineA.joinSession(session.id, { id: 'u1', languageCode: 'en' });
  engineA.assignModerator(session.id, 'u1');
  engineA.grantPermission(session.id, 'u1', PERMISSIONS.BROADCAST_ANNOUNCEMENT);
  engineA.broadcastAnnouncement(session.id, 'Hello everyone');

  const snapshot = engineA.exportSession(session.id);
  assert.ok(Object.isFrozen(snapshot));

  const engineB = createOurCozyLive();
  const restored = engineB.importSession(snapshot);
  assert.equal(restored.id, session.id);

  assert.equal(engineB.listRooms(session.id).length, 1);
  assert.equal(engineB.listZones(session.id).length, 1);
  assert.equal(engineB.getRoom(session.id, room.id).zoneId, zone.id);
  assert.equal(engineB.listLanguageChannels(session.id, room.id).length, 1);
  assert.equal(engineB.listAudioChannels(lang.id).length, 1);
  assert.equal(engineB.listSubtitleChannels(lang.id).length, 1);
  assert.equal(engineB.listParticipants(session.id).length, 1);
  assert.equal(engineB.isModerator(session.id, 'u1'), true);
  assert.equal(engineB.checkPermission(session.id, 'u1', PERMISSIONS.BROADCAST_ANNOUNCEMENT), true);
  assert.equal(engineB.listAnnouncements(session.id).length, 1);
});

test('importSession refuses to overwrite an existing session id', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const snapshot = engine.exportSession(session.id);
  assert.throws(
    () => engine.importSession(snapshot),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.ALREADY_EXISTS
  );
});

test('exportSession never leaks subsystem adapters (functions) into the snapshot', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  engine.registerSubsystem('CozySpeech', { transcribe: () => {}, synthesize: () => {} });
  const snapshot = engine.exportSession(session.id);
  const raw = JSON.stringify(snapshot);
  assert.ok(!raw.includes('function'));
});

/* ------------------------------------------------------------------ */
/* IMMUTABILITY OF RETURNED SNAPSHOTS                                   */
/* ------------------------------------------------------------------ */

test('mutating a returned room snapshot does not affect internal state', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  try {
    room.name = 'Hacked Name';
  } catch (_e) {
    /* strict mode throws; sloppy mode silently no-ops — both are fine */
  }
  const refetched = engine.getRoom(session.id, room.id);
  assert.equal(refetched.name, 'Main Sanctuary');
});

test('mutating nested metadata on a returned session snapshot does not affect internal state', () => {
  const engine = createOurCozyLive();
  const session = engine.createSession({ title: 'X', metadata: { note: 'original' } });
  assert.throws(() => {
    session.metadata.note = 'tampered';
  });
  const refetched = engine.getSession(session.id);
  assert.equal(refetched.metadata.note, 'original');
});

/* ------------------------------------------------------------------ */
/* STREAMS                                                              */
/* ------------------------------------------------------------------ */

test('createStream starts IDLE and can transition status', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const stream = engine.createStream(session.id, room.id);
  assert.equal(stream.status, STREAM_STATUSES.IDLE);

  const live = engine.setStreamStatus(session.id, room.id, stream.id, STREAM_STATUSES.LIVE);
  assert.equal(live.status, STREAM_STATUSES.LIVE);
  assert.equal(engine.listStreams(session.id, room.id).length, 1);
});

test('setStreamStatus rejects invalid status values', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const stream = engine.createStream(session.id, room.id);
  assert.throws(
    () => engine.setStreamStatus(session.id, room.id, stream.id, 'NOT_A_STATUS'),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.INVALID_ARGUMENT
  );
});

test('createTranslationStream provisions its own audio and subtitle channel', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const lang = engine.createLanguageChannel(session.id, room.id, 'fr');
  const stream = engine.createStream(session.id, room.id);

  const ts = engine.createTranslationStream(session.id, room.id, stream.id, lang.id);
  assert.equal(ts.languageCode, 'fr');
  assert.ok(ts.audioChannelId);
  assert.ok(ts.subtitleChannelId);
  assert.equal(engine.listAudioChannels(lang.id).length, 1);
  assert.equal(engine.listSubtitleChannels(lang.id).length, 1);
  assert.equal(engine.listTranslationStreams(stream.id).length, 1);

  engine.removeTranslationStream(stream.id, ts.id);
  assert.equal(engine.listTranslationStreams(stream.id).length, 0);
  assert.equal(engine.listAudioChannels(lang.id).length, 0);
  assert.equal(engine.listSubtitleChannels(lang.id).length, 0);
});

test('removeStream cascades to its translation streams', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const lang = engine.createLanguageChannel(session.id, room.id, 'en');
  const stream = engine.createStream(session.id, room.id);
  engine.createTranslationStream(session.id, room.id, stream.id, lang.id);

  engine.removeStream(session.id, room.id, stream.id);
  assert.throws(() => engine.getStream(session.id, room.id, stream.id), CozyLiveError);
  assert.equal(engine.listTranslationStreams(stream.id).length, 0);
});

test('removeRoom cascades to its streams and their translation streams', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const lang = engine.createLanguageChannel(session.id, room.id, 'en');
  const stream = engine.createStream(session.id, room.id);
  const ts = engine.createTranslationStream(session.id, room.id, stream.id, lang.id);

  engine.removeRoom(session.id, room.id);
  assert.equal(engine.listTranslationStreams(stream.id).length, 0);
  assert.throws(() => engine.getGraphNode(room.id), CozyLiveError);
  assert.throws(() => engine.getGraphNode(stream.id), CozyLiveError);
  assert.throws(() => engine.getGraphNode(ts.id), CozyLiveError);
});

/* ------------------------------------------------------------------ */
/* SPEAKERS                                                             */
/* ------------------------------------------------------------------ */

test('registerSpeaker / setActiveSpeaker / getActiveSpeaker lifecycle', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const pastor = engine.registerSpeaker(session.id, { displayName: 'Pastor John', role: 'Pastor', roomId: room.id });
  const interpreter = engine.registerSpeaker(session.id, { displayName: 'Jane', role: 'Interpreter' });

  assert.equal(engine.listSpeakers(session.id).length, 2);
  assert.equal(engine.getActiveSpeaker(session.id, room.id), null);

  engine.setActiveSpeaker(session.id, room.id, pastor.id);
  assert.equal(engine.getActiveSpeaker(session.id, room.id).id, pastor.id);

  engine.setActiveSpeaker(session.id, room.id, interpreter.id);
  assert.equal(engine.getActiveSpeaker(session.id, room.id).id, interpreter.id);
});

test('removeSpeaker clears them as any room active speaker', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const speaker = engine.registerSpeaker(session.id, { displayName: 'MC' });
  engine.setActiveSpeaker(session.id, room.id, speaker.id);
  engine.removeSpeaker(session.id, speaker.id);
  assert.equal(engine.getActiveSpeaker(session.id, room.id), null);
});

test('relaySpeechSegment defaults speakerId to the room active speaker and records a timeline segment', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  engine.createLanguageChannel(session.id, room.id, 'en');
  const speaker = engine.registerSpeaker(session.id, { displayName: 'Pastor John', roomId: room.id });
  engine.setActiveSpeaker(session.id, room.id, speaker.id);

  engine.registerSubsystem('CozySpeech', {
    transcribe: () => ({ text: 'Habari' }),
    synthesize: () => ({ audioRef: 'a' })
  });
  engine.registerSubsystem('CozyTranslate', { translate: (t, s, target) => ({ text: `[${target}] ${t}` }) });

  const recorded = [];
  engine.on(EVENT_TYPES.SEGMENT_RECORDED, (p) => recorded.push(p.segment));

  const result = engine.relaySpeechSegment(session.id, room.id, { uri: 'seg1' });
  assert.equal(result.speakerId, speaker.id);
  assert.equal(result.sequenceNumber, 1);
  assert.ok(result.segmentId);

  const result2 = engine.relaySpeechSegment(session.id, room.id, { uri: 'seg2' }, { speakerId: speaker.id });
  assert.equal(result2.sequenceNumber, 2);

  assert.equal(recorded.length, 2);
  const timeline = engine.getTimeline(session.id);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].sequenceNumber, 1);
  assert.equal(timeline[1].sequenceNumber, 2);

  const single = engine.getSegment(session.id, result.segmentId);
  assert.equal(single.transcript, 'Habari');
});

test('relaySpeechSegment invokes optional CozyLanguage/CozyKnowledge hooks when registered, and skips them when absent', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  engine.createLanguageChannel(session.id, room.id, 'en');
  engine.registerSubsystem('CozySpeech', { transcribe: () => ({ text: 'hi' }), synthesize: () => ({ audioRef: 'a' }) });
  engine.registerSubsystem('CozyTranslate', { translate: () => ({ text: 'hola' }) });

  const withoutHooks = engine.relaySpeechSegment(session.id, room.id, {});
  assert.equal(withoutHooks.detectedLanguage, null);
  assert.equal(withoutHooks.terminologyHints, null);

  engine.registerSubsystem('CozyLanguage', { detectLanguage: () => ({ languageCode: 'sw' }) });
  engine.registerSubsystem('CozyKnowledge', { lookupTerminology: () => ({ terms: ['grace', 'covenant'] }) });

  const withHooks = engine.relaySpeechSegment(session.id, room.id, {});
  assert.equal(withHooks.detectedLanguage, 'sw');
  assert.deepEqual(withHooks.terminologyHints, ['grace', 'covenant']);
});

/* ------------------------------------------------------------------ */
/* CAMERAS / DISPLAYS / DEVICES                                         */
/* ------------------------------------------------------------------ */

test('camera registration and room assignment', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const camera = engine.registerCamera(session.id, { name: 'Stage Camera' });
  assert.equal(camera.roomId, null);

  const assigned = engine.assignCameraToRoom(session.id, camera.id, room.id);
  assert.equal(assigned.roomId, room.id);
  assert.equal(engine.listCameras(session.id).length, 1);

  engine.removeCamera(session.id, camera.id);
  assert.equal(engine.listCameras(session.id).length, 0);
});

test('display registration, room assignment, and broadcast coordination', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const display = engine.registerDisplay(session.id, { name: 'LED Wall', displayType: DISPLAY_TYPES.LED_WALL });
  engine.assignDisplayRoom(session.id, display.id, room.id);

  const broadcasts = [];
  engine.on(EVENT_TYPES.DISPLAY_BROADCAST, (p) => broadcasts.push(p));
  const updated = engine.broadcastDisplay(session.id, display.id, { slide: 'welcome' });
  assert.ok(updated.lastBroadcastAt);
  assert.equal(broadcasts.length, 1);
});

test('registerDisplay rejects an unknown displayType', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  assert.throws(() => engine.registerDisplay(session.id, { name: 'X', displayType: 'HOLOGRAM' }), CozyLiveError);
});

test('device registry: register, update, filter, and remove', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'u1' });
  const phone = engine.registerDevice(session.id, {
    deviceType: DEVICE_TYPES.PHONE,
    name: "Jane's Phone",
    participantId: 'u1',
    telemetry: { batteryLevel: 91 }
  });
  const hub = engine.registerDevice(session.id, { deviceType: DEVICE_TYPES.HUB, name: 'Church Hub', roomId: room.id });

  assert.equal(engine.listDevices(session.id).length, 2);
  assert.equal(engine.listDevices(session.id, { deviceType: DEVICE_TYPES.HUB }).length, 1);

  const updated = engine.updateDevice(session.id, phone.id, { telemetry: { batteryLevel: 60 } });
  assert.equal(updated.telemetry.batteryLevel, 60);

  engine.removeDevice(session.id, hub.id);
  assert.equal(engine.listDevices(session.id).length, 1);
});

test('registerDevice rejects unknown deviceType and secret-like telemetry', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  assert.throws(() => engine.registerDevice(session.id, { deviceType: 'ROBOT', name: 'X' }), CozyLiveError);
  assert.throws(
    () => engine.registerDevice(session.id, { deviceType: DEVICE_TYPES.HUB, name: 'X', telemetry: { apiSecret: 'z' } }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.FORBIDDEN
  );
});

test('reportDeviceHealthEvent stores health status and forwards FAILED events to a registered CozyResilience adapter', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const device = engine.registerDevice(session.id, { deviceType: DEVICE_TYPES.SPEAKER_BOX, name: 'Left Speaker' });

  const calls = [];
  engine.registerSubsystem('CozyResilience', {
    handleDeviceFailure: (event) => {
      calls.push(event);
      return { failoverTo: 'phones' };
    }
  });

  const degraded = engine.reportDeviceHealthEvent(session.id, device.id, DEVICE_HEALTH_STATUSES.DEGRADED);
  assert.equal(degraded.healthStatus, DEVICE_HEALTH_STATUSES.DEGRADED);
  assert.equal(calls.length, 0);

  const failed = engine.reportDeviceHealthEvent(session.id, device.id, DEVICE_HEALTH_STATUSES.FAILED, { note: 'battery dead' });
  assert.equal(failed.healthStatus, DEVICE_HEALTH_STATUSES.FAILED);
  assert.equal(calls.length, 1);
  assert.equal(failed.lastResiliencePlan.failoverTo, 'phones');
});

test('reportDeviceHealthEvent never throws even if the CozyResilience adapter itself throws', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const device = engine.registerDevice(session.id, { deviceType: DEVICE_TYPES.HUB, name: 'Hub' });
  engine.registerSubsystem('CozyResilience', {
    handleDeviceFailure: () => {
      throw new Error('adapter exploded');
    }
  });
  const failed = engine.reportDeviceHealthEvent(session.id, device.id, DEVICE_HEALTH_STATUSES.FAILED);
  assert.equal(failed.lastResiliencePlan, null);
});

/* ------------------------------------------------------------------ */
/* ATTENDANCE                                                           */
/* ------------------------------------------------------------------ */

test('recordAttendance is a pure data sink with method validation and filtering', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'u1' });

  engine.recordAttendance(session.id, { participantId: 'u1', method: ATTENDANCE_METHODS.QR });
  engine.recordAttendance(session.id, { participantId: 'guest-1', method: ATTENDANCE_METHODS.GUEST });

  assert.equal(engine.listAttendance(session.id).length, 2);
  assert.equal(engine.listAttendance(session.id, { method: ATTENDANCE_METHODS.GUEST }).length, 1);

  assert.throws(
    () => engine.recordAttendance(session.id, { participantId: 'u1', method: 'RETINA_SCAN' }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.INVALID_ARGUMENT
  );
});

/* ------------------------------------------------------------------ */
/* PLUGIN REGISTRY / SERVICE REGISTRY                                   */
/* ------------------------------------------------------------------ */

test('plugin registry is pure bookkeeping and never invokes plugin methods directly', () => {
  const engine = createOurCozyLive();
  let called = false;
  engine.registerPlugin('BiblePlugin', {
    onSegmentRecorded: () => {
      called = true;
    }
  });
  assert.equal(engine.hasPlugin('BiblePlugin'), true);
  assert.deepEqual(engine.listPlugins(), ['BiblePlugin']);

  const { session, room } = makeFullSession(engine);
  engine.createLanguageChannel(session.id, room.id, 'en');
  engine.registerSubsystem('CozySpeech', { transcribe: () => ({ text: 'hi' }), synthesize: () => ({ audioRef: 'a' }) });
  engine.registerSubsystem('CozyTranslate', { translate: () => ({ text: 'hola' }) });
  engine.relaySpeechSegment(session.id, room.id, {});

  assert.equal(called, false, 'plugins must only receive data via the public event bus, never direct invocation');

  engine.unregisterPlugin('BiblePlugin');
  assert.equal(engine.hasPlugin('BiblePlugin'), false);
});

test('service registry: register, list capabilities, retrieve adapter, and health check', () => {
  const engine = createOurCozyLive();
  engine.registerService(
    'CozyBible',
    { lookupVerse: (ref) => `Text for ${ref}`, healthCheck: () => 'ok' },
    { capabilities: ['verse-lookup'] }
  );

  assert.deepEqual(engine.getServiceCapabilities('CozyBible'), ['verse-lookup']);
  const svc = engine.getService('CozyBible');
  assert.equal(svc.lookupVerse('John 3:16'), 'Text for John 3:16');

  const health = engine.getServiceHealth('CozyBible');
  assert.equal(health.health, 'ok');

  const list = engine.listServices();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'CozyBible');

  engine.unregisterService('CozyBible');
  assert.throws(() => engine.getService('CozyBible'), CozyLiveError);
});

test('getServiceHealth reports unknown when no healthCheck is exposed, and never throws if healthCheck itself throws', () => {
  const engine = createOurCozyLive();
  engine.registerService('CozyMarketplace', { listItems: () => [] });
  assert.equal(engine.getServiceHealth('CozyMarketplace').health, 'unknown');

  engine.registerService('CozyDonation', {
    healthCheck: () => {
      throw new Error('down');
    }
  });
  const health = engine.getServiceHealth('CozyDonation');
  assert.equal(health.health.error, 'down');
});

/* ------------------------------------------------------------------ */
/* VENUE DIGITAL TWIN                                                   */
/* ------------------------------------------------------------------ */

test('venue -> building -> floor -> room hierarchy, and venue features', () => {
  const engine = createOurCozyLive();
  const venue = engine.registerVenue({ name: 'Grace Chapel', venueKind: VENUE_KINDS.CHURCH });
  const building = engine.createBuilding(venue.id, { name: 'Main Building' });
  const floor = engine.createFloor(venue.id, building.id, { name: 'Ground Floor' });

  const session = engine.createSession({ title: 'Sunday Service', venueId: venue.id });
  engine.startSession(session.id);
  const room = engine.createRoom(session.id, { name: 'Main Sanctuary', floorId: floor.id });
  assert.equal(room.floorId, floor.id);

  const stage = engine.createVenueFeature(session.id, room.id, { featureType: VENUE_FEATURE_TYPES.STAGE, name: 'Main Stage' });
  const mic = engine.createVenueFeature(session.id, room.id, {
    featureType: VENUE_FEATURE_TYPES.MICROPHONE_POSITION,
    name: 'Pulpit Mic'
  });
  assert.equal(engine.listVenueFeatures(room.id).length, 2);

  engine.removeVenueFeature(room.id, mic.id);
  assert.equal(engine.listVenueFeatures(room.id).length, 1);

  assert.equal(engine.listBuildings(venue.id).length, 1);
  assert.equal(engine.listFloors(building.id).length, 1);
});

test('createRoom rejects an unknown floorId', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  assert.throws(
    () => engine.createRoom(session.id, { name: 'X', floorId: 'no-such-floor' }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.NOT_FOUND
  );
});

test('registerVenue rejects an unknown venueKind', () => {
  const engine = createOurCozyLive();
  assert.throws(() => engine.registerVenue({ name: 'X', venueKind: 'SPACESHIP' }), CozyLiveError);
});

test('venue preferences (Local Knowledge Base) persist independent of any session', () => {
  const engine = createOurCozyLive();
  const venue = engine.registerVenue({ name: 'Grace Chapel' });
  engine.setVenuePreference(venue.id, 'preferredLanguageOrder', ['en', 'sw', 'luo']);
  engine.setVenuePreference(venue.id, 'projectorAPosition', 'left wall');

  assert.deepEqual(engine.getVenuePreference(venue.id, 'preferredLanguageOrder'), ['en', 'sw', 'luo']);
  const all = engine.listVenuePreferences(venue.id);
  assert.equal(all.projectorAPosition, 'left wall');

  assert.throws(() => engine.getVenuePreference(venue.id, 'neverSet'), CozyLiveError);
});

/* ------------------------------------------------------------------ */
/* SESSION CONTEXT                                                     */
/* ------------------------------------------------------------------ */

test('session context can be set at creation and changed later', () => {
  const engine = createOurCozyLive();
  const session = engine.createSession({ title: 'X', context: 'SUNDAY_SERVICE' });
  assert.equal(session.context, 'SUNDAY_SERVICE');

  const updated = engine.updateSessionContext(session.id, 'WEDDING');
  assert.equal(updated.context, 'WEDDING');
});

/* ------------------------------------------------------------------ */
/* ACCESSIBILITY PREFERENCES                                           */
/* ------------------------------------------------------------------ */

test('accessibility preferences merge on repeated calls and are participant-scoped', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  engine.joinSession(session.id, { id: 'u1' });

  engine.setAccessibilityPreferences(session.id, 'u1', { captionsRequired: true });
  engine.setAccessibilityPreferences(session.id, 'u1', { highContrast: true });

  const prefs = engine.getAccessibilityPreferences(session.id, 'u1');
  assert.equal(prefs.captionsRequired, true);
  assert.equal(prefs.highContrast, true);

  const all = engine.listAccessibilityPreferences(session.id);
  assert.ok(all.u1);
});

/* ------------------------------------------------------------------ */
/* COZY EVENT GRAPH                                                     */
/* ------------------------------------------------------------------ */

test('built-in entities automatically mirror into the event graph with relationships', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const speaker = engine.registerSpeaker(session.id, { displayName: 'Pastor', roomId: room.id });

  const roomNode = engine.getGraphNode(room.id);
  assert.equal(roomNode.type, 'room');

  const neighbors = engine.getGraphNeighbors(session.id);
  assert.ok(neighbors.outgoing.some((e) => e.to === room.id && e.relation === 'has_room'));

  const roomNeighbors = engine.getGraphNeighbors(room.id);
  assert.ok(roomNeighbors.outgoing.some((e) => e.to === speaker.id && e.relation === 'has_speaker'));

  const nodesForSession = engine.listGraphNodes({ sessionId: session.id });
  assert.ok(nodesForSession.some((n) => n.id === room.id));
  assert.ok(nodesForSession.some((n) => n.id === speaker.id));
});

test('endSession cascades event-graph cleanup for everything the session ever mirrored', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  const speaker = engine.registerSpeaker(session.id, { displayName: 'Pastor' });
  engine.joinSession(session.id, { id: 'u1' });

  engine.endSession(session.id);

  assert.throws(() => engine.getGraphNode(room.id), CozyLiveError);
  assert.throws(() => engine.getGraphNode(speaker.id), CozyLiveError);
  assert.equal(engine.listGraphNodes({ sessionId: session.id }).length, 0);
});

test('venue/building/floor graph nodes survive endSession (they are venue-scoped, not session-scoped)', () => {
  const engine = createOurCozyLive();
  const venue = engine.registerVenue({ name: 'Grace Chapel' });
  const building = engine.createBuilding(venue.id, { name: 'Main Building' });
  const session = engine.createSession({ title: 'X', venueId: venue.id });
  engine.startSession(session.id);

  engine.endSession(session.id);

  assert.ok(engine.getGraphNode(venue.id));
  assert.ok(engine.getGraphNode(building.id));
});

test('addGraphNode / addGraphEdge / removeGraphNode support custom application node types', () => {
  const engine = createOurCozyLive();
  const { session, room } = makeFullSession(engine);
  engine.createLanguageChannel(session.id, room.id, 'en');
  engine.registerSubsystem('CozySpeech', { transcribe: () => ({ text: 'hi' }), synthesize: () => ({ audioRef: 'a' }) });
  engine.registerSubsystem('CozyTranslate', { translate: () => ({ text: 'hola' }) });
  const result = engine.relaySpeechSegment(session.id, room.id, {});

  const reaction = engine.addGraphNode('reaction', { emoji: 'amen' }, session.id);
  const edge = engine.addGraphEdge(result.segmentId, reaction.id, 'reacted_to');
  assert.equal(edge.relation, 'reacted_to');

  const neighbors = engine.getGraphNeighbors(result.segmentId);
  assert.ok(neighbors.outgoing.some((e) => e.to === reaction.id));

  engine.removeGraphNode(reaction.id);
  assert.throws(() => engine.getGraphNode(reaction.id), CozyLiveError);
  const neighborsAfter = engine.getGraphNeighbors(result.segmentId);
  assert.equal(neighborsAfter.outgoing.some((e) => e.to === reaction.id), false);
});

test('addGraphNode rejects a duplicate caller-supplied node id', () => {
  const engine = createOurCozyLive();
  engine.addGraphNode('reaction', {}, null, 'custom-1');
  assert.throws(
    () => engine.addGraphNode('reaction', {}, null, 'custom-1'),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.ALREADY_EXISTS
  );
});

/* ------------------------------------------------------------------ */
/* EXPORT / IMPORT WITH v1.1.0 / v1.2.0 ENTITIES                        */
/* ------------------------------------------------------------------ */

test('exportSession -> importSession round-trips streams, speakers, cameras, displays, devices, attendance, and the timeline', () => {
  const engineA = createOurCozyLive();
  const venue = engineA.registerVenue({ name: 'Grace Chapel' });
  const session = engineA.createSession({ title: 'Sunday Service', venueId: venue.id, primaryLanguage: 'sw' });
  engineA.startSession(session.id);
  const room = engineA.createRoom(session.id, { name: 'Main Sanctuary' });
  const lang = engineA.createLanguageChannel(session.id, room.id, 'en');
  const stream = engineA.createStream(session.id, room.id);
  engineA.createTranslationStream(session.id, room.id, stream.id, lang.id);

  const speaker = engineA.registerSpeaker(session.id, { displayName: 'Pastor John', roomId: room.id });
  engineA.setActiveSpeaker(session.id, room.id, speaker.id);
  const camera = engineA.registerCamera(session.id, { name: 'Cam 1', roomId: room.id });
  const display = engineA.registerDisplay(session.id, { name: 'Screen 1', roomId: room.id });
  engineA.registerDevice(session.id, { deviceType: DEVICE_TYPES.HUB, name: 'Hub' });
  engineA.joinSession(session.id, { id: 'u1' });
  engineA.setAccessibilityPreferences(session.id, 'u1', { captionsRequired: true });
  engineA.recordAttendance(session.id, { participantId: 'u1', method: ATTENDANCE_METHODS.MANUAL });

  engineA.registerSubsystem('CozySpeech', { transcribe: () => ({ text: 'hi' }), synthesize: () => ({ audioRef: 'a' }) });
  engineA.registerSubsystem('CozyTranslate', { translate: () => ({ text: 'hola' }) });
  engineA.relaySpeechSegment(session.id, room.id, {});

  const snapshot = engineA.exportSession(session.id);

  const engineB = createOurCozyLive();
  engineB.registerVenue({ name: 'placeholder' }); // venue ids are venue-scoped; not required for import to succeed
  const restored = engineB.importSession(snapshot);
  assert.equal(restored.id, session.id);

  assert.equal(engineB.listStreams(session.id, room.id).length, 1);
  assert.equal(engineB.listTranslationStreams(stream.id).length, 1);
  assert.equal(engineB.listSpeakers(session.id).length, 1);
  assert.equal(engineB.getActiveSpeaker(session.id, room.id).id, speaker.id);
  assert.equal(engineB.listCameras(session.id).length, 1);
  assert.equal(engineB.listDisplays(session.id).length, 1);
  assert.equal(engineB.listDevices(session.id).length, 1);
  assert.equal(engineB.getAccessibilityPreferences(session.id, 'u1').captionsRequired, true);
  assert.equal(engineB.listAttendance(session.id).length, 1);
  assert.equal(engineB.getTimeline(session.id).length, 1);

  // graph should be rebuilt too
  assert.ok(engineB.getGraphNode(room.id));
  assert.ok(engineB.getGraphNode(speaker.id));
  assert.ok(engineB.getGraphNode(camera.id));
  assert.ok(engineB.getGraphNode(display.id));
});

/* ------------------------------------------------------------------ */
/* HARDWARE CAPABILITY PROFILE                                          */
/* ------------------------------------------------------------------ */

test('registerDevice stores a Hardware Capability Profile and getDeviceCapabilities returns it', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const device = engine.registerDevice(session.id, {
    deviceType: DEVICE_TYPES.TV,
    name: 'Overflow Room TV',
    capabilities: {
      powerSource: 'AC',
      transportPlugins: ['wifi-direct', 'ethernet'],
      display: { hdmi: true, miracast: true, subtitles: true },
      audio: { microphone: false },
      firmwareVersion: '2.4.1'
    }
  });

  const caps = engine.getDeviceCapabilities(session.id, device.id);
  assert.equal(caps.display.miracast, true);
  assert.deepEqual(caps.transportPlugins, ['wifi-direct', 'ethernet']);
});

test('deviceSupportsCapability answers presence/truthiness without interpreting sub-fields', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const device = engine.registerDevice(session.id, {
    deviceType: DEVICE_TYPES.HUB,
    name: 'Church Hub',
    capabilities: { display: { hdmi: true }, aiSupport: false }
  });

  assert.equal(engine.deviceSupportsCapability(session.id, device.id, 'display'), true);
  assert.equal(engine.deviceSupportsCapability(session.id, device.id, 'aiSupport'), false);
  assert.equal(engine.deviceSupportsCapability(session.id, device.id, 'video'), false);
});

test('updateDevice merges capabilities and telemetry rather than replacing them', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const device = engine.registerDevice(session.id, {
    deviceType: DEVICE_TYPES.SPEAKER_BOX,
    name: 'Left Speaker',
    capabilities: { audio: { codecs: ['opus'] }, battery: { capacityMah: 3000 } },
    telemetry: { batteryLevel: 90 }
  });

  const updated = engine.updateDevice(session.id, device.id, {
    capabilities: { firmwareVersion: '1.0.3' },
    telemetry: { batteryLevel: 55 }
  });

  assert.deepEqual(updated.capabilities.audio, { codecs: ['opus'] });
  assert.equal(updated.capabilities.battery.capacityMah, 3000);
  assert.equal(updated.capabilities.firmwareVersion, '1.0.3');
  assert.equal(updated.telemetry.batteryLevel, 55);
});

test('registerDevice/updateDevice reject secret-like fields inside capabilities', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  assert.throws(
    () =>
      engine.registerDevice(session.id, {
        deviceType: DEVICE_TYPES.HUB,
        name: 'X',
        capabilities: { wifiPassword: 'hunter2' }
      }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.FORBIDDEN
  );

  const device = engine.registerDevice(session.id, { deviceType: DEVICE_TYPES.HUB, name: 'Y' });
  assert.throws(
    () => engine.updateDevice(session.id, device.id, { capabilities: { apiToken: 'z' } }),
    (err) => err instanceof CozyLiveError && err.code === ERROR_CODES.FORBIDDEN
  );
});

test('a device registered with no capabilities defaults to an empty profile', () => {
  const engine = createOurCozyLive();
  const { session } = makeFullSession(engine);
  const device = engine.registerDevice(session.id, { deviceType: DEVICE_TYPES.PHONE, name: 'Plain Phone' });
  assert.deepEqual(engine.getDeviceCapabilities(session.id, device.id), {});
  assert.equal(engine.deviceSupportsCapability(session.id, device.id, 'display'), false);
});
