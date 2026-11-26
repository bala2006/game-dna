extends Node2D
## A 1-D walker with integer rules. walker.ts is its TypeScript twin; change both together.

const DEFAULT_SPEED := 3
const DEFAULT_JUMP := 6
const COIN_SPACING := 50

var _baseline := {}
var _speed := DEFAULT_SPEED
var _jump := DEFAULT_JUMP
var _x := 0
var _y := 0
var _vy := 0
var _grounded := true
var _coins := 0
var _next_coin := COIN_SPACING
var _tick := 0
var _right := false
var _jump_held := false
var _jump_was_held := false
var _events: Array = []
var _live := true


func _ready() -> void:
	var tuning: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://tuning.json"))
	if typeof(tuning) == TYPE_DICTIONARY:
		_baseline = tuning
	else:
		push_warning("walker: res://tuning.json is missing or not a JSON object")
	gamedna_reset(0, {}, {})
	GameDNA.register(self)


func _physics_process(_delta: float) -> void:
	if not _live:
		return
	gamedna_set_input("right", Input.is_action_pressed("right"))
	gamedna_set_input("jump", Input.is_action_pressed("jump"))
	gamedna_step()


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2(0, 150), Vector2(320, 30)), Color(0.2, 0.25, 0.3))
	draw_rect(Rect2(Vector2(posmod(_x, 304), 134 - _y * 4), Vector2(16, 16)), Color(0.95, 0.8, 0.3))


func gamedna_tick_rate() -> int:
	return Engine.physics_ticks_per_second


func gamedna_reset(run_seed: int, params: Dictionary, _setup: Dictionary) -> void:
	_speed = int(params.get("walker.speed", _baseline.get("walker.speed", DEFAULT_SPEED)))
	_jump = int(params.get("walker.jump", _baseline.get("walker.jump", DEFAULT_JUMP)))
	_x = 0
	_y = 0
	_vy = 0
	_grounded = true
	_coins = 0
	_next_coin = COIN_SPACING + run_seed % 17
	_tick = 0
	_right = false
	_jump_held = false
	_jump_was_held = false
	_events = []


func gamedna_set_input(key: String, down: bool) -> void:
	if key == "right":
		_right = down
	elif key == "jump":
		_jump_held = down


func gamedna_step() -> void:
	var pressed := _jump_held and not _jump_was_held
	_jump_was_held = _jump_held
	if pressed and _grounded:
		_vy = _jump
		_events.append({"type": "jump", "data": {}})
	if _right:
		_x += _speed
		while _x >= _next_coin:
			_coins += 1
			_next_coin += COIN_SPACING
			_events.append({"type": "coin", "data": {"n": _coins}})
	_y += _vy
	_vy -= 1
	if _y <= 0:
		_y = 0
		_vy = 0
		if not _grounded:
			_events.append({"type": "land", "data": {}})
		_grounded = true
	else:
		_grounded = false
	_tick += 1


func gamedna_snapshot() -> Dictionary:
	return {"player.x": _x, "player.y": _y, "player.grounded": _grounded, "coins": _coins, "tick": _tick}


func gamedna_drain_events() -> Array:
	var out := _events
	_events = []
	return out


func gamedna_tick() -> int:
	return _tick


func gamedna_parameters() -> Dictionary:
	return {"walker.speed": _speed, "walker.jump": _jump}


func gamedna_set_live(live: bool) -> void:
	_live = live
