extends Node3D
## One figure: the GLB is loaded at runtime with GLTFDocument and joints are bound to
## glTF nodes by their original names. Poses use the same convention as the editor
## preview and every playback target: from the node's rest transform, rotate about the
## joint axis in the node's local frame (revolute, degrees) or translate along it
## (prismatic, meters). Joints sharing a node apply in definition order.

var definition := {}
var _joints: Array = []
var _rest := {}
var _bone_rest := {}
var _placeholder: MeshInstance3D


func setup(character: Dictionary) -> void:
	definition = character
	show_placeholder(Color("#64748b"))


## Footprint box while the model loads, when there is none, or (red) when it failed.
func show_placeholder(color: Color) -> void:
	if _placeholder != null:
		_placeholder.queue_free()
	var size := Vector3(0.6, 1.0, 0.6)
	if not definition.is_empty():
		var s: Array = definition["footprint"]["size"]
		size = Vector3(s[0], s[1], s[2])
	var box := BoxMesh.new()
	box.size = size
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color, 0.45)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_placeholder = MeshInstance3D.new()
	_placeholder.mesh = box
	_placeholder.material_override = material
	_placeholder.position.y = size.y / 2.0
	add_child(_placeholder)


## "" on success, otherwise what went wrong.
func load_glb(bytes: PackedByteArray) -> String:
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var err := doc.append_from_buffer(bytes, "", state)
	if err != OK:
		return "model could not be parsed (%s)" % error_string(err)
	var scene := doc.generate_scene(state)
	if not (scene is Node3D):
		return "model has no 3D scene"
	add_child(scene)
	if _placeholder != null:
		_placeholder.queue_free()
		_placeholder = null

	# Generated nodes keep their glTF names, made valid for Godot (first match wins, like the editor).
	# Rigged models expose joints as skeleton bones instead of nodes; both are supported.
	var by_name := {}
	var bones := {}
	_index(scene, by_name, bones)
	var missing := []
	for joint in definition["joints"]:
		var key := String(joint["node"]).validate_node_name()
		var a: Array = joint["axis"]
		var axis := Vector3(a[0], a[1], a[2])
		if axis.length_squared() == 0.0:
			continue
		var entry := {"name": joint["name"], "type": joint["type"], "home": float(joint["home"]), "axis": axis.normalized()}
		var node: Node3D = by_name.get(key)
		if node != null:
			if not _rest.has(node):
				_rest[node] = {"q": node.quaternion, "p": node.position}
			entry["node"] = node
		elif bones.has(String(joint["node"])):
			var bone: Dictionary = bones[String(joint["node"])]
			var skeleton: Skeleton3D = bone["skeleton"]
			var idx: int = bone["index"]
			var rest_key := "%d:%d" % [skeleton.get_instance_id(), idx]
			if not _bone_rest.has(rest_key):
				_bone_rest[rest_key] = {
					"skeleton": skeleton,
					"index": idx,
					"q": skeleton.get_bone_pose_rotation(idx),
					"p": skeleton.get_bone_pose_position(idx),
				}
			entry["bone"] = rest_key
		else:
			missing.append(joint["node"])
			continue
		_joints.append(entry)
	apply_pose({})
	return "" if missing.is_empty() else "joints bound to missing nodes: " + ", ".join(missing)


func _index(node: Node, by_name: Dictionary, bones: Dictionary) -> void:
	if node is Node3D and not by_name.has(String(node.name)):
		by_name[String(node.name)] = node
	if node is Skeleton3D:
		for i in node.get_bone_count():
			var bone_name: String = node.get_bone_name(i)
			if not bones.has(bone_name):
				bones[bone_name] = {"skeleton": node, "index": i}
	for child in node.get_children():
		_index(child, by_name, bones)


func apply_pose(pose: Dictionary) -> void:
	for node in _rest:
		node.quaternion = _rest[node]["q"]
		node.position = _rest[node]["p"]
	var bone_pose := {}
	for key in _bone_rest:
		bone_pose[key] = {"q": _bone_rest[key]["q"], "p": _bone_rest[key]["p"]}
	for j in _joints:
		var v := float(pose.get(j["name"], j["home"]))
		var axis: Vector3 = j["axis"]
		if j.has("node"):
			var node: Node3D = j["node"]
			if j["type"] == "revolute":
				node.quaternion = node.quaternion * Quaternion(axis, deg_to_rad(v))
			else:
				var rest_q: Quaternion = _rest[node]["q"]
				node.position += rest_q * axis * v
		else:
			var b: Dictionary = bone_pose[j["bone"]]
			if j["type"] == "revolute":
				b["q"] = (b["q"] as Quaternion) * Quaternion(axis, deg_to_rad(v))
			else:
				b["p"] = (b["p"] as Vector3) + (_bone_rest[j["bone"]]["q"] as Quaternion) * axis * v
	for key in bone_pose:
		var rest: Dictionary = _bone_rest[key]
		var skeleton: Skeleton3D = rest["skeleton"]
		skeleton.set_bone_pose_rotation(rest["index"], bone_pose[key]["q"])
		skeleton.set_bone_pose_position(rest["index"], bone_pose[key]["p"])
