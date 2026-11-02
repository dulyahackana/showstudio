extends CanvasLayer
## Compact overlay: one status line that expands into the controller list (Tab), an
## optional log (L) and a controls hint (H). Stays out of the way of the scene.

const STATE_COLORS := {
	"idle": "#8b95a7",
	"ready": "#4cd6a2",
	"armed": "#f5b443",
	"running": "#5cc8ea",
	"estopped": "#f0554b",
	"faulted": "#f0554b",
}
const LINK_COLORS := {"online": "#4cd6a2", "connecting": "#f5b443", "offline": "#8b95a7", "replaced": "#f0554b"}
const KIND_GLYPH := {"doll": "◆", "light": "✦", "audio": "♪", "sensor": "◎"}

var _main: Node
var _panel: PanelContainer
var _status: RichTextLabel
var _log_panel: PanelContainer
var _log: RichTextLabel
var _hint: Label
var _banner: PanelContainer
var _lines: Array[String] = []
var _error := ""
var _refresh := 0.0
var _expanded := false


func setup(main: Node) -> void:
	_main = main
	var mono := SystemFont.new()
	mono.font_names = PackedStringArray(["SF Mono", "Menlo", "JetBrains Mono", "Consolas", "DejaVu Sans Mono", "monospace"])
	mono.antialiasing = TextServer.FONT_ANTIALIASING_LCD

	_panel = _glass(Vector2(14, 14), 400)
	_status = _label(mono, 12)
	_panel.add_child(_status)
	_panel.gui_input.connect(func(e): if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: _toggle())

	_log_panel = _glass(Vector2(14, 0), 520)
	_log_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_log_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_log_panel.position = Vector2(14, -14)
	_log = _label(mono, 11)
	_log_panel.add_child(_log)
	_log_panel.visible = false

	_hint = Label.new()
	_hint.text = "WASD walk · click sensor · RMB orbit · wheel zoom · F frame · Tab details · L log · H hide"
	_hint.add_theme_font_size_override("font_size", 11)
	_hint.add_theme_color_override("font_color", Color(1, 1, 1, 0.45))
	_hint.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	_hint.position += Vector2(-16, -12)
	_hint.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_hint.grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_child(_hint)

	_banner = PanelContainer.new()
	var banner_style := StyleBoxFlat.new()
	banner_style.bg_color = Color(0.45, 0.08, 0.1, 0.82)
	banner_style.border_color = Color(1, 0.55, 0.5, 0.45)
	banner_style.set_border_width_all(1)
	banner_style.set_corner_radius_all(10)
	banner_style.set_content_margin_all(12)
	banner_style.content_margin_left = 22
	banner_style.content_margin_right = 22
	_banner.add_theme_stylebox_override("panel", banner_style)
	var banner_text := Label.new()
	banner_text.text = "■  E-STOP LATCHED  ·  figures held at rest"
	banner_text.add_theme_font_size_override("font_size", 15)
	banner_text.add_theme_color_override("font_color", Color(1, 0.92, 0.9))
	_banner.add_child(banner_text)
	_banner.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_banner.position.y = 18
	_banner.visible = false
	add_child(_banner)


func add_log(line: String) -> void:
	_lines.append(line)
	if _lines.size() > 9:
		_lines.pop_front()
	if _log != null:
		_log.text = "\n".join(_lines.map(func(l): return "[color=#aab4c5]%s[/color]" % l.replace("[", "[lb]")))


func set_error(message: String) -> void:
	_error = message


func _unhandled_key_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match event.keycode:
		KEY_TAB:
			_toggle()
		KEY_L:
			_log_panel.visible = not _log_panel.visible
		KEY_H:
			var on := not _panel.visible
			_panel.visible = on
			_hint.visible = on
			if not on:
				_log_panel.visible = false


func _toggle() -> void:
	_expanded = not _expanded
	_refresh = 0.0


func _process(delta: float) -> void:
	_refresh -= delta
	if _refresh > 0.0 or _status == null:
		return
	_refresh = 0.1
	_status.text = _render()
	_banner.visible = _main.devices.any(func(d): return d.estopped)
	# Keep the banner centred as its width changes.
	_banner.position.x = (get_viewport().get_visible_rect().size.x - _banner.size.x) / 2.0


func _render() -> String:
	var cfg: Dictionary = _main.config
	var devices: Array = _main.devices
	var online := devices.filter(func(d): return d.link == "online").size()
	var lead = devices.filter(func(d): return not d.active.is_empty())
	var out := PackedStringArray()
	var chevron := "▾" if _expanded else "▸"
	var dot := "#4cd6a2" if online == devices.size() and devices.size() > 0 else "#f5b443"
	out.append(
		"[color=#f5a524]%s[/color] [b]%s[/b]  [color=%s]●[/color] [color=#aab4c5]%d/%d online[/color]"
		% [chevron, cfg["env"], dot, online, devices.size()]
	)
	if _error != "":
		out.append("[color=#f0554b]%s[/color]" % _error.replace("[", "[lb]"))
	if lead.is_empty():
		out.append("[color=#8b95a7]idle · deploy and launch from the studio[/color]")
	else:
		var d = lead[0]
		var bundle: Dictionary = d.active["bundle"]
		var t: float = d.show_time_ms()
		var duration: float = bundle["durationMs"]
		var bar := _bar(clampf(t / duration, 0.0, 1.0), 18)
		var phase := (
			"T−%.1fs" % (-t / 1000.0) if t < 0.0 else "%s / %s" % [_mmss(t), _mmss(duration)]
		)
		out.append("[color=#5cc8ea]▶[/color] %s  [color=#aab4c5]%s[/color]" % [bundle["show"]["name"], phase])
		out.append("[color=#5cc8ea]%s[/color]" % bar)
		var started: Array = _main.bus.started_behaviors()
		if not started.is_empty():
			out.append("[color=#4cd6a2]◎ %s[/color]" % ", ".join(started.map(func(s): return s["id"])))
	if _expanded:
		out.append("")
		for d in devices:
			var state: String = d.state()
			var staged := 0
			for info in d.staged_shows():
				if info["status"] == "staged":
					staged += 1
			out.append(
				"[color=#8b95a7]%s[/color] %-10s [color=%s]●[/color] [color=%s]%-8s[/color] [color=#8b95a7]%d staged[/color]"
				% [
					KIND_GLYPH.get(d.kind, "·"),
					d.device_id,
					LINK_COLORS.get(d.link, "#fff"),
					STATE_COLORS.get(state, "#fff"),
					state,
					staged,
				]
			)
		out.append("[color=#5b6578]%s[/color]" % cfg["api"])
	return "\n".join(out)


static func _mmss(ms: float) -> String:
	var s := int(maxf(0.0, ms) / 1000.0)
	return "%d:%02d" % [s / 60, s % 60]


static func _bar(fraction: float, width: int) -> String:
	var filled := int(round(fraction * width))
	return "━".repeat(filled) + "[color=#2a3550]" + "━".repeat(width - filled) + "[/color]"


func _glass(at: Vector2, width: float) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.06, 0.1, 0.62)
	style.border_color = Color(1, 1, 1, 0.08)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.set_content_margin_all(10)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.shadow_color = Color(0, 0, 0, 0.35)
	style.shadow_size = 12
	panel.add_theme_stylebox_override("panel", style)
	panel.position = at
	panel.custom_minimum_size = Vector2(width, 0)
	panel.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	add_child(panel)
	return panel


func _label(font: Font, size: int) -> RichTextLabel:
	var label := RichTextLabel.new()
	label.bbcode_enabled = true
	label.fit_content = true
	label.scroll_active = false
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("normal_font", font)
	label.add_theme_font_override("bold_font", font)
	label.add_theme_font_size_override("normal_font_size", size)
	label.add_theme_font_size_override("bold_font_size", size)
	return label
