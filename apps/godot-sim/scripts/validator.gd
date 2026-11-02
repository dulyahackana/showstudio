extends RefCounted
## Device-side safety check, port of validateDollPayload (packages/playback/src/validate.ts):
## a figure re-validates every bundle against the limits it holds itself, independent of
## what the cloud claims. Only errors matter here (they block staging); the vectors pin
## which codes each case must raise.

const Playback := preload("res://scripts/playback.gd")
const EPS := 1e-6


## [{code, message}] for every error; empty when the payload is safe on this controller.
static func validate_doll_payload(
	payload: Dictionary, local_joints: Array, duration_ms: float, behaviors: Array
) -> Array:
	var out := []
	var by_name := {}
	for j in local_joints:
		by_name[j["name"]] = j
	_check(payload["motion"], by_name, duration_ms, {}, out)
	for behavior_id in payload["behaviorMotion"]:
		var schedule := {}
		for b in behaviors:
			if b["id"] == behavior_id:
				schedule = b
		if schedule.is_empty():
			_error(out, "behavior-unknown", 'Clip for unknown behavior "%s"' % behavior_id)
			continue
		var clip := {"behaviorId": behavior_id, "blendMs": float(schedule["blendMs"])}
		_check(payload["behaviorMotion"][behavior_id], by_name, float(schedule["durationMs"]), clip, out)
	return out


## Peak speed of the segment a -> b in units per second (INF for jumps).
static func segment_peak_velocity(a: Dictionary, b: Dictionary) -> float:
	var dv := absf(float(b["v"]) - float(a["v"]))
	if dv == 0.0:
		return 0.0
	var span := float(b["t"]) - float(a["t"])
	if span <= 0.0 or a["interp"] == "step":
		return INF
	var factor := 1.5 if a["interp"] == "ease" else 1.0
	return factor * dv * 1000.0 / span


static func _check(motion: Dictionary, by_name: Dictionary, duration_ms: float, clip: Dictionary, out: Array) -> void:
	for joint_name in motion:
		if not by_name.has(joint_name):
			_error(out, "track-joint-unknown", 'Controller has no joint "%s"' % joint_name)
			continue
		_check_keys(motion[joint_name], by_name[joint_name], duration_ms, clip, out)


static func _check_keys(keys: Array, joint: Dictionary, duration_ms: float, clip: Dictionary, out: Array) -> void:
	var name: String = joint["name"]
	var lo := float(joint["min"])
	var hi := float(joint["max"])
	var home := float(joint["home"])
	var max_velocity := float(joint["maxVelocity"])
	var unit := "°" if joint["type"] == "revolute" else "m"
	for i in keys.size():
		var t := float(keys[i]["t"])
		var v := float(keys[i]["v"])
		if t > duration_ms:
			_error(out, "key-after-end", "%s: key at %s ms is after the end" % [name, _fmt(t)])
		if i > 0 and t <= float(keys[i - 1]["t"]):
			var code := "keys-duplicate-time" if t == float(keys[i - 1]["t"]) else "keys-unsorted"
			_error(out, code, "%s: keys must have strictly increasing times" % name)
		if v < lo - EPS or v > hi + EPS:
			_error(out, "motion-out-of-range", "%s: %s%s at %s ms is outside [%s, %s]" % [name, _fmt(v), unit, _fmt(t), lo, hi])

	var effective := keys if not clip.is_empty() else Playback.with_home(keys, home)
	for i in range(1, effective.size()):
		var speed := segment_peak_velocity(effective[i - 1], effective[i])
		if speed > max_velocity + EPS:
			_error(
				out,
				"motion-velocity-exceeded",
				"%s: %s%s/s to %s ms exceeds %s%s/s" % [name, _fmt(speed), unit, _fmt(effective[i]["t"]), max_velocity, unit]
			)

	if not clip.is_empty() and not keys.is_empty():
		# Blends start from (and return to) wherever the timeline is, so assume the worst case: either limit.
		var blend := float(clip["blendMs"])
		for v in [Playback.sample_motion(keys, 0.0, home), Playback.sample_motion(keys, duration_ms, home)]:
			var worst := maxf(absf(v - lo), absf(hi - v))
			var speed := 0.0
			if blend > 0.0:
				speed = 1.5 * worst * 1000.0 / blend
			elif worst > EPS:
				speed = INF
			if speed > max_velocity + EPS:
				_error(out, "behavior-blend-too-fast", "%s: a blend could reach %s%s/s" % [name, _fmt(speed), unit])


static func _error(out: Array, code: String, message: String) -> void:
	out.append({"code": code, "message": message})


static func _fmt(n: float) -> String:
	if is_inf(n):
		return "∞"
	return str(snappedf(n, 0.01))
