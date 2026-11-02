extends Node3D
## Builds the attraction from the provisioned layout (the same EnvironmentDefinition the
## editor draws): stage boundary, keep-out zones, figures, light fixtures, speakers and
## sensors, plus a guest you can walk through the sensor zones. It only renders and
## senses; what plays is decided by the simulated controllers.

signal log_line(text: String)

const Figure := preload("res://scripts/figure.gd")
const Net := preload("res://scripts/net.gd")
const OrbitCamera := preload("res://scripts/orbit_camera.gd")

const STAGE_COLOR := Color("#38bdf8")
const KEEP_OUT_COLOR := Color("#e0a33a")
const SENSOR_COLOR := Color("#22c55e")
const GUEST_SPEED := 2.5

var figures := {}
var guest: Node3D
var camera: OrbitCamera

var _layout := {}
var _characters := {}
var _floor_y := 0.0
var _fixtures := {}
var _speakers := {}
var _players := {}
var _sensors := {}
var _devices := {}


func build(layout: Dictionary, characters: Dictionary) -> void:
	_layout = layout
	_characters = characters
	var stage_min := _vec(layout["stage"]["min"])
	var stage_max := _vec(layout["stage"]["max"])
	_floor_y = stage_min.y
	_environment()
	_floor(stage_min, stage_max)
	add_child(_box_edges(stage_min, stage_max, STAGE_COLOR))
	for zone in layout["keepOut"]:
		_keep_out(zone)
	for p in layout["placements"]:
		_placement(p)
	for l in layout["lights"]:
		_fixture(l)
	for a in layout["audio"]:
		_speaker(a)
	for s in layout["sensors"]:
		_sensor(s)
	# Start the guest in front of the stage, outside every sensor zone.
	var start := Vector3((stage_min.x + stage_max.x) / 2.0, _floor_y, stage_max.z + 1.5)
	while _sensors.values().any(func(z): return Vector2(start.x - z["position"].x, start.z - z["position"].z).length() <= z["range"] + 0.5):
		start.z += 0.5
	_guest(start)


func stage_bounds() -> AABB:
	var a := _vec(_layout["stage"]["min"])
	return AABB(a, _vec(_layout["stage"]["max"]) - a)


## Sensors fire through their simulated controller, exactly like park hardware would.
func attach(devices: Array) -> void:
	for d in devices:
		_devices[d.device_id] = d
		if d.kind == "audio":
			d.cue_started.connect(_play_cue)
			d.playback_finished.connect(_stop_audio)


## Download each figure's GLB once (device credentials) and bind its joints.
func load_models(api_url: String, headers: PackedStringArray) -> void:
	var cache := {}
	for device_id in figures:
		var figure = figures[device_id]
		var model = figure.definition.get("model")
		if model == null:
			continue
		var asset_id: String = model["assetId"]
		if not cache.has(asset_id):
			var res: Dictionary = await Net.get_bytes(self, "%s/api/v1/assets/%s" % [api_url, asset_id], headers)
			if not res["ok"] or Net.sha256_hex(res["body"]) != asset_id:
				log_line.emit("[stage] %s: model %s unavailable (%s)" % [device_id, asset_id.substr(0, 8), res["error"]])
				figure.show_placeholder(KEEP_OUT_COLOR)
				continue
			cache[asset_id] = res["body"]
		var err: String = figure.load_glb(cache[asset_id])
		if err != "":
			log_line.emit("[stage] %s: %s" % [device_id, err])


## Mirror what each controller is outputting right now.
func render() -> void:
	for device_id in _devices:
		var d = _devices[device_id]
		if d.kind == "doll" and figures.has(device_id):
			figures[device_id].apply_pose(d.pose)
		elif d.kind == "light" and _fixtures.has(device_id):
			_apply_light(_fixtures[device_id], d.light)


func click_sensor(sensor_id: String) -> void:
	var s: Dictionary = _sensors[sensor_id]
	if s["type"] == "button":
		_fire(sensor_id, "press")
	else:
		_fire(sensor_id, "exit" if s["occupied"] else "enter")
		s["occupied"] = not s["occupied"]


func _process(delta: float) -> void:
	_move_guest(delta)
	var now := Time.get_ticks_msec() / 1000.0
	for torch in _torches:
		var k: float = torch["seed"] + now
		var flicker := 0.82 + 0.12 * sin(k * 9.1) + 0.07 * sin(k * 23.7) + 0.05 * sin(k * 3.3)
		torch["light"].light_energy = 2.2 * flicker
		torch["flame"].scale = Vector3.ONE * (0.9 + 0.15 * flicker)
	for sensor_id in _sensors:
		var s: Dictionary = _sensors[sensor_id]
		s["flash"] = maxf(0.0, s["flash"] - delta)
		var lit: bool = s["flash"] > 0.0 or s["occupied"]
		var material: StandardMaterial3D = s["material"]
		material.albedo_color = Color(SENSOR_COLOR if lit else SENSOR_COLOR.darkened(0.4), 0.35 if lit else 0.12)


func _move_guest(delta: float) -> void:
	if guest == null or camera == null:
		return
	var input := Vector2(
		float(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT))
		- float(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT)),
		float(Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP))
		- float(Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN))
	)
	if input != Vector2.ZERO:
		guest.position += camera.planar_basis() * Vector3(input.x, 0.0, -input.y).normalized() * GUEST_SPEED * delta
	# Presence/proximity sensors see the guest enter and leave their range.
	for sensor_id in _sensors:
		var s: Dictionary = _sensors[sensor_id]
		if s["type"] == "button":
			continue
		var p: Vector3 = s["position"]
		var inside: bool = Vector2(guest.position.x - p.x, guest.position.z - p.z).length() <= float(s["range"])
		if inside != s["guest_inside"]:
			s["guest_inside"] = inside
			s["occupied"] = inside
			_fire(sensor_id, "enter" if inside else "exit")


func _fire(sensor_id: String, event: String) -> void:
	_sensors[sensor_id]["flash"] = 0.6
	if _devices.has(sensor_id):
		_devices[sensor_id].fire_sensor(event)


# ---- scene ----------------------------------------------------------------------------


func _environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#05070d")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(_layout["ambient"]["color"]).lerp(Color("#3a4a78"), 0.5)
	env.ambient_light_energy = 0.25 + float(_layout["ambient"]["intensity"]) * 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.1
	# Light shafts: spot lights scatter in a thin haze, like a real dark ride.
	env.volumetric_fog_enabled = true
	env.volumetric_fog_density = 0.035
	env.volumetric_fog_albedo = Color("#c9d4ff")
	env.volumetric_fog_anisotropy = 0.55
	env.volumetric_fog_length = 40.0
	env.fog_enabled = true
	env.fog_light_color = Color("#0c1222")
	env.fog_density = 0.012
	env.ssao_enabled = true
	env.ssao_radius = 1.2
	env.ssao_intensity = 2.2
	env.ssil_enabled = true
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_bloom = 0.08
	env.glow_hdr_threshold = 0.9
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.06
	env.adjustment_saturation = 1.12
	var world := WorldEnvironment.new()
	world.environment = env
	add_child(world)
	# Cool moonlight from above so the set reads while fixtures are dark.
	var moon := DirectionalLight3D.new()
	moon.light_color = Color("#9fb4ff")
	moon.light_energy = 0.28
	moon.light_volumetric_fog_energy = 0.15
	moon.shadow_enabled = true
	moon.shadow_blur = 1.5
	moon.rotation_degrees = Vector3(-62.0, 28.0, 0.0)
	add_child(moon)


func _floor(a: Vector3, b: Vector3) -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(b.x - a.x + 14.0, b.z - a.z + 14.0)
	var noise := FastNoiseLite.new()
	noise.noise_type = FastNoiseLite.TYPE_CELLULAR
	noise.frequency = 0.04
	noise.cellular_return_type = FastNoiseLite.RETURN_DISTANCE2_SUB
	var normal := NoiseTexture2D.new()
	normal.noise = noise
	normal.seamless = true
	normal.as_normal_map = true
	normal.bump_strength = 6.0
	var albedo := NoiseTexture2D.new()
	var tint := FastNoiseLite.new()
	tint.frequency = 0.02
	albedo.noise = tint
	albedo.seamless = true
	var ramp := Gradient.new()
	ramp.set_color(0, Color("#141a24"))
	ramp.set_color(1, Color("#2a3140"))
	albedo.color_ramp = ramp
	var material := StandardMaterial3D.new()
	material.albedo_texture = albedo
	material.normal_enabled = true
	material.normal_texture = normal
	material.roughness = 0.85
	material.uv1_scale = Vector3(6, 6, 6)
	var floor_mesh := MeshInstance3D.new()
	floor_mesh.mesh = plane
	floor_mesh.material_override = material
	floor_mesh.position = Vector3((a.x + b.x) / 2.0, a.y, (a.z + b.z) / 2.0)
	add_child(floor_mesh)
	# Torches at the back corners: warm, flickering, with embers.
	_torch(Vector3(a.x + 0.35, a.y, a.z + 0.35))
	_torch(Vector3(b.x - 0.35, a.y, a.z + 0.35))


var _torches: Array = []


func _torch(at: Vector3) -> void:
	var root := Node3D.new()
	root.position = at
	add_child(root)
	var pole := MeshInstance3D.new()
	var pole_mesh := CylinderMesh.new()
	pole_mesh.top_radius = 0.035
	pole_mesh.bottom_radius = 0.05
	pole_mesh.height = 1.7
	pole.mesh = pole_mesh
	pole.position.y = 0.85
	pole.material_override = _metal(Color("#3b2a1d"), 0.2, 0.7)
	root.add_child(pole)
	var bowl := MeshInstance3D.new()
	var bowl_mesh := CylinderMesh.new()
	bowl_mesh.top_radius = 0.16
	bowl_mesh.bottom_radius = 0.07
	bowl_mesh.height = 0.14
	bowl.mesh = bowl_mesh
	bowl.position.y = 1.74
	bowl.material_override = _metal(Color("#5b4a2e"), 0.85, 0.35)
	root.add_child(bowl)
	var flame := MeshInstance3D.new()
	var flame_mesh := SphereMesh.new()
	flame_mesh.radius = 0.1
	flame_mesh.height = 0.3
	flame.mesh = flame_mesh
	flame.position.y = 1.9
	var flame_material := StandardMaterial3D.new()
	flame_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flame_material.albedo_color = Color("#ffb347")
	flame_material.emission_enabled = true
	flame_material.emission = Color("#ff8a2a")
	flame_material.emission_energy_multiplier = 6.0
	flame.material_override = flame_material
	flame.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(flame)
	var light := OmniLight3D.new()
	light.position.y = 2.0
	light.light_color = Color("#ff9a45")
	light.light_energy = 2.2
	light.omni_range = 7.0
	light.shadow_enabled = true
	light.light_volumetric_fog_energy = 0.6
	root.add_child(light)
	var embers := GPUParticles3D.new()
	embers.position.y = 1.95
	embers.amount = 28
	embers.lifetime = 1.8
	var process := ParticleProcessMaterial.new()
	process.direction = Vector3.UP
	process.spread = 25.0
	process.initial_velocity_min = 0.25
	process.initial_velocity_max = 0.7
	process.gravity = Vector3(0, 0.15, 0)
	process.scale_min = 0.02
	process.scale_max = 0.05
	var fade := Gradient.new()
	fade.set_color(0, Color(1.0, 0.65, 0.25, 1.0))
	fade.set_color(1, Color(1.0, 0.3, 0.05, 0.0))
	var fade_texture := GradientTexture1D.new()
	fade_texture.gradient = fade
	process.color_ramp = fade_texture
	embers.process_material = process
	var spark := QuadMesh.new()
	spark.size = Vector2(1, 1)
	var spark_material := StandardMaterial3D.new()
	spark_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spark_material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	spark_material.vertex_color_use_as_albedo = true
	spark_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	spark_material.emission_enabled = true
	spark_material.emission = Color("#ff9a45")
	spark_material.emission_energy_multiplier = 3.0
	spark.material = spark_material
	embers.draw_pass_1 = spark
	root.add_child(embers)
	_torches.append({"light": light, "flame": flame, "seed": randf() * 100.0})


## Guest area: brass stanchions, a rope and a faint striped floor, like a real queue line.
func _keep_out(zone: Dictionary) -> void:
	var a := _vec(zone["box"]["min"])
	var b := _vec(zone["box"]["max"])
	var stripes := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	for y in 64:
		for x in 64:
			var on := ((x + y) % 32) < 10
			stripes.set_pixel(x, y, Color(0.96, 0.65, 0.14, 0.55) if on else Color(0, 0, 0, 0))
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_texture = ImageTexture.create_from_image(stripes)
	floor_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	floor_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	floor_material.albedo_color = Color(1, 1, 1, 0.22)
	floor_material.uv1_scale = Vector3((b.x - a.x) / 0.8, (b.z - a.z) / 0.8, 1)
	var plane := PlaneMesh.new()
	plane.size = Vector2(b.x - a.x, b.z - a.z)
	var floor_mesh := MeshInstance3D.new()
	floor_mesh.mesh = plane
	floor_mesh.material_override = floor_material
	floor_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	floor_mesh.position = Vector3((a.x + b.x) / 2.0, a.y + 0.006, (a.z + b.z) / 2.0)
	add_child(floor_mesh)
	var corners := [Vector3(a.x, a.y, a.z), Vector3(b.x, a.y, a.z), Vector3(b.x, a.y, b.z), Vector3(a.x, a.y, b.z)]
	var posts: Array[Vector3] = []
	for i in 4:
		var c0: Vector3 = corners[i]
		var c1: Vector3 = corners[(i + 1) % 4]
		var n := maxi(1, int(round(c0.distance_to(c1) / 1.4)))
		for k in n:
			posts.append(c0.lerp(c1, float(k) / n))
	var brass := _metal(Color("#c9a227"), 0.9, 0.25)
	var rope := _metal(Color("#2a3550"), 0.0, 0.85)
	for i in posts.size():
		var p := posts[i]
		var q := posts[(i + 1) % posts.size()]
		var post := MeshInstance3D.new()
		var post_mesh := CylinderMesh.new()
		post_mesh.top_radius = 0.025
		post_mesh.bottom_radius = 0.03
		post_mesh.height = 0.9
		post.mesh = post_mesh
		post.material_override = brass
		post.position = p + Vector3(0, 0.45, 0)
		add_child(post)
		var knob := MeshInstance3D.new()
		var knob_mesh := SphereMesh.new()
		knob_mesh.radius = 0.045
		knob_mesh.height = 0.09
		knob.mesh = knob_mesh
		knob.material_override = brass
		knob.position = p + Vector3(0, 0.92, 0)
		add_child(knob)
		var base := MeshInstance3D.new()
		var base_mesh := CylinderMesh.new()
		base_mesh.top_radius = 0.12
		base_mesh.bottom_radius = 0.13
		base_mesh.height = 0.025
		base.mesh = base_mesh
		base.material_override = brass
		base.position = p + Vector3(0, 0.012, 0)
		add_child(base)
		var d := q - p
		var segment := MeshInstance3D.new()
		var segment_mesh := CylinderMesh.new()
		segment_mesh.top_radius = 0.018
		segment_mesh.bottom_radius = 0.018
		segment_mesh.height = d.length()
		segment.mesh = segment_mesh
		segment.material_override = rope
		segment.position = p + d / 2.0 + Vector3(0, 0.76, 0)
		segment.rotation = Vector3(0, -atan2(d.z, d.x), PI / 2.0)
		add_child(segment)
	add_child(_label(zone["name"], Vector3((a.x + b.x) / 2.0, a.y + 1.2, (a.z + b.z) / 2.0), Color("#f5b443")))


static func _metal(color: Color, metallic: float, roughness: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.metallic = metallic
	m.roughness = roughness
	return m


func _placement(p: Dictionary) -> void:
	var root := Node3D.new()
	root.name = p["deviceId"]
	root.position = _vec(p["position"])
	root.rotation.y = deg_to_rad(float(p["rotationY"]))
	add_child(root)
	var figure := Figure.new()
	root.add_child(figure)
	var character = _characters.get("%s@%d" % [p["character"]["id"], int(p["character"]["revision"])])
	if character == null:
		figure.show_placeholder(KEEP_OUT_COLOR)
	else:
		figure.setup(character)
	figures[p["deviceId"]] = figure
	var height: float = 1.0 if character == null else float(character["footprint"]["size"][1])
	root.add_child(_label("%s · %s" % [p["name"], p["deviceId"]], Vector3(0.0, height + 0.35, 0.0)))


func _fixture(l: Dictionary) -> void:
	var pos := _vec(l["position"])
	var dir := _vec(l["target"]) - pos
	if dir.length() < 0.001:
		dir = Vector3.DOWN
	var up := Vector3.UP if absf(dir.normalized().dot(Vector3.UP)) < 0.99 else Vector3.FORWARD
	var aim := Transform3D(Basis.looking_at(dir, up), pos)
	var head := Node3D.new()
	head.transform = aim
	add_child(head)
	var can := MeshInstance3D.new()
	var can_mesh := CylinderMesh.new()
	can_mesh.top_radius = 0.1
	can_mesh.bottom_radius = 0.13
	can_mesh.height = 0.28
	can.mesh = can_mesh
	can.rotation.x = -PI / 2.0
	can.material_override = _metal(Color("#1b2230"), 0.7, 0.35)
	head.add_child(can)
	var lens_material := StandardMaterial3D.new()
	lens_material.albedo_color = Color("#111111")
	lens_material.emission_enabled = true
	lens_material.emission = Color.BLACK
	var lens := MeshInstance3D.new()
	var lens_mesh := CylinderMesh.new()
	lens_mesh.top_radius = 0.105
	lens_mesh.bottom_radius = 0.105
	lens_mesh.height = 0.01
	lens.mesh = lens_mesh
	lens.rotation.x = -PI / 2.0
	lens.position.z = -0.145
	lens.material_override = lens_material
	head.add_child(lens)
	var spot := SpotLight3D.new()
	spot.transform = aim
	spot.spot_angle = rad_to_deg(0.42)
	spot.spot_angle_attenuation = 0.9
	spot.spot_range = 22.0
	spot.light_energy = 0.0
	spot.light_volumetric_fog_energy = 2.5
	spot.shadow_enabled = true
	spot.shadow_blur = 1.2
	add_child(spot)
	_fixtures[l["deviceId"]] = {"light": spot, "bulb": lens_material}
	add_child(_label(l["deviceId"], pos + Vector3(0.0, 0.3, 0.0)))


func _apply_light(fixture: Dictionary, sample: Dictionary) -> void:
	var spot: SpotLight3D = fixture["light"]
	var bulb: StandardMaterial3D = fixture["bulb"]
	if sample.is_empty():
		spot.light_energy = 0.0
		bulb.emission = Color.BLACK
		return
	var color := Color(sample["r"], sample["g"], sample["b"])
	spot.light_color = color
	spot.light_energy = float(sample["intensity"]) * 10.0
	bulb.emission = color
	bulb.emission_energy_multiplier = 0.5 + float(sample["intensity"]) * 6.0


func _speaker(a: Dictionary) -> void:
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.15
	cylinder.bottom_radius = 0.22
	cylinder.height = 0.25
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#475569")
	material.emission_enabled = true
	material.emission = Color.BLACK
	var mesh := MeshInstance3D.new()
	mesh.mesh = cylinder
	mesh.material_override = material
	mesh.position = _vec(a["position"])
	mesh.rotation.x = PI / 2.0
	add_child(mesh)
	_speakers[a["deviceId"]] = {"position": mesh.position, "material": material}
	_players[a["deviceId"]] = []
	add_child(_label(a["deviceId"], mesh.position + Vector3(0.0, 0.35, 0.0)))


func _play_cue(device_id: String, cue: Dictionary, bytes: PackedByteArray, offset_s: float) -> void:
	var stream := Net.audio_stream(bytes)
	if stream == null or not _speakers.has(device_id):
		log_line.emit("[stage] %s: no playable audio for cue %s" % [device_id, cue["id"]])
		return
	var player := AudioStreamPlayer3D.new()
	player.stream = stream
	player.volume_db = float(cue["volumeDb"])
	player.unit_size = 8.0
	player.position = _speakers[device_id]["position"]
	add_child(player)
	_players[device_id].append(player)
	player.finished.connect(func(): _drop_player(device_id, player))
	player.play(maxf(0.0, offset_s))
	_speakers[device_id]["material"].emission = Color("#f59e0b") * 0.8


func _stop_audio(device_id: String) -> void:
	for player in _players.get(device_id, []).duplicate():
		_drop_player(device_id, player)


func _drop_player(device_id: String, player: AudioStreamPlayer3D) -> void:
	_players[device_id].erase(player)
	player.queue_free()
	if _players[device_id].is_empty():
		_speakers[device_id]["material"].emission = Color.BLACK


func _sensor(s: Dictionary) -> void:
	var pos := _vec(s["position"])
	var radius := float(s["range"])
	var root := Node3D.new()
	root.position = pos
	add_child(root)
	var disc := CylinderMesh.new()
	disc.top_radius = radius
	disc.bottom_radius = radius
	disc.height = 0.02
	var material := _translucent(SENSOR_COLOR, 0.12)
	var zone := MeshInstance3D.new()
	zone.mesh = disc
	zone.material_override = material
	zone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	zone.position.y = _floor_y - pos.y + 0.012
	root.add_child(zone)
	var marker := SphereMesh.new()
	marker.radius = 0.1
	marker.height = 0.2
	var marker_mesh := MeshInstance3D.new()
	marker_mesh.mesh = marker
	marker_mesh.material_override = material
	root.add_child(marker_mesh)
	# Clickable: buttons press, presence sensors toggle a guest standing there.
	var body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.35
	shape.shape = sphere
	body.add_child(shape)
	root.add_child(body)
	var sensor_id: String = s["deviceId"]
	body.input_event.connect(
		func(_cam, event, _pos, _normal, _idx):
			if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
				click_sensor(sensor_id)
	)
	_sensors[sensor_id] = {
		"type": s["type"],
		"position": pos,
		"range": radius,
		"material": material,
		"flash": 0.0,
		"occupied": false,
		"guest_inside": false,
	}
	root.add_child(_label("%s (%s)" % [sensor_id, s["type"]], Vector3(0.0, 0.35, 0.0), SENSOR_COLOR))


func _guest(at: Vector3) -> void:
	guest = Node3D.new()
	guest.name = "Guest"
	guest.position = at
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.22
	capsule.height = 1.7
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#facc15")
	var mesh := MeshInstance3D.new()
	mesh.mesh = capsule
	mesh.material_override = material
	mesh.position.y = 0.85
	guest.add_child(mesh)
	guest.add_child(_label("guest", Vector3(0.0, 2.0, 0.0), Color("#facc15")))
	add_child(guest)


# ---- helpers --------------------------------------------------------------------------


static func _vec(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])


static func _translucent(color: Color, alpha: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color, alpha)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


static func _label(text: String, at: Vector3, color := Color(1, 1, 1, 0.85)) -> Label3D:
	var label := Label3D.new()
	label.text = text
	label.position = at
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 28
	label.pixel_size = 0.004
	label.modulate = color
	label.outline_size = 6
	label.no_depth_test = true
	return label


static func _box_edges(a: Vector3, b: Vector3, color: Color) -> MeshInstance3D:
	var corners := []
	for i in 8:
		corners.append(Vector3(b.x if i & 1 else a.x, b.y if i & 2 else a.y, b.z if i & 4 else a.z))
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	var lines := ImmediateMesh.new()
	lines.surface_begin(Mesh.PRIMITIVE_LINES, material)
	for edge in [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]:
		lines.surface_add_vertex(corners[edge[0]])
		lines.surface_add_vertex(corners[edge[1]])
	lines.surface_end()
	var mesh := MeshInstance3D.new()
	mesh.mesh = lines
	return mesh
