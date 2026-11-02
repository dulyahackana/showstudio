extends Node
## The park-local network plus the local show controller (port of apps/fleet-sim/src/bus.ts).
## Sensor events and behavior decisions travel here, never through the cloud: a guest
## walking in gets a reaction even when the fleet manager is unreachable. The controller
## is the single arbiter, so every device starts the same response at the same show time.

signal sensor_fired(sensor_id: String, event: String)
signal run_started(sha256: String, bundle: Dictionary, start_local_ms: float)
signal run_ended(sha256: String)
signal behavior_started(sha256: String, behavior_id: String, start_at: float)
signal log_line(text: String)

const Net := preload("res://scripts/net.gd")
const Scheduler := preload("res://scripts/scheduler.gd")

## {sha256, start_local, scheduler} while a show runs.
var _run := {}


func _ready() -> void:
	sensor_fired.connect(_on_sensor)
	run_started.connect(_on_run_started)
	run_ended.connect(_on_run_ended)


## Behaviors started in the current run (for the HUD).
func started_behaviors() -> Array:
	return [] if _run.is_empty() else _run["scheduler"].started


func _on_run_started(sha256: String, bundle: Dictionary, start_local_ms: float) -> void:
	# Every device announces the run; their clock offsets differ by a few ms.
	if not _run.is_empty() and _run["sha256"] == sha256 and absf(_run["start_local"] - start_local_ms) < 1000.0:
		return
	_run = {"sha256": sha256, "start_local": start_local_ms, "scheduler": Scheduler.new(bundle["behaviors"])}


func _on_run_ended(sha256: String) -> void:
	if not _run.is_empty() and _run["sha256"] == sha256:
		_run = {}


func _on_sensor(sensor_id: String, event: String) -> void:
	if _run.is_empty():
		_log("sensor %s:%s ignored (no show running)" % [sensor_id, event])
		return
	var t := Net.now_ms() - float(_run["start_local"])
	if t < 0.0:
		return
	var started: Array = _run["scheduler"].trigger(sensor_id, event, t)
	if started.is_empty():
		_log("sensor %s:%s at %d ms: no behavior eligible" % [sensor_id, event, int(t)])
	for s in started:
		_log('sensor %s:%s at %d ms -> behavior "%s"' % [sensor_id, event, int(t), s["id"]])
		behavior_started.emit(_run["sha256"], s["id"], s["startAt"])


func _log(text: String) -> void:
	log_line.emit("[show-controller] " + text)
