extends RefCounted
## Port of packages/playback (interpolate.ts + runtime.ts). Everything is a pure
## function of (bundle, show time, started behaviors), so the editor preview, the
## Node fleet and this simulator sample the same pose at the same time.
## test-vectors/playback.json pins the results (tests/run_tests.gd).

const LIGHT_OFF := {"r": 0.0, "g": 0.0, "b": 0.0, "intensity": 0.0}


## Smoothstep 3u² − 2u³: peak speed 1.5× linear, never overshoots.
static func smooth(u: float) -> float:
	return u * u * (3.0 - 2.0 * u)


## A key's interp shapes the segment from that key to the next one.
static func shape(interp: String, u: float) -> float:
	match interp:
		"step":
			return 0.0
		"ease":
			return smooth(u)
	return u


## Index of the last key with t <= time, or -1 when time precedes every key.
static func segment_index(keys: Array, time: float) -> int:
	var lo := 0
	var hi := keys.size() - 1
	var found := -1
	while lo <= hi:
		var mid := (lo + hi) >> 1
		if float(keys[mid]["t"]) <= time:
			found = mid
			lo = mid + 1
		else:
			hi = mid - 1
	return found


## Sample keys at time; before the first key returns the first value.
static func sample_motion(keys: Array, time: float, fallback: float) -> float:
	if keys.is_empty():
		return fallback
	var i := segment_index(keys, time)
	if i < 0:
		return float(keys[0]["v"])
	var a: Dictionary = keys[i]
	if i + 1 >= keys.size():
		return float(a["v"])
	var b: Dictionary = keys[i + 1]
	var span := float(b["t"]) - float(a["t"])
	if span <= 0.0:
		return float(b["v"])
	return lerpf(float(a["v"]), float(b["v"]), shape(a["interp"], (time - float(a["t"])) / span))


## Motion keys with the implicit start-from-home key prepended when needed.
static func with_home(keys: Array, home: float) -> Array:
	if keys.is_empty() or float(keys[0]["t"]) <= 0.0:
		return keys
	return [{"t": 0.0, "v": home, "interp": "linear"}] + keys


static func sample_joint(keys: Array, home: float, time: float) -> float:
	return sample_motion(with_home(keys, home), time, home)


# ---- lights ---------------------------------------------------------------------


static func light_from_key(key: Dictionary) -> Dictionary:
	var n := String(key["color"]).substr(1).hex_to_int()
	return {
		"r": ((n >> 16) & 255) / 255.0,
		"g": ((n >> 8) & 255) / 255.0,
		"b": (n & 255) / 255.0,
		"intensity": float(key["intensity"]),
	}


static func mix_light(a: Dictionary, b: Dictionary, w: float) -> Dictionary:
	return {
		"r": lerpf(a["r"], b["r"], w),
		"g": lerpf(a["g"], b["g"], w),
		"b": lerpf(a["b"], b["b"], w),
		"intensity": lerpf(a["intensity"], b["intensity"], w),
	}


## Before the first key the fixture is off; after the last key it holds.
static func sample_light(keys: Array, time: float) -> Dictionary:
	var i := segment_index(keys, time)
	if i < 0:
		return LIGHT_OFF.duplicate()
	var a: Dictionary = keys[i]
	if i + 1 >= keys.size():
		return light_from_key(a)
	var b: Dictionary = keys[i + 1]
	var span := float(b["t"]) - float(a["t"])
	if span <= 0.0:
		return light_from_key(b)
	return mix_light(light_from_key(a), light_from_key(b), shape(a["interp"], (time - float(a["t"])) / span))


## Clip sampling: before the first key hold it (the blend-in handles the approach).
static func sample_light_clip(keys: Array, time: float) -> Dictionary:
	if keys.is_empty():
		return LIGHT_OFF.duplicate()
	if time < float(keys[0]["t"]):
		return light_from_key(keys[0])
	return sample_light(keys, time)


# ---- sensor responses -------------------------------------------------------------
# Local time from trigger:
#   [0, blend)               blend from the pose at trigger time to clip start
#   [blend, blend+dur)       clip
#   [blend+dur, 2*blend+dur) blend from clip end to where the main timeline will be


static func behavior_end(schedule: Dictionary, start_at: float) -> float:
	return start_at + 2.0 * float(schedule["blendMs"]) + float(schedule["durationMs"])


## {} when the behavior is not driving at t.
static func phase_of(schedule: Dictionary, start_at: float, t: float) -> Dictionary:
	var local := t - start_at
	var blend := float(schedule["blendMs"])
	var duration := float(schedule["durationMs"])
	if local < 0.0:
		return {}
	if local < blend:
		return {"kind": "in", "w": smooth(local / blend)}
	if local < blend + duration:
		return {"kind": "clip", "local": local - blend}
	if local < 2.0 * blend + duration:
		return {"kind": "out", "w": smooth((local - blend - duration) / blend), "t_end": behavior_end(schedule, start_at)}
	return {}


static func find_behavior(bundle: Dictionary, behavior_id: String) -> Dictionary:
	for b in bundle["behaviors"]:
		if b["id"] == behavior_id:
			return b
	return {}


## The behavior currently driving device_id, if any (latest start wins). {} when none.
static func active_behavior_for(bundle: Dictionary, device_id: String, t: float, started: Array) -> Dictionary:
	for i in range(started.size() - 1, -1, -1):
		var entry: Dictionary = started[i]
		var schedule := find_behavior(bundle, entry["id"])
		if schedule.is_empty() or not (device_id in schedule["devices"]):
			continue
		var phase := phase_of(schedule, float(entry["startAt"]), t)
		if not phase.is_empty():
			return {"schedule": schedule, "start_at": float(entry["startAt"]), "phase": phase}
	return {}


static func sample_doll_pose(payload: Dictionary, t: float, active: Dictionary) -> Dictionary:
	var pose := {}
	for joint in payload["character"]["joints"]:
		var joint_name: String = joint["name"]
		var home := float(joint["home"])
		var keys: Array = payload["motion"].get(joint_name, [])
		var clip: Array = []
		if not active.is_empty():
			clip = payload["behaviorMotion"].get(active["schedule"]["id"], {}).get(joint_name, [])
		if clip.is_empty():
			pose[joint_name] = sample_joint(keys, home, t)
			continue
		var p: Dictionary = active["phase"]
		match p["kind"]:
			"in":
				var from := sample_joint(keys, home, active["start_at"])
				pose[joint_name] = lerpf(from, sample_motion(clip, 0.0, from), p["w"])
			"clip":
				pose[joint_name] = sample_motion(clip, p["local"], home)
			_:
				var clip_end := sample_motion(clip, float(active["schedule"]["durationMs"]), home)
				pose[joint_name] = lerpf(clip_end, sample_joint(keys, home, p["t_end"]), p["w"])
	return pose


static func sample_light_state(payload: Dictionary, t: float, active: Dictionary) -> Dictionary:
	var clip: Array = []
	if not active.is_empty():
		clip = payload["behaviorKeys"].get(active["schedule"]["id"], [])
	if clip.is_empty():
		return sample_light(payload["keys"], t)
	var p: Dictionary = active["phase"]
	match p["kind"]:
		"in":
			return mix_light(sample_light(payload["keys"], active["start_at"]), sample_light_clip(clip, 0.0), p["w"])
		"clip":
			return sample_light_clip(clip, p["local"])
	return mix_light(
		sample_light_clip(clip, float(active["schedule"]["durationMs"])), sample_light(payload["keys"], p["t_end"]), p["w"]
	)


## Cues that start in the half-open interval (from, to]. Use from = -1 for the first tick.
## Each event: {cue, at (show time), behavior ("" for the main timeline)}.
static func audio_events_between(
	payload: Dictionary, bundle: Dictionary, from: float, to: float, started: Array
) -> Array:
	var events := []
	for cue in payload["cues"]:
		var at := float(cue["t"])
		if at > from and at <= to:
			events.append({"cue": cue, "at": at, "behavior": "", "seq": events.size()})
	for entry in started:
		var schedule := find_behavior(bundle, entry["id"])
		var cues = payload["behaviorCues"].get(entry["id"])
		if schedule.is_empty() or cues == null:
			continue
		for cue in cues:
			var at := float(entry["startAt"]) + float(schedule["blendMs"]) + float(cue["t"])
			if at > from and at <= to:
				events.append({"cue": cue, "at": at, "behavior": entry["id"], "seq": events.size()})
	# Stable by time, like Array.prototype.sort in the TypeScript runtime.
	events.sort_custom(func(a, b): return a["at"] < b["at"] or (a["at"] == b["at"] and a["seq"] < b["seq"]))
	return events


## The attraction between shows (port of standbyBundle): the show's standby responses
## with the main timeline emptied (figures at home, fixtures dark, no cues) and no
## show-time windows. Its clock starts when the show ends. {} when there are none.
static func standby_bundle(bundle: Dictionary) -> Dictionary:
	var behaviors := []
	for b in bundle["behaviors"]:
		if b.get("standby", false):
			behaviors.append(b.merged({"window": null}, true))
	if behaviors.is_empty():
		return {}
	var devices := {}
	for device_id in bundle["devices"]:
		var payload: Dictionary = bundle["devices"][device_id]
		match payload["kind"]:
			"doll":
				payload = payload.merged({"motion": {}}, true)
			"light":
				payload = payload.merged({"keys": []}, true)
			"audio":
				payload = payload.merged({"cues": []}, true)
		devices[device_id] = payload
	return bundle.merged({"behaviors": behaviors, "devices": devices}, true)


## Whole-attraction state at show time t (HUD, conformance vectors).
static func sample_frame(bundle: Dictionary, t: float, started: Array) -> Dictionary:
	var poses := {}
	var lights := {}
	var active_ids := []
	for device_id in bundle["devices"]:
		var payload: Dictionary = bundle["devices"][device_id]
		var behavior := active_behavior_for(bundle, device_id, t, started)
		if not behavior.is_empty() and not (behavior["schedule"]["id"] in active_ids):
			active_ids.append(behavior["schedule"]["id"])
		match payload["kind"]:
			"doll":
				poses[device_id] = sample_doll_pose(payload, t, behavior)
			"light":
				lights[device_id] = sample_light_state(payload, t, behavior)
	return {"poses": poses, "lights": lights, "activeBehaviors": active_ids}
