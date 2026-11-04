extends Node
## One simulated controller with its own WebSocket and identity: a port of the
## reference device (apps/fleet-sim/src/device.ts). hello -> status heartbeats;
## deploy = download, verify hash + signature + contract schema + local limits, stage
## atomically; launch at the shared start time; play from the local copy even if the
## cloud disappears.

signal changed
signal log_line(text: String)
## An audio device reached a cue. offset_s > 0 when the frame came late.
signal cue_started(device_id: String, cue: Dictionary, bytes: PackedByteArray, offset_s: float)
signal playback_finished(device_id: String)

const Net := preload("res://scripts/net.gd")
const Playback := preload("res://scripts/playback.gd")
const Validator := preload("res://scripts/validator.gd")

const PROTOCOL_VERSION := 1
const MAX_STAGED := 5
const CLOSE_REPLACED := 4005

var device_id: String
var kind: String
var display_name: String
## "offline" | "connecting" | "online" | "replaced"
var link := "offline"
var estopped := false
var fault = null
## {sha256, bundle, start_local, started, last_audio_t} while a show is armed or running.
var active := {}
## The same between shows, after a show completed: its standby responses on a clock that
## starts at the show's end.
var standby := {}
## sha256 -> {info: StagedShow, bundle: Dictionary or null}
var staged := {}
var pose := {}
var light := {}
## Consoles: the E-STOP mushroom is pushed in (it stays in until twisted out).
var estop_pressed := false
## Consoles: what the display shows (a PanelMsg from the fleet manager), the prepared show
## the operator selected, and the last refusal.
var panel := {}
var selected := ""
var notice := ""

var _api_url: String
var _environment_id: String
var _token: String
var _character_ref = null
var _local_limits: Array = []
var _public_key: CryptoKey
var _contract: RefCounted
var _bus: Node
var _store_dir: String
var _firmware := "godot-sim-0.1.0"
var _corrupt_downloads := false
var _ws: WebSocketPeer
var _socket_active := false
var _hello_sent := false
var _welcomed := false
var _stopped := false
var _offset_ms := 0.0
var _heartbeat_ms := 1000.0
var _next_heartbeat_ms := 0.0
var _reconnect_at_ms := 0.0
var _backoff_ms := 500.0
var _seen_ops: Array[String] = []
var _audio := {}


## device: ProvisionedDevice; limits: the joint limits this controller holds (figures only).
func setup(options: Dictionary) -> void:
	var device: Dictionary = options["device"]
	device_id = device["deviceId"]
	kind = device["kind"]
	display_name = device["name"]
	_token = device["token"]
	_character_ref = options.get("character_ref_override", device["characterRef"])
	_api_url = options["api_url"]
	_environment_id = options["environment_id"]
	_local_limits = options.get("limits", [])
	_public_key = options["public_key"]
	_contract = options["contract"]
	_bus = options["bus"]
	_corrupt_downloads = options.get("corrupt_downloads", false)
	_store_dir = String(options["data_dir"]).path_join(_environment_id).path_join(device_id)
	name = device_id
	_home()
	_bus.behavior_started.connect(_on_behavior_started)
	_bus.estop_pressed.connect(_on_bus_estop)
	_bus.reset_relayed.connect(_on_bus_reset)


func _ready() -> void:
	_load_from_disk()
	_connect_socket()


func _exit_tree() -> void:
	_stopped = true
	if _ws != null:
		_ws.close()


func state() -> String:
	if estopped:
		return "estopped"
	if fault != null:
		return "faulted"
	if kind == "console":
		return "ready"
	if not active.is_empty():
		return "armed" if Net.now_ms() < active["start_local"] else "running"
	if not standby.is_empty():
		return "standby"
	for s in staged.values():
		if s["info"]["status"] == "staged":
			return "ready"
	return "idle"


func show_time_ms() -> float:
	return -1.0 if active.is_empty() else Net.now_ms() - float(active["start_local"])


func staged_shows() -> Array:
	return staged.values().map(func(s): return s["info"])


## Simulated guest input (stage trigger zones, keyboard, mouse) or the studio's
## simulateSensor command: decided locally, reported to the cloud as telemetry only.
func fire_sensor(event: String) -> void:
	if kind != "sensor":
		return
	_log("sensor fired: %s" % event)
	_bus.sensor_fired.emit(device_id, event)
	_send({"type": "sensorEvent", "sensorId": device_id, "event": event, "at": roundf(Net.now_ms() + _offset_ms)})


func _process(_delta: float) -> void:
	_poll_socket()
	_tick()


# ---- connection --------------------------------------------------------------------


func _connect_socket() -> void:
	if _stopped:
		return
	_ws = WebSocketPeer.new()
	_hello_sent = false
	_welcomed = false
	var url := "ws" + _api_url.substr(4) if _api_url.begins_with("http") else _api_url
	var err := _ws.connect_to_url(url + "/api/v1/devices/ws")
	_socket_active = err == OK
	link = "connecting" if _socket_active else "offline"
	if not _socket_active:
		_schedule_reconnect()


func _schedule_reconnect() -> void:
	_reconnect_at_ms = Time.get_ticks_msec() + _backoff_ms
	_backoff_ms = minf(_backoff_ms * 2.0, 10000.0)


func _poll_socket() -> void:
	if _stopped or link == "replaced":
		return
	if not _socket_active:
		if Time.get_ticks_msec() >= _reconnect_at_ms:
			_connect_socket()
		return
	_ws.poll()
	match _ws.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			if not _hello_sent:
				_hello_sent = true
				_send(
					{
						"type": "hello",
						"protocolVersion": PROTOCOL_VERSION,
						"deviceId": device_id,
						"environmentId": _environment_id,
						"kind": kind,
						"firmware": _firmware,
						"characterRef": _character_ref,
						"token": _token,
					}
				)
			while _ws.get_available_packet_count() > 0:
				_on_message(_ws.get_packet().get_string_from_utf8())
			if _welcomed and Time.get_ticks_msec() >= _next_heartbeat_ms:
				_send_status()
		WebSocketPeer.STATE_CLOSED:
			_socket_active = false
			_welcomed = false
			var code := _ws.get_close_code()
			if code == CLOSE_REPLACED:
				# Another controller connected with this identity (e.g. the Node fleet sim): don't fight it.
				link = "replaced"
				_log("replaced by another connection with the same device id; not reconnecting")
			else:
				link = "offline"
				_schedule_reconnect()
			changed.emit()


func _send(msg: Dictionary) -> void:
	if _ws != null and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_ws.send_text(JSON.stringify(msg))


func _send_status() -> void:
	_next_heartbeat_ms = Time.get_ticks_msec() + _heartbeat_ms
	var a = null
	if not active.is_empty():
		a = {
			"sha256": active["sha256"],
			"startAt": roundf(active["start_local"] + _offset_ms),
			"showTimeMs": roundf(maxf(0.0, show_time_ms())),
		}
	var status := {"type": "status", "state": state(), "staged": staged_shows(), "active": a, "fault": fault}
	if kind == "console":
		status["estopPressed"] = estop_pressed
	_send(status)
	changed.emit()


func _ack(op_id: String, error := "") -> void:
	_send({"type": "ack", "opId": op_id, "ok": error == "", "error": null if error == "" else error})


func _on_message(text: String) -> void:
	var msg = JSON.parse_string(text)
	var invalid: String = _contract.validate(msg, "FleetToDevice") if msg != null else "not JSON"
	if invalid != "":
		_log("ignored malformed message from fleet manager (%s)" % invalid)
		return
	if msg.has("opId"):
		var op: String = msg["opId"]
		if op in _seen_ops and msg["type"] != "deploy":
			_ack(op)
			return
		_seen_ops.append(op)
		if _seen_ops.size() > 200:
			_seen_ops.pop_front()
	match msg["type"]:
		"welcome":
			_offset_ms = float(msg["serverTime"]) - Net.now_ms()
			_backoff_ms = 500.0
			_heartbeat_ms = float(msg["heartbeatMs"])
			_welcomed = true
			link = "online"
			_send_status()
		"deploy":
			_deploy(msg)
		"remove":
			if standby.get("sha256") == msg["sha256"]:
				_finish("removed from this controller")
			if active.get("sha256") != msg["sha256"]:
				staged.erase(msg["sha256"])
				DirAccess.remove_absolute(_store_dir.path_join(msg["sha256"] + ".json"))
			_ack(msg["opId"])
			_send_status()
		"launch":
			_launch(msg["opId"], msg["sha256"], float(msg["startAt"]))
		"stop":
			_finish("stopped by operator")
			_ack(msg["opId"])
			_send_status()
		"estop":
			estopped = true
			_finish("E-STOP: %s" % msg["reason"])
			_ack(msg["opId"])
			_send_status()
		"reset":
			estopped = false
			_log("e-stop reset")
			# Consoles carry the reset over the park network, like the e-stop itself.
			if kind == "console":
				_bus.reset_relayed.emit(device_id)
			_ack(msg["opId"])
			_send_status()
		"simulateSensor":
			if kind != "sensor":
				_ack(msg["opId"], "not a sensor")
				return
			fire_sensor(msg["event"])
			_ack(msg["opId"])
		"panel":
			panel = msg
			# Keep the operator's choice while it is still prepared; otherwise the first good-to-go show.
			var shows: Array = msg["prepared"]
			if not shows.any(func(p): return p["sha256"] == selected):
				var ready := shows.filter(func(p): return p["goodToGo"])
				selected = (ready[0] if not ready.is_empty() else shows[0])["sha256"] if not shows.is_empty() else ""
			changed.emit()
		"simulateConsole":
			if kind != "console":
				_ack(msg["opId"], "not a console")
				return
			press(msg["button"])
			_ack(msg["opId"])
		"error":
			if msg["code"] == "console-refused":
				notice = msg["message"]
				changed.emit()
			_log("fleet manager error: %s %s" % [msg["code"], msg["message"]])


# ---- operator console -----------------------------------------------------------------


## Consoles: an operator presses a button (the 3D panel, the keyboard or the studio's
## simulateConsole). E-STOP latches every controller over the park network first, then
## tells the fleet manager; the mushroom stays in until twisted out ("release"). RUN and
## RESET ask the fleet manager, which may refuse: the refusal shows on the display.
func press(button: String) -> void:
	if kind != "console":
		return
	notice = ""
	match button:
		"estop":
			if estop_pressed:
				return
			estop_pressed = true
			_log("E-STOP pressed")
			_bus.estop_pressed.emit(device_id, "E-STOP pressed on %s" % device_id)
			_report("estop")
			_send_status()
		"release":
			if not estop_pressed:
				return
			estop_pressed = false
			_log("E-STOP twisted out")
			_send_status()
		"select":
			var shows: Array = panel.get("prepared", [])
			if not shows.is_empty():
				var i := shows.map(func(p): return p["sha256"]).find(selected)
				selected = shows[(i + 1) % shows.size()]["sha256"]
		"run":
			if estop_pressed:
				notice = "Twist the E-STOP out and reset first"
			elif link != "online":
				notice = "Studio unreachable: starting needs every controller checked"
			elif selected == "":
				notice = "No prepared show"
			else:
				_report("run", selected)
		"reset":
			if estop_pressed:
				notice = "Twist the E-STOP out first"
			elif link != "online":
				notice = "Studio unreachable: reset needs the fleet manager"
			else:
				_report("reset")
	changed.emit()


## Consoles: the three display lines, from the panel state the fleet manager sends.
func display_lines() -> PackedStringArray:
	var head := "READY"
	var run = panel.get("run")
	if estop_pressed:
		head = "E-STOP PRESSED - twist out, then RESET"
	elif estopped or panel.get("estop", {}).get("active", false):
		head = "E-STOP LATCHED - press RESET"
	elif link != "online":
		head = "OFFLINE - E-STOP still works"
	elif run != null:
		var t: float = Net.now_ms() + _offset_ms - float(run["startAt"])
		head = (
			"STARTING  T-%.1f s" % (-t / 1000.0)
			if t < 0.0
			else "RUNNING  %s / %s" % [_mmss(t), _mmss(float(run["durationMs"]))]
		)
	var show := "No prepared show"
	for p in panel.get("prepared", []):
		if p["sha256"] == selected:
			show = "> %s r%d  %s" % [p["name"], int(p["revision"]), "good to go" if p["goodToGo"] else "staging..."]
	return PackedStringArray([head, show, notice])


func _report(action: String, sha = null) -> void:
	_send({"type": "console", "action": action, "sha256": sha, "at": roundf(Net.now_ms() + _offset_ms)})


func _on_bus_estop(_by: String, reason: String) -> void:
	if estopped:
		return
	estopped = true
	_finish("E-STOP: %s" % reason)
	_send_status()


func _on_bus_reset(by: String) -> void:
	if not estopped or by == device_id:
		return
	estopped = false
	_log("e-stop reset (relayed by %s)" % by)
	_send_status()


static func _mmss(ms: float) -> String:
	var s := int(maxf(0.0, ms) / 1000.0)
	return "%d:%02d" % [s / 60, s % 60]


# ---- staging ------------------------------------------------------------------------


func _headers() -> PackedStringArray:
	return PackedStringArray(
		["x-device-id: " + device_id, "x-environment-id: " + _environment_id, "x-device-token: " + _token]
	)


func _load_from_disk() -> void:
	var dir := DirAccess.open(_store_dir)
	if dir == null:
		return
	var hex := RegEx.create_from_string("^[a-f0-9]{64}\\.json$")
	for file in dir.get_files():
		if hex.search(file) == null:
			continue
		var bytes := FileAccess.get_file_as_bytes(_store_dir.path_join(file))
		var sha := file.substr(0, 64)
		if Net.sha256_hex(bytes) != sha:
			continue  # corrupted on disk: let the fleet manager redeploy it
		var bundle = JSON.parse_string(bytes.get_string_from_utf8())
		if _contract.validate(bundle) != "":
			continue
		var info := {"sha256": sha, "showId": bundle["show"]["id"], "revision": int(bundle["show"]["revision"])}
		info.merge({"status": "staged", "reason": null})
		staged[sha] = {"info": info, "bundle": bundle}


func _deploy(msg: Dictionary) -> void:
	var sha: String = msg["sha256"]
	if staged.has(sha) and staged[sha]["info"]["status"] != "rejected":
		_ack(msg["opId"])
		return
	var info := {"sha256": sha, "showId": msg["showId"], "revision": int(msg["revision"]), "status": "downloading"}
	info["reason"] = null
	staged[sha] = {"info": info, "bundle": null}
	_send_status()
	var result: Dictionary = await _verify(msg)
	if result.has("bundle"):
		var bundle: Dictionary = result["bundle"]
		Net.write_atomic(_store_dir.path_join(sha + ".json"), result["bytes"])
		staged[sha] = {"info": info.merged({"status": "staged"}, true), "bundle": bundle}
		_evict()
		_log("staged %s r%d (%s)" % [bundle["show"]["name"], int(bundle["show"]["revision"]), sha.substr(0, 8)])
		_ack(msg["opId"])
	else:
		staged[sha] = {"info": info.merged({"status": "rejected", "reason": result["reason"]}, true), "bundle": null}
		_log("REJECTED %s: %s" % [sha.substr(0, 8), result["reason"]])
		_ack(msg["opId"], result["reason"])
	_send_status()


## {bundle, bytes} when the show may be staged on this controller, otherwise {reason}.
func _verify(msg: Dictionary) -> Dictionary:
	var res: Dictionary = await Net.get_bytes(self, _api_url + msg["url"], _headers())
	if not res["ok"]:
		return {"reason": "download of %s failed: %s" % [msg["url"], res["error"]]}
	var bytes: PackedByteArray = res["body"]
	if _corrupt_downloads and bytes.size() > 10:
		bytes[10] = bytes[10] ^ 0xff
	if Net.sha256_hex(bytes) != msg["sha256"]:
		return {"reason": "hash mismatch"}
	if not Net.verify_signature(bytes, msg["signature"], _public_key):
		return {"reason": "invalid signature"}
	var bundle = JSON.parse_string(bytes.get_string_from_utf8())
	var invalid: String = _contract.validate(bundle) if bundle != null else "not JSON"
	if invalid != "":
		return {"reason": "bundle does not match schema version 1 (%s)" % invalid}
	var payload = bundle["devices"].get(device_id)
	if payload == null:
		return {"reason": "bundle has no payload for this device"}
	if payload["kind"] != kind:
		return {"reason": "bundle targets a %s, this is a %s" % [payload["kind"], kind]}
	if kind == "doll":
		var mine := _ref_key(_character_ref) if _character_ref != null else ""
		if mine != _ref_key(payload["character"]["ref"]):
			return {"reason": "definition mismatch: controller has %s" % (mine if mine != "" else "none")}
		var errors := Validator.validate_doll_payload(
			payload, _local_limits, float(bundle["durationMs"]), bundle["behaviors"]
		)
		if not errors.is_empty():
			return {"reason": "limit check failed: %s" % errors[0]["message"]}
	if kind == "audio":
		for asset_id in payload["assets"]:
			var asset: Dictionary = await Net.get_bytes(self, _api_url + payload["assets"][asset_id]["path"], _headers())
			if not asset["ok"] or Net.sha256_hex(asset["body"]) != asset_id:
				return {"reason": "audio asset %s corrupted" % asset_id.substr(0, 8)}
			Net.write_atomic(_store_dir.path_join("assets").path_join(asset_id), asset["body"])
			_audio[asset_id] = asset["body"]
	return {"bundle": bundle, "bytes": bytes}


func _evict() -> void:
	var keys := staged.keys()
	var keep := keys.slice(maxi(0, keys.size() - MAX_STAGED))
	for sha in keys:
		if not (sha in keep) and sha != active.get("sha256"):
			staged.erase(sha)


static func _ref_key(ref: Dictionary) -> String:
	return "%s@%d" % [ref["id"], int(ref["revision"])]


# ---- playback ------------------------------------------------------------------------


func _launch(op_id: String, sha: String, start_at: float) -> void:
	var entry = staged.get(sha)
	var refusal := ""
	if estopped:
		refusal = "e-stop latched"
	elif entry == null or entry["info"]["status"] != "staged" or entry["bundle"] == null:
		refusal = "show not staged"
	elif not active.is_empty():
		refusal = "a show is already active"
	if refusal != "":
		_ack(op_id, refusal)
		return
	_finish("a show was launched")  # ends standby
	var bundle: Dictionary = entry["bundle"]
	var start_local := start_at - _offset_ms
	active = {"sha256": sha, "bundle": bundle, "start_local": start_local, "started": [], "last_audio_t": -1.0}
	_bus.run_started.emit(sha, bundle, start_local)
	_log("armed: %s starts in %d ms" % [bundle["show"]["name"], int(start_local - Net.now_ms())])
	_ack(op_id)
	_send_status()


func _on_behavior_started(sha: String, behavior_id: String, start_at: float) -> void:
	var live := active if not active.is_empty() else standby
	if live.is_empty() or live["sha256"] != sha:
		return
	var schedule := Playback.find_behavior(live["bundle"], behavior_id)
	if not schedule.is_empty() and device_id in schedule["devices"]:
		live["started"].append({"id": behavior_id, "startAt": start_at})


func _tick() -> void:
	if active.is_empty():
		if not standby.is_empty():
			_output(standby, Net.now_ms() - float(standby["start_local"]))
		return
	var t := show_time_ms()
	if t < 0.0:
		return
	if t >= float(active["bundle"]["durationMs"]):
		_finish("completed")
		_send_status()
		return
	_output(active, t)


func _output(live: Dictionary, t: float) -> void:
	var bundle: Dictionary = live["bundle"]
	var payload: Dictionary = bundle["devices"][device_id]
	var behavior := Playback.active_behavior_for(bundle, device_id, t, live["started"])
	match kind:
		"doll":
			pose = Playback.sample_doll_pose(payload, t, behavior)
		"light":
			light = Playback.sample_light_state(payload, t, behavior)
		"audio":
			for e in Playback.audio_events_between(payload, bundle, live["last_audio_t"], t, live["started"]):
				var cue: Dictionary = e["cue"]
				_log("♪ %s (%s dBFS) at %d ms" % [cue["label"], cue["volumeDb"], int(e["at"])])
				# The controller enforces its own ceiling, whatever the bundle says.
				var level := minf(float(cue["volumeDb"]), float(payload["maxVolumeDb"]))
				cue_started.emit(device_id, cue.merged({"volumeDb": level}, true), _audio_bytes(cue["assetId"]), (t - e["at"]) / 1000.0)
			live["last_audio_t"] = t


func _audio_bytes(asset_id: String) -> PackedByteArray:
	if not _audio.has(asset_id):
		_audio[asset_id] = FileAccess.get_file_as_bytes(_store_dir.path_join("assets").path_join(asset_id))
	return _audio[asset_id]


## Ends the run (a completed show may go on in standby) or, with no run, ends standby.
func _finish(reason: String) -> void:
	var live := active if not active.is_empty() else standby
	if live.is_empty():
		return
	var completed := not active.is_empty() and reason == "completed"
	var what: String = live["bundle"]["show"]["name"]
	if active.is_empty():
		what = "standby (%s)" % what
	active = {}
	standby = {}
	_bus.run_ended.emit(live["sha256"], completed)
	_log("%s: %s" % [what, reason])
	# Real controllers home at reduced speed; the sim snaps to home.
	_home()
	playback_finished.emit(device_id)
	var quiet := Playback.standby_bundle(live["bundle"]) if completed else {}
	if not quiet.is_empty():
		standby = {
			"sha256": live["sha256"],
			"bundle": quiet,
			"start_local": float(live["start_local"]) + float(live["bundle"]["durationMs"]),
			"started": [],
			"last_audio_t": -1.0,
		}
		_log("standby: answering guests between shows")


func _home() -> void:
	pose = {}
	for j in _local_limits:
		pose[j["name"]] = float(j["home"])
	light = {}


func _log(text: String) -> void:
	log_line.emit("[%s] %s" % [device_id, text])
