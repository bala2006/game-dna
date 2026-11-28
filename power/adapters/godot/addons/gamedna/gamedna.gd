extends Node
## GameDNA bridge adapter for Godot 4, protocol v1.
##
## Wiring: add the autoload GameDNA="*res://addons/gamedna/gamedna.gd" to project.godot, then call
## GameDNA.register(self) from the node that owns the simulation.
##
## The adapter does nothing unless this is a debug build and both GAMEDNA_BRIDGE (127.0.0.1:<port>)
## and GAMEDNA_TOKEN are set. It connects to the GameDNA MCP server, sends one hello line, waits for
## the server's welcome, and from then on only answers requests, one JSON line per reply.
##
## Harness contract, the methods the registered object provides:
##   gamedna_tick_rate() -> int                   fixed ticks per second
##   gamedna_reset(seed: int, params: Dictionary, setup: Dictionary)
##   gamedna_set_input(key: String, down: bool)   latch one action; live input uses the same latch
##   gamedna_step()                               advance exactly one fixed tick
##   gamedna_snapshot() -> Dictionary             flat String keys to bool, int, float, String or null
##   gamedna_drain_events() -> Array              { "type": String, "data": Dictionary } since the last call
##   gamedna_tick() -> int                        ticks since the last reset
##   gamedna_parameters() -> Dictionary           current tuning values, overrides included
##   gamedna_set_live(live: bool)                 true: the game steps itself from player input

const PROTOCOL := 1
const RING_SIZE := 1024
const MAX_LINE_BYTES := 16 * 1024 * 1024
const MAX_TICKS := 36000
const MAX_INPUTS := 5000
const MAX_EVENTS := 20000
const MAX_SEED := 2147483647
const MAX_SAFE_INT := 9007199254740991
const HARNESS_METHODS: Array[String] = [
	"gamedna_tick_rate", "gamedna_reset", "gamedna_set_input", "gamedna_step", "gamedna_snapshot",
	"gamedna_drain_events", "gamedna_tick", "gamedna_parameters", "gamedna_set_live",
]

enum Link { OFF, CONNECTING, AWAITING_WELCOME, READY }

var _link := Link.OFF
var _peer := StreamPeerTCP.new()
var _token := ""
var _inbox := PackedByteArray()
var _harness = null
var _live := true
var _ring: Array = []
var _next_seq := 0


func _init() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ring.resize(RING_SIZE)


func register(harness: Object) -> void:
	if not OS.is_debug_build():
		return
	var address := OS.get_environment("GAMEDNA_BRIDGE")
	var token := OS.get_environment("GAMEDNA_TOKEN")
	if address.is_empty() or token.is_empty():
		return
	var missing := HARNESS_METHODS.filter(func(m: String) -> bool: return not harness.has_method(m))
	if not missing.is_empty():
		push_warning("GameDNA: the harness lacks %s, so the bridge stays off" % ", ".join(PackedStringArray(missing)))
		return
	_harness = harness
	if _link != Link.OFF:
		return
	var parts := address.split(":")
	var port := parts[1].to_int() if parts.size() == 2 and parts[1].is_valid_int() else 0
	if parts.size() != 2 or parts[0] != "127.0.0.1" or port < 1 or port > 65535:
		push_warning("GameDNA: GAMEDNA_BRIDGE must be 127.0.0.1:<port>, not %s" % address)
		return
	if _peer.connect_to_host("127.0.0.1", port) != OK:
		push_warning("GameDNA: could not start connecting to %s" % address)
		return
	_token = token
	_link = Link.CONNECTING


func _process(_delta: float) -> void:
	if _link == Link.OFF:
		return
	_peer.poll()
	var status := _peer.get_status()
	if status == StreamPeerTCP.STATUS_CONNECTING:
		return
	if status != StreamPeerTCP.STATUS_CONNECTED:
		_close("the GameDNA server closed the connection")
		return
	if _link == Link.CONNECTING:
		_peer.set_no_delay(true)
		_link = Link.AWAITING_WELCOME
		_send(_hello())
	if _link != Link.OFF:
		_receive()


func _physics_process(_delta: float) -> void:
	if _live and is_instance_valid(_harness):
		_collect_live()


func _hello() -> Dictionary:
	var version := Engine.get_version_info()
	return {
		"type": "hello",
		"protocol": PROTOCOL,
		"token": _token,
		"engine": "godot",
		"engineVersion": "%d.%d.%d" % [version["major"], version["minor"], version["patch"]],
		"game": str(ProjectSettings.get_setting("application/config/name", "")).left(80),
		"tickRateHz": int(_harness.gamedna_tick_rate()),
		"capabilities": [] if _headless() else ["screenshot"],
	}


func _receive() -> void:
	var available := _peer.get_available_bytes()
	if available > 0:
		var chunk := _peer.get_data(available)
		if chunk[0] != OK:
			_close("reading from the GameDNA server failed")
			return
		_inbox.append_array(chunk[1])
	var end := _inbox.find(10)
	while end >= 0 and _link != Link.OFF:
		var line := _inbox.slice(0, end).get_string_from_utf8()
		_inbox = _inbox.slice(end + 1)
		_handle(line)
		end = _inbox.find(10)
	if _inbox.size() > MAX_LINE_BYTES:
		_close("a message from the GameDNA server exceeded 16 MiB")


func _handle(line: String) -> void:
	var json := JSON.new()
	if json.parse(line) != OK or typeof(json.data) != TYPE_DICTIONARY:
		push_warning("GameDNA: dropped a line that is not a JSON object")
		return
	var message: Dictionary = json.data
	# The welcome is the only sign that the server accepted our token, so nothing before it gets an answer.
	if _link == Link.AWAITING_WELCOME:
		if str(message.get("type", "")) == "welcome":
			_link = Link.READY
		else:
			push_warning("GameDNA: dropped a message that arrived before the server's welcome")
		return
	var id := _int_in(message.get("id"), 1, MAX_SAFE_INT)
	if id < 0:
		push_warning("GameDNA: dropped a request without a valid id")
		return
	var reply := {"id": id}
	reply.merge(_dispatch(message.get("method"), message.get("params", {})))
	_send(reply)


func _dispatch(method: Variant, params: Variant) -> Dictionary:
	if typeof(method) != TYPE_STRING or typeof(params) != TYPE_DICTIONARY:
		return _fail("BAD_REQUEST", "a request needs a string method and an object params")
	if not is_instance_valid(_harness):
		return _fail("GAME_ERROR", "the registered harness no longer exists")
	match method:
		"reset":
			return _reset(params)
		"advance":
			return _advance(params)
		"snapshot":
			return _snapshot(params)
		"events":
			return _events(params)
		"parameters":
			return _parameters()
		"control":
			return _control(params)
		"screenshot":
			return _screenshot()
	return _fail("UNKNOWN_METHOD", "unknown method %s" % str(method).left(60))


func _reset(p: Dictionary) -> Dictionary:
	var run_seed := _int_in(p.get("seed"), 0, MAX_SEED)
	var params: Variant = p.get("params")
	var setup: Variant = p.get("setup")
	if run_seed < 0 or typeof(params) != TYPE_DICTIONARY or typeof(setup) != TYPE_DICTIONARY:
		return _fail("BAD_REQUEST", "reset needs an integer seed and params and setup objects")
	_set_live(false)
	_harness.gamedna_reset(run_seed, params, setup)
	_harness.gamedna_drain_events()
	return _state_result(null)


## Port of advanceHarness in packages/core/src/bridge.ts. Keep the two line for line.
func _advance(p: Dictionary) -> Dictionary:
	if _live:
		return _fail("BAD_REQUEST", "advance only runs in controlled mode; send reset or control first")
	var to := _int_in(p.get("to"), 0, MAX_TICKS)
	var sample_every := _int_in(p.get("sampleEvery"), 1, MAX_SAFE_INT)
	var last_tick := _int_in(p.get("lastTick"), 0, MAX_TICKS)
	var max_events := _int_in(p.get("maxEvents"), 0, MAX_EVENTS)
	var parsed: Variant = _parse_inputs(p.get("inputs"))
	if to < 0 or sample_every < 0 or last_tick < 0 or max_events < 0 or parsed == null:
		return _fail("BAD_REQUEST", "advance needs to, inputs, sampleEvery, lastTick and maxEvents within protocol v1 limits")
	var inputs: Array = parsed
	var events := []
	var samples := []
	var truncated := false
	var next := 0
	while _harness_tick() < to:
		var tick := _harness_tick()
		while next < inputs.size() and inputs[next]["tick"] <= tick:
			if inputs[next]["tick"] == tick:
				_harness.gamedna_set_input(inputs[next]["key"], inputs[next]["down"])
			next += 1
		_harness.gamedna_step()
		var now := _harness_tick()
		if now <= tick:
			return _fail("GAME_ERROR", "gamedna_step() did not advance gamedna_tick()")
		var drained: Variant = _drain()
		if drained == null:
			return _fail("GAME_ERROR", "gamedna_drain_events() must return an Array of { type: String, data: Dictionary }")
		_record(now, drained)
		for raw in drained:
			if events.size() >= max_events:
				truncated = true
				break
			events.append({"tick": now, "type": raw["type"], "data": raw["data"]})
		if now % sample_every == 0 or now == last_tick:
			var state: Variant = _harness.gamedna_snapshot()
			if typeof(state) != TYPE_DICTIONARY:
				return _fail("GAME_ERROR", "gamedna_snapshot() must return a Dictionary")
			samples.append({"tick": now, "state": state})
	return _ok({"tick": _harness_tick(), "events": events, "samples": samples, "truncated": truncated})


func _parse_inputs(raw: Variant) -> Variant:
	if typeof(raw) != TYPE_ARRAY or raw.size() > MAX_INPUTS:
		return null
	var inputs := []
	for item in raw:
		if typeof(item) != TYPE_DICTIONARY:
			return null
		var tick := _int_in(item.get("tick"), 0, MAX_TICKS)
		var key: Variant = item.get("key")
		var down: Variant = item.get("down")
		if tick < 0 or typeof(key) != TYPE_STRING or typeof(down) != TYPE_BOOL:
			return null
		inputs.append({"tick": tick, "key": key, "down": down})
	return inputs


func _snapshot(p: Dictionary) -> Dictionary:
	var fields: Variant = p.get("fields")
	if fields != null:
		if typeof(fields) != TYPE_ARRAY or fields.size() > 200 or fields.any(func(f: Variant) -> bool: return typeof(f) != TYPE_STRING):
			return _fail("BAD_REQUEST", "fields must be an array of at most 200 strings")
	return _state_result(fields)


func _state_result(fields: Variant) -> Dictionary:
	var state: Variant = _harness.gamedna_snapshot()
	var tick := _harness_tick()
	if typeof(state) != TYPE_DICTIONARY or tick < 0:
		return _fail("GAME_ERROR", "gamedna_snapshot() must return a Dictionary and gamedna_tick() an int")
	if fields != null:
		var picked := {}
		for key in fields:
			if state.has(key):
				picked[key] = state[key]
		state = picked
	return _ok({"tick": tick, "state": state})


func _events(p: Dictionary) -> Dictionary:
	var cursor := _int_in(p.get("cursor"), 0, MAX_SAFE_INT)
	var limit := _int_in(p.get("limit"), 1, 1000)
	if cursor < 0 or limit < 0:
		return _fail("BAD_REQUEST", "events needs an integer cursor and a limit from 1 to 1000")
	if _live:
		_collect_live()
	var oldest := maxi(0, _next_seq - RING_SIZE)
	var start := clampi(cursor, oldest, _next_seq)
	var stop := mini(start + limit, _next_seq)
	var out := []
	for seq in range(start, stop):
		out.append(_ring[seq % RING_SIZE])
	return _ok({"events": out, "nextCursor": stop, "dropped": maxi(0, oldest - cursor)})


func _parameters() -> Dictionary:
	var values: Variant = _harness.gamedna_parameters()
	if typeof(values) != TYPE_DICTIONARY:
		return _fail("GAME_ERROR", "gamedna_parameters() must return a Dictionary")
	return _ok({"values": values})


func _control(p: Dictionary) -> Dictionary:
	var mode: Variant = p.get("mode")
	if not (mode is String and (mode == "live" or mode == "controlled")):
		return _fail("BAD_REQUEST", "mode must be live or controlled")
	_set_live(mode == "live")
	return _ok({"mode": mode})


func _screenshot() -> Dictionary:
	if _headless():
		return _fail("UNSUPPORTED", "screenshots need a display, and this run is headless")
	var image := get_tree().root.get_texture().get_image()
	if image == null or image.is_empty():
		return _fail("GAME_ERROR", "the root viewport has no image yet")
	return _ok({"mime": "image/png", "data": Marshalls.raw_to_base64(image.save_png_to_buffer())})


func _set_live(live: bool) -> void:
	if _live and not live:
		_collect_live()
	_live = live
	_harness.gamedna_set_live(live)


func _collect_live() -> void:
	var drained: Variant = _drain()
	if drained != null:
		_record(_harness_tick(), drained)


## Returns the harness events as { type, data } with data never null, or null when they are malformed.
func _drain() -> Variant:
	var drained: Variant = _harness.gamedna_drain_events()
	if typeof(drained) != TYPE_ARRAY:
		return null
	var out := []
	for raw in drained:
		if typeof(raw) != TYPE_DICTIONARY or typeof(raw.get("type")) != TYPE_STRING:
			return null
		var data: Variant = raw.get("data")
		if data == null:
			data = {}
		elif typeof(data) != TYPE_DICTIONARY:
			return null
		out.append({"type": raw["type"], "data": data})
	return out


func _record(tick: int, drained: Array) -> void:
	for raw in drained:
		_ring[_next_seq % RING_SIZE] = {"seq": _next_seq, "tick": tick, "type": raw["type"], "data": raw["data"]}
		_next_seq += 1


func _harness_tick() -> int:
	return _int_in(_harness.gamedna_tick(), 0, MAX_SAFE_INT)


func _send(message: Dictionary) -> void:
	var line := JSON.stringify(message, "", false, true) + "\n"
	if _peer.put_data(line.to_utf8_buffer()) != OK:
		_close("writing to the GameDNA server failed")


func _close(reason: String) -> void:
	push_warning("GameDNA: %s" % reason)
	_peer.disconnect_from_host()
	_link = Link.OFF
	_inbox.clear()
	if not _live and is_instance_valid(_harness):
		_set_live(true)


func _headless() -> bool:
	return DisplayServer.get_name() == "headless"


func _ok(result: Dictionary) -> Dictionary:
	return {"result": result}


func _fail(code: String, message: String) -> Dictionary:
	return {"error": {"code": code, "message": message}}


## Returns value as an int when it is a whole number in [low, high], otherwise -1.
static func _int_in(value: Variant, low: int, high: int) -> int:
	if typeof(value) == TYPE_INT:
		return value if value >= low and value <= high else -1
	if typeof(value) == TYPE_FLOAT and value == floorf(value) and value >= low and value <= high:
		return int(value)
	return -1
