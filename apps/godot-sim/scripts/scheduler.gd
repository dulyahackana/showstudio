extends RefCounted
## Port of BehaviorScheduler (packages/playback/src/runtime.ts). Runs once per
## attraction, in the local show controller, and its decisions are broadcast so
## every device starts the same response at the same show time.
## Rules: trigger + event match, inside window, past cooldown (measured from the end
## of the previous run), and no running behavior shares a device.

const Playback := preload("res://scripts/playback.gd")

var _schedules: Array
var _by_id := {}
var started: Array = []


func _init(schedules: Array) -> void:
	_schedules = schedules
	for s in schedules:
		_by_id[s["id"]] = s


## Behaviors started by this event, as [{id, startAt}].
func trigger(sensor_id: String, event: String, t: float) -> Array:
	var out := []
	for s in _schedules:
		if s["trigger"]["sensorId"] != sensor_id or s["trigger"]["event"] != event:
			continue
		var window = s.get("window")
		if window != null and (t < float(window["fromMs"]) or t > float(window["toMs"])):
			continue
		var last := _last_start(s["id"])
		if not last.is_empty() and t < Playback.behavior_end(s, float(last["startAt"])) + float(s["cooldownMs"]):
			continue
		if _busy(s, t):
			continue
		var entry := {"id": s["id"], "startAt": t}
		started.append(entry)
		out.append(entry)
	return out


func _last_start(behavior_id: String) -> Dictionary:
	for i in range(started.size() - 1, -1, -1):
		if started[i]["id"] == behavior_id:
			return started[i]
	return {}


func _busy(schedule: Dictionary, t: float) -> bool:
	for x in started:
		var other = _by_id.get(x["id"])
		if other == null:
			continue
		if t < float(x["startAt"]) or t >= Playback.behavior_end(other, float(x["startAt"])):
			continue
		for device_id in other["devices"]:
			if device_id in schedule["devices"]:
				return true
	return false
