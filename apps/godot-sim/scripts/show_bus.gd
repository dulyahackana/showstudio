extends Node
## The park-local network plus the local show controller (port of apps/fleet-sim/src/bus.ts).
## Sensor events, behavior decisions and console e-stops travel here, never through the
## cloud: a guest walking in gets a reaction, and an e-stop stops everything, even when
## the fleet manager is unreachable. The controller
## is the single arbiter, so every device starts the same response at the same show time.
## During a run the clock is show time; in standby (after a show completes) it is the
## time since the show ended.

signal sensor_fired(sensor_id: String, event: String)
signal run_started(sha256: String, bundle: Dictionary, start_local_ms: float)
## completed: the show reached its end (standby may follow); otherwise stopped, e-stopped or replaced.
signal run_ended(sha256: String, completed: bool)
signal behavior_started(sha256: String, behavior_id: String, start_at: float)
## An operator console's E-STOP: every controller latches at once (the hardwired stop circuit).
signal estop_pressed(by: String, reason: String)
## A reset the fleet manager accepted, relayed by a console so controllers cut off from the cloud clear too.
signal reset_relayed(by: String)
signal log_line(text: String)

const Net := preload("res://scripts/net.gd")
const Playback := preload("res://scripts/playback.gd")
const Scheduler := preload("res://scripts/scheduler.gd")

## {sha256, start_local, bundle, scheduler} while a show runs.
var _run := {}
## {sha256, start_local, bundle, scheduler} between shows, after a show completed.
var _standby := {}


func _init() -> void:
	sensor_fired.connect(_on_sensor)
	run_started.connect(_on_run_started)
	run_ended.connect(_on_run_ended)


func in_standby() -> bool:
	return _run.is_empty() and not _standby.is_empty()


## Sensor responses playing right now, in the run or in standby (for the HUD).
func playing_behaviors() -> Array:
	var live := _run if not _run.is_empty() else _standby
	if live.is_empty():
		return []
	var t := Net.now_ms() - float(live["start_local"])
	return live["scheduler"].started.filter(
		func(s): return t < Playback.behavior_end(Playback.find_behavior(live["bundle"], s["id"]), float(s["startAt"]))
	)


func _on_run_started(sha256: String, bundle: Dictionary, start_local_ms: float) -> void:
	# Every device announces the run; their clock offsets differ by a few ms.
	if not _run.is_empty() and _run["sha256"] == sha256 and absf(_run["start_local"] - start_local_ms) < 1000.0:
		return
	_run = {"sha256": sha256, "start_local": start_local_ms, "bundle": bundle, "scheduler": Scheduler.new(bundle["behaviors"])}
	_standby = {}


func _on_run_ended(sha256: String, completed: bool) -> void:
	if not _run.is_empty() and _run["sha256"] == sha256:
		var run := _run
		_run = {}
		var standby := Playback.standby_bundle(run["bundle"]) if completed else {}
		if not standby.is_empty():
			_standby = {
				"sha256": sha256,
				"start_local": float(run["start_local"]) + float(run["bundle"]["durationMs"]),
				"bundle": standby,
				"scheduler": Scheduler.new(standby["behaviors"]),
			}
			_log("standby: %d responses still answer guests" % standby["behaviors"].size())
	elif not completed and not _standby.is_empty() and _standby["sha256"] == sha256:
		_standby = {}
		_log("standby ended")


func _on_sensor(sensor_id: String, event: String) -> void:
	var running := not _run.is_empty()
	var live := _run if running else _standby
	if live.is_empty():
		_log("sensor %s:%s ignored (no show running, no standby)" % [sensor_id, event])
		return
	var t := Net.now_ms() - float(live["start_local"])
	if t < 0.0:
		return
	var when := "at %d ms" % int(t) if running else "in standby"
	var started: Array = live["scheduler"].trigger(sensor_id, event, t)
	if started.is_empty():
		_log("sensor %s:%s %s: no behavior eligible" % [sensor_id, event, when])
	for s in started:
		_log('sensor %s:%s %s -> behavior "%s"' % [sensor_id, event, when, s["id"]])
		behavior_started.emit(live["sha256"], s["id"], s["startAt"])


func _log(text: String) -> void:
	log_line.emit("[show-controller] " + text)
