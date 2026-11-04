extends Node3D
## Godot twin of an attraction. Provisions like a site installer would, boots one
## simulated controller per device (each with its own WebSocket and identity), builds
## the stage from the provisioned layout and renders what the controllers play. The
## studio deploys to it exactly as it deploys to a park (docs/engine-integration.md).
##
##   godot --path apps/godot-sim -- --api http://localhost:4000 --env dragons-lair

const Attraction := preload("res://scripts/attraction.gd")
const Hud := preload("res://scripts/hud.gd")
const JsonSchema := preload("res://scripts/json_schema.gd")
const Net := preload("res://scripts/net.gd")
const OrbitCamera := preload("res://scripts/orbit_camera.gd")
const ShowBus := preload("res://scripts/show_bus.gd")
const SimDevice := preload("res://scripts/sim_device.gd")

var config := {}
var devices: Array = []
var bus: ShowBus
var attraction: Attraction
var camera: OrbitCamera
var hud: Hud
var _trace_in := 0.0


func _ready() -> void:
	config = parse_args(OS.get_cmdline_user_args())
	# Several twins can run at once (one per attraction); tell their windows apart.
	DisplayServer.window_set_title("Show Studio · %s" % config["env"])
	if DisplayServer.get_name() == "headless":
		Engine.max_fps = 60
	get_viewport().physics_object_picking = true
	bus = ShowBus.new()
	bus.name = "LocalBus"
	bus.log_line.connect(log_line)
	add_child(bus)
	attraction = Attraction.new()
	attraction.log_line.connect(log_line)
	add_child(attraction)
	camera = OrbitCamera.new()
	add_child(camera)
	attraction.camera = camera
	hud = Hud.new()
	add_child(hud)
	hud.setup(self)

	var contract = JsonSchema.load_file(config["contracts"].path_join("ShowBundle.json"))
	if contract == null:
		_fatal("Contract schema missing at %s (pass --contracts <dir>)" % config["contracts"])
		return
	var provisioning := await _provision()
	if provisioning.is_empty():
		return
	var public_key := Net.load_public_key(provisioning["signingPublicKeyPem"])
	if public_key == null:
		_fatal("Provisioning returned an unreadable signing key")
		return

	attraction.build(provisioning["layout"], provisioning["characters"])
	var bounds := attraction.stage_bounds()
	camera.frame_box(bounds.position, bounds.end)
	for device in provisioning["devices"]:
		var sim := SimDevice.new()
		var options := {
			"device": device,
			"api_url": config["api"],
			"environment_id": config["env"],
			"limits": _limits_for(device, provisioning["characters"]),
			"public_key": public_key,
			"contract": contract,
			"bus": bus,
			"data_dir": config["data"],
			"corrupt_downloads": device["deviceId"] in config["corrupt"],
		}
		if device["deviceId"] in config["outdated"]:
			options["character_ref_override"] = {"id": "outdated", "revision": 1}
		sim.setup(options)
		sim.log_line.connect(log_line)
		add_child(sim)
		devices.append(sim)
	attraction.attach(devices)
	log_line(
		"simulating %d devices for %s@%d: %s"
		% [
			devices.size(),
			config["env"],
			int(provisioning["environment"]["revision"]),
			", ".join(devices.map(func(d): return "%s(%s)" % [d.device_id, d.kind])),
		]
	)
	var dolls := devices.filter(func(d): return d.kind == "doll")
	if not dolls.is_empty():
		await attraction.load_models(config["api"], dolls[0]._headers())
	# --view console: start looking at the operator console instead of the whole stage.
	var consoles := devices.filter(func(d): return d.kind == "console")
	if config["view"] == "console" and not consoles.is_empty():
		attraction.focus_console(consoles[0].device_id)
	# --hud off: a clean frame (screenshots, recordings); H toggles it at runtime.
	hud.visible = config["hud"] != "off"
	if config["screenshot"] != "":
		_screenshots(config["screenshot"], config["screenshot_delay"].split(","))


func _process(delta: float) -> void:
	if attraction != null:
		attraction.render()
	# Without a window, print what the figures and fixtures output once a second.
	_trace_in -= delta
	if DisplayServer.get_name() == "headless" and _trace_in <= 0.0:
		_trace_in = 1.0
		for d in devices.filter(func(x): return x.state() == "running"):
			if d.kind == "doll":
				log_line("▶ %s %s" % [d.device_id, " ".join(d.pose.keys().map(func(j): return "%s=%.0f" % [j, d.pose[j]]))])
			elif d.kind == "light":
				log_line("▶ %s I=%.2f" % [d.device_id, d.light.get("intensity", 0.0)])


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	# Number keys fire sensors 1..9 in layout order (press for buttons, enter for presence).
	if event.keycode >= KEY_1 and event.keycode <= KEY_9:
		var sensors := devices.filter(func(d): return d.kind == "sensor")
		var i: int = event.keycode - KEY_1
		if i < sensors.size():
			attraction.click_sensor(sensors[i].device_id)
		return
	# The first operator console: Enter run, N next show, Space e-stop (again: twist it out),
	# R reset, C look at it.
	var consoles := devices.filter(func(d): return d.kind == "console")
	if consoles.is_empty():
		return
	var console_id: String = consoles[0].device_id
	match event.keycode:
		KEY_ENTER, KEY_KP_ENTER:
			attraction.press_console(console_id, "run")
		KEY_N:
			attraction.press_console(console_id, "select")
		KEY_SPACE:
			attraction.press_console(console_id, "estop")
		KEY_R:
			attraction.press_console(console_id, "reset")
		KEY_C:
			attraction.focus_console(console_id)


func log_line(text: String) -> void:
	var now := Time.get_unix_time_from_system()
	var line := "%s.%03d %s" % [Time.get_time_string_from_unix_time(int(now)), int(fmod(now, 1.0) * 1000.0), text]
	print(line)
	if hud != null:
		hud.add_log(line)


static func parse_args(args: PackedStringArray) -> Dictionary:
	var env := func(key: String, fallback: String) -> String:
		return OS.get_environment(key) if OS.has_environment(key) else fallback
	var c := {
		"api": env.call("STUDIO_API_URL", "http://localhost:4000"),
		"env": env.call("STUDIO_ENVIRONMENT", "dragons-lair"),
		"token": env.call("PROVISIONING_TOKEN", "dev-provisioning-token"),
		"data": env.call("FLEET_DATA_DIR", "user://fleet"),
		"contracts": ProjectSettings.globalize_path("res://").path_join("../../contracts/json-schema").simplify_path(),
		"corrupt": [],
		"outdated": [],
		"screenshot": "",
		"screenshot_delay": "8",
		"view": "stage",
		"hud": "on",
	}
	var i := 0
	while i < args.size():
		var key := args[i].trim_prefix("--").replace("-", "_")
		var value := args[i + 1] if i + 1 < args.size() else ""
		match key:
			"corrupt":
				c["corrupt"].append(value)
			"outdated_firmware":
				c["outdated"].append(value)
			_:
				if c.has(key):
					c[key] = value
				else:
					push_warning("unknown option --%s" % key)
		i += 2
	c["data"] = ProjectSettings.globalize_path(c["data"])
	# Godot connects to the first address a name resolves to (::1 for localhost on macOS),
	# while the studio listens on IPv4 by default.
	c["api"] = c["api"].replace("://localhost", "://127.0.0.1")
	return c


## The limits this controller holds itself, from the pinned definition it was provisioned with.
static func _limits_for(device: Dictionary, characters: Dictionary) -> Array:
	if device["characterRef"] == null:
		return []
	var key := "%s@%d" % [device["characterRef"]["id"], int(device["characterRef"]["revision"])]
	var definition = characters.get(key)
	if definition == null:
		return []
	return definition["joints"].map(
		func(j):
			return {
				"name": j["name"],
				"type": j["type"],
				"min": j["min"],
				"max": j["max"],
				"home": j["home"],
				"maxVelocity": j["maxVelocity"],
			}
	)


func _provision() -> Dictionary:
	var url := "%s/api/v1/fleet/provisioning/%s" % [config["api"], config["env"]]
	var headers := PackedStringArray(["x-provisioning-token: " + config["token"]])
	for attempt in 600:
		var res: Dictionary = await Net.get_bytes(self, url, headers)
		if res["ok"]:
			var parsed = JSON.parse_string(res["body"].get_string_from_utf8())
			if typeof(parsed) == TYPE_DICTIONARY and parsed.has("layout"):
				hud.set_error("")
				return parsed
			_fatal("Provisioning response has no layout: update the studio API")
			return {}
		if res["status"] in [400, 401, 403, 404]:
			_fatal("Provisioning failed: %s %s" % [res["error"], res["body"].get_string_from_utf8()])
			return {}
		if attempt % 5 == 0:
			var msg := "waiting for the studio at %s (%s)" % [config["api"], res["error"]]
			log_line(msg)
			hud.set_error(msg)
		await get_tree().create_timer(1.0).timeout
	_fatal("The studio did not come up")
	return {}


func _fatal(message: String) -> void:
	log_line("ERROR " + message)
	hud.set_error(message)
	if DisplayServer.get_name() == "headless":
		get_tree().quit(1)


## --screenshot out-%d.png --screenshot-delay 5,12: one PNG per delay (seconds after the stage loads).
func _screenshots(pattern: String, delays: PackedStringArray) -> void:
	var elapsed := 0.0
	for i in delays.size():
		await get_tree().create_timer(maxf(0.0, float(delays[i]) - elapsed)).timeout
		elapsed = float(delays[i])
		await get_tree().process_frame  # last drawn frame; macOS skips drawing hidden windows
		var path := pattern % (i + 1) if "%d" in pattern else pattern
		get_viewport().get_texture().get_image().save_png(path)
		log_line("screenshot saved to %s" % path)
