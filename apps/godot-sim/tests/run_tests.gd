extends SceneTree
## Conformance and unit checks for the Godot port; exits non-zero on any failure.
## The vectors are generated from the TypeScript implementation, so passing them means
## the simulator samples, arbitrates and validates exactly like the editor and devices.
##
##   godot --headless --path apps/godot-sim --script res://tests/run_tests.gd

const JsonSchema := preload("res://scripts/json_schema.gd")
const Net := preload("res://scripts/net.gd")
const Playback := preload("res://scripts/playback.gd")
const Scheduler := preload("res://scripts/scheduler.gd")
const Validator := preload("res://scripts/validator.gd")
const Figure := preload("res://scripts/figure.gd")
const ShowBus := preload("res://scripts/show_bus.gd")
const SimDevice := preload("res://scripts/sim_device.gd")

var _failures := 0
var _passes := 0
var _repo := ProjectSettings.globalize_path("res://").path_join("../..").simplify_path()


func _initialize() -> void:
	var vectors: Dictionary = _json(_repo.path_join("test-vectors/playback.json"))
	var tol := float(vectors["tolerance"])

	for c in vectors["motion"]:
		_case("motion: " + c["name"], func():
			for s in c["samples"]:
				_close(Playback.sample_joint(c["keys"], float(c["home"]), s[0]), s[1], tol, "t=%d" % s[0])
		)
	for c in vectors["lights"]:
		_case("lights: " + c["name"], func():
			for s in c["samples"]:
				_close(Playback.sample_light(c["keys"], s[0]), s[1], tol, "t=%d" % s[0])
		)
	for c in vectors["frames"]:
		_case("frames: " + c["name"], func():
			for s in c["samples"]:
				_close(Playback.sample_frame(c["bundle"], s["t"], c["started"]), s["frame"], tol, "t=%d" % s["t"])
		)
		_case("audio: " + c["name"], func():
			for device_id in c["audio"]:
				var payload: Dictionary = c["bundle"]["devices"][device_id]
				var events := Playback.audio_events_between(payload, c["bundle"], -1.0, float(c["bundle"]["durationMs"]), c["started"])
				var got := events.map(func(e): return {"cueId": e["cue"]["id"], "at": e["at"]})
				_close(got, c["audio"][device_id], tol, device_id)
		)
	for c in vectors["scheduler"]:
		_case("scheduler: " + c["name"], func():
			var scheduler := Scheduler.new(c["behaviors"])
			for step in c["steps"]:
				_close(scheduler.trigger(step["sensorId"], step["event"], step["t"]), step["started"], tol, "t=%d" % step["t"])
		)
	for c in vectors["deviceChecks"]:
		_case("device check: " + c["name"], func():
			var codes := {}
			for issue in Validator.validate_doll_payload(c["payload"], c["limits"], float(c["durationMs"]), c["behaviors"]):
				codes[issue["code"]] = true
			var got := codes.keys()
			got.sort()
			_close(got, c["errors"], tol, "error codes")
		)

	for c in vectors["standby"]:
		_case("standby: " + c["name"], func():
			_close(Playback.standby_bundle(c["bundle"]), c["standby"] if c["standby"] != null else {}, tol, "standby")
		)
	_case("show controller: answers guests in standby after a completed show, until stopped", func():
		var bus: Node = ShowBus.new()
		var fired := []
		bus.behavior_started.connect(func(_sha, id, _at): fired.append(id))
		var b: Dictionary = vectors["standby"][1]["bundle"]
		bus.sensor_fired.emit("door", "enter")
		_check(fired.is_empty(), "ignored with no show and no standby")
		bus.run_started.emit("sha", b, Net.now_ms() - float(b["durationMs"]) - 1000.0)
		bus.run_ended.emit("sha", true)
		_check(bus.in_standby(), "standby once the show completes")
		bus.sensor_fired.emit("door", "enter")
		_check(fired == ["wave"], "a guest still gets the response, outside its show window: %s" % [fired])
		bus.run_ended.emit("sha", false)
		_check(not bus.in_standby(), "stop ends standby")
		bus.sensor_fired.emit("door", "enter")
		_check(fired.size() == 1, "nothing after standby ended")
		bus.free()
	)

	var sig: Dictionary = _json(_repo.path_join("test-vectors/signature.json"))
	_case("signature: accepts the studio signature, rejects one changed byte", func():
		var key := Net.load_public_key(sig["publicKeyPem"])
		_check(key != null, "public key loads")
		var message := Marshalls.base64_to_raw(sig["message"])
		_check(Net.verify_signature(message, sig["signature"], key), "valid signature verifies")
		message[0] = message[0] ^ 1
		_check(not Net.verify_signature(message, sig["signature"], key), "tampered bytes are rejected")
	)

	var contract = JsonSchema.load_file(_repo.path_join("contracts/json-schema/ShowBundle.json"))
	var bundle: Dictionary = vectors["frames"][0]["bundle"]
	_case("contract: bundle and fleet messages validate against the published JSON Schema", func():
		_check(contract.validate(bundle) == "", "compiled bundle is valid: " + contract.validate(bundle))
		var broken := bundle.duplicate(true)
		broken["devices"]["robot-01"]["motion"]["head_yaw"][0]["interp"] = "cubic"
		_check(contract.validate(broken) != "", "unknown interp is rejected")
		broken = bundle.duplicate(true)
		broken.erase("durationMs")
		_check(contract.validate(broken) != "", "missing field is rejected")
		broken = bundle.duplicate(true)
		broken["schemaVersion"] = 2
		_check(contract.validate(broken) != "", "unknown schema version is rejected")
		var launch := {"type": "launch", "opId": "op-1", "sha256": "a".repeat(64), "startAt": 1.7e12}
		_check(contract.validate(launch, "FleetToDevice") == "", "launch message is valid")
		_check(contract.validate({"type": "launch", "opId": "op-1"}, "FleetToDevice") != "", "incomplete launch is rejected")
		_check(contract.validate({"type": "selfDestruct"}, "FleetToDevice") != "", "unknown command is rejected")
		var status := {"type": "status", "state": "ready", "staged": [], "active": null, "fault": null}
		_check(contract.validate(status, "DeviceToFleet") == "", "status message is valid")
	)

	_case("console: its E-STOP latches every controller over the park network; RUN and RESET ask the studio", func():
		var bus: Node = ShowBus.new()
		var make := func(id: String, kind: String):
			var d = SimDevice.new()
			d.setup({
				"device": {"deviceId": id, "kind": kind, "name": id, "token": "t", "characterRef": null},
				"api_url": "http://127.0.0.1:9",
				"environment_id": "lab",
				"public_key": null,
				"contract": contract,
				"bus": bus,
				"data_dir": OS.get_user_data_dir(),
			})
			return d
		var console = make.call("console-01", "console")
		var light = make.call("light-01", "light")
		_check(console.state() == "ready", "a console is ready for its operator")
		var demo := {"sha256": "a".repeat(64), "showId": "demo", "revision": 1, "name": "Demo", "goodToGo": false}
		var finale := {"sha256": "b".repeat(64), "showId": "finale", "revision": 2, "name": "Finale", "goodToGo": true}
		var panel := {"type": "panel", "prepared": [demo, finale], "run": null, "estop": {"active": false, "by": null, "reason": null}}
		_check(contract.validate(panel, "FleetToDevice") == "", "panel message is valid: " + contract.validate(panel, "FleetToDevice"))
		console._on_message(JSON.stringify(panel))
		_check(console.selected == finale["sha256"], "the display selects the first good-to-go show")
		_check(console.display_lines()[1].contains("Finale r2"), "and shows it: %s" % console.display_lines()[1])
		console.press("select")
		_check(console.selected == demo["sha256"], "NEXT cycles through the prepared shows")
		console.press("run")
		_check(console.notice.containsn("unreachable"), "RUN needs the studio: %s" % console.notice)

		console.press("estop")
		_check(console.estop_pressed and light.estopped, "E-STOP latches the light locally, no cloud involved")
		_check(console.display_lines()[0].begins_with("E-STOP PRESSED"), "display: %s" % console.display_lines()[0])
		console.press("reset")
		_check(console.notice.containsn("twist"), "no reset while the mushroom is pushed in")
		console.press("release")
		_check(not console.estop_pressed and light.estopped, "twisting it out does not clear the latch")
		console._on_message(JSON.stringify({"type": "reset", "opId": "op-reset"}))
		_check(not light.estopped and not console.estopped, "an accepted reset is relayed to every controller")
		var report := {"type": "console", "action": "run", "sha256": finale["sha256"], "at": 1.7e12}
		_check(contract.validate(report, "DeviceToFleet") == "", "console message is valid")
		console.free()
		light.free()
		bus.free()
	)

	_case("figure: joints drive skeleton bones, not same-named attachment nodes", func():
		# The wizard's hat hangs off "head" in a BoneAttachment3D also called "head"; posing must turn the bone.
		var figure: Node3D = Figure.new()
		root.add_child(figure)
		figure.setup({"footprint": {"size": [1, 2, 1]}, "joints": [
			{"name": "head_turn", "node": "head", "type": "revolute", "axis": [0, 1, 0], "home": 0},
			{"name": "head_nod", "node": "head", "type": "revolute", "axis": [1, 0, 0], "home": 0},
		]})
		var err: String = figure.load_glb(FileAccess.get_file_as_bytes(_repo.path_join("samples/wizard.glb")))
		_check(err == "", "wizard loads: " + err)
		var skeleton: Skeleton3D = figure.find_children("*", "Skeleton3D", true, false)[0]
		var head := skeleton.find_bone("head")
		var rest := skeleton.get_bone_pose_rotation(head)
		figure.apply_pose({"head_turn": 60.0})
		var turned := rad_to_deg(rest.angle_to(skeleton.get_bone_pose_rotation(head)))
		_check(absf(turned - 60.0) < 0.5, "head bone turns 60 degrees (turned %.1f)" % turned)
		figure.free()
	)

	print("\n%d passed, %d failed" % [_passes, _failures])
	quit(1 if _failures > 0 else 0)


var _current_ok := true
var _current_errors: Array[String] = []


func _case(title: String, body: Callable) -> void:
	_current_ok = true
	_current_errors.clear()
	body.call()
	if _current_ok:
		_passes += 1
		print("  ✓ %s" % title)
	else:
		_failures += 1
		print("  ✗ %s" % title)
		for e in _current_errors.slice(0, 5):
			print("      %s" % e)


func _check(ok: bool, what: String) -> void:
	if not ok:
		_current_ok = false
		_current_errors.append(what)


## Deep comparison with numeric tolerance, mirroring conformance.test.ts.
func _close(actual, expected, tol: float, path: String) -> void:
	match typeof(expected):
		TYPE_FLOAT, TYPE_INT:
			var is_number := typeof(actual) in [TYPE_FLOAT, TYPE_INT]
			_check(is_number and absf(float(actual) - float(expected)) <= tol, "%s: %s != %s" % [path, actual, expected])
		TYPE_DICTIONARY:
			if typeof(actual) != TYPE_DICTIONARY:
				_check(false, "%s: expected an object, got %s" % [path, actual])
				return
			var a: Array = actual.keys()
			var e: Array = expected.keys()
			a.sort()
			e.sort()
			if a != e:
				_check(false, "%s: keys %s != %s" % [path, a, e])
				return
			for k in expected:
				_close(actual[k], expected[k], tol, "%s.%s" % [path, k])
		TYPE_ARRAY:
			if typeof(actual) != TYPE_ARRAY or actual.size() != expected.size():
				_check(false, "%s: %s != %s" % [path, actual, expected])
				return
			for i in expected.size():
				_close(actual[i], expected[i], tol, "%s[%d]" % [path, i])
		_:
			_check(actual == expected, "%s: %s != %s" % [path, actual, expected])


func _json(path: String) -> Dictionary:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("cannot read %s" % path)
		quit(2)
		return {}
	return parsed
