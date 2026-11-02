extends RefCounted
## Validates values against the published contract (contracts/json-schema/*.json, generated
## from packages/schema). Implements the JSON Schema 2020-12 subset those files use, so the
## simulator checks bundles and fleet messages against the same contract as the TypeScript
## side instead of a hand-written approximation.

var _root: Dictionary
var _regex := {}


func _init(root: Dictionary) -> void:
	_root = root


static func load_file(path: String) -> RefCounted:
	var text := FileAccess.get_file_as_string(path)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Contract schema not found or invalid: %s" % path)
		return null
	return load("res://scripts/json_schema.gd").new(parsed)


## First violation as "path: problem", or "" when valid. component = a name under
## #/components/schemas (e.g. "FleetToDevice"); empty validates against the root schema.
func validate(value, component := "") -> String:
	var schema := _root if component == "" else _resolve("#/components/schemas/" + component)
	if schema.is_empty():
		return "unknown schema %s" % component
	return _check(value, schema, "$")


func _check(v, s: Dictionary, path: String) -> String:
	if s.has("$ref"):
		var target := _resolve(s["$ref"])
		if target.is_empty():
			return "%s: unresolvable %s" % [path, s["$ref"]]
		var err := _check(v, target, path)
		if err != "":
			return err
	if s.has("anyOf") and not s["anyOf"].any(func(sub): return _check(v, sub, path) == ""):
		return "%s: matches none of the allowed shapes" % path
	if s.has("oneOf"):
		var matches: int = s["oneOf"].filter(func(sub): return _check(v, sub, path) == "").size()
		if matches != 1:
			return "%s: must match exactly one shape (matched %d)" % [path, matches]
	if s.has("const") and not _equal(v, s["const"]):
		return "%s: must be %s" % [path, JSON.stringify(s["const"])]
	if s.has("enum") and not s["enum"].any(func(e): return _equal(v, e)):
		return "%s: must be one of %s" % [path, JSON.stringify(s["enum"])]
	if s.has("type") and not _type_ok(v, s["type"]):
		return "%s: expected %s" % [path, JSON.stringify(s["type"])]
	match typeof(v):
		TYPE_STRING:
			return _check_string(v, s, path)
		TYPE_FLOAT, TYPE_INT:
			return _check_number(float(v), s, path)
		TYPE_ARRAY:
			return _check_array(v, s, path)
		TYPE_DICTIONARY:
			return _check_object(v, s, path)
	return ""


func _check_string(v: String, s: Dictionary, path: String) -> String:
	if s.has("minLength") and v.length() < int(s["minLength"]):
		return "%s: shorter than %d" % [path, int(s["minLength"])]
	if s.has("maxLength") and v.length() > int(s["maxLength"]):
		return "%s: longer than %d" % [path, int(s["maxLength"])]
	if s.has("pattern") and _pattern(s["pattern"]).search(v) == null:
		return "%s: does not match %s" % [path, s["pattern"]]
	return ""


func _check_number(v: float, s: Dictionary, path: String) -> String:
	if s.has("minimum") and v < float(s["minimum"]):
		return "%s: below %s" % [path, s["minimum"]]
	if s.has("maximum") and v > float(s["maximum"]):
		return "%s: above %s" % [path, s["maximum"]]
	if s.has("exclusiveMinimum") and v <= float(s["exclusiveMinimum"]):
		return "%s: must be above %s" % [path, s["exclusiveMinimum"]]
	if s.has("exclusiveMaximum") and v >= float(s["exclusiveMaximum"]):
		return "%s: must be below %s" % [path, s["exclusiveMaximum"]]
	return ""


func _check_array(v: Array, s: Dictionary, path: String) -> String:
	if s.has("minItems") and v.size() < int(s["minItems"]):
		return "%s: fewer than %d items" % [path, int(s["minItems"])]
	if s.has("maxItems") and v.size() > int(s["maxItems"]):
		return "%s: more than %d items" % [path, int(s["maxItems"])]
	var prefix: Array = s.get("prefixItems", [])
	for i in v.size():
		var item_schema = prefix[i] if i < prefix.size() else s.get("items")
		if item_schema == null:
			continue
		if typeof(item_schema) == TYPE_BOOL:
			if not item_schema:
				return "%s: unexpected item %d" % [path, i]
			continue
		var err := _check(v[i], item_schema, "%s[%d]" % [path, i])
		if err != "":
			return err
	return ""


func _check_object(v: Dictionary, s: Dictionary, path: String) -> String:
	for key in s.get("required", []):
		if not v.has(key):
			return "%s: missing %s" % [path, key]
	var props: Dictionary = s.get("properties", {})
	for key in v:
		var child := "%s.%s" % [path, key]
		if s.has("propertyNames"):
			var err := _check(key, s["propertyNames"], child)
			if err != "":
				return err
		var sub = props.get(key, s.get("additionalProperties"))
		if sub == null:
			continue
		if typeof(sub) == TYPE_BOOL:
			if not sub:
				return "%s: unexpected property" % child
			continue
		var err := _check(v[key], sub, child)
		if err != "":
			return err
	return ""


func _type_ok(v, t) -> bool:
	if typeof(t) == TYPE_ARRAY:
		return t.any(func(one): return _type_ok(v, one))
	match t:
		"object":
			return typeof(v) == TYPE_DICTIONARY
		"array":
			return typeof(v) == TYPE_ARRAY
		"string":
			return typeof(v) == TYPE_STRING
		"boolean":
			return typeof(v) == TYPE_BOOL
		"null":
			return v == null
		"number":
			return typeof(v) in [TYPE_FLOAT, TYPE_INT]
		"integer":
			return typeof(v) in [TYPE_FLOAT, TYPE_INT] and float(v) == floorf(float(v))
	return false


func _equal(a, b) -> bool:
	if typeof(a) in [TYPE_FLOAT, TYPE_INT] and typeof(b) in [TYPE_FLOAT, TYPE_INT]:
		return float(a) == float(b)
	return typeof(a) == typeof(b) and a == b


func _resolve(ref: String) -> Dictionary:
	if not ref.begins_with("#/"):
		return {}
	var node = _root
	for part in ref.substr(2).split("/"):
		if typeof(node) != TYPE_DICTIONARY or not node.has(part):
			return {}
		node = node[part]
	return node if typeof(node) == TYPE_DICTIONARY else {}


func _pattern(source: String) -> RegEx:
	if not _regex.has(source):
		_regex[source] = RegEx.create_from_string(source)
	return _regex[source]
