extends Camera3D
## Orbit camera: right/middle drag to orbit, wheel to zoom, F to frame the stage.

var target := Vector3.ZERO
var distance := 14.0
var yaw := 0.5
var pitch := -0.5
var _home := {}


func frame_box(a: Vector3, b: Vector3) -> void:
	target = (a + b) / 2.0
	distance = clampf((b - a).length() * 1.35, 4.0, 80.0)
	h_offset = -distance * 0.12  # stage sits right of the HUD
	_home = {"target": target, "distance": distance}
	_update()


func _ready() -> void:
	fov = 50.0
	_update()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and event.button_mask & (MOUSE_BUTTON_MASK_RIGHT | MOUSE_BUTTON_MASK_MIDDLE):
		yaw -= event.relative.x * 0.006
		pitch = clampf(pitch - event.relative.y * 0.006, -1.45, -0.05)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			distance = maxf(2.0, distance * 0.9)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			distance = minf(120.0, distance * 1.1)
	elif event is InputEventKey and event.pressed and event.keycode == KEY_F and not _home.is_empty():
		target = _home["target"]
		distance = _home["distance"]
	else:
		return
	_update()


## Ground-plane basis for moving things relative to the view.
func planar_basis() -> Basis:
	return Basis(Vector3.UP, yaw)


func _update() -> void:
	if not is_inside_tree():
		return
	var offset := Vector3(sin(yaw) * cos(pitch), -sin(pitch), cos(yaw) * cos(pitch)) * distance
	look_at_from_position(target + offset, target, Vector3.UP)
