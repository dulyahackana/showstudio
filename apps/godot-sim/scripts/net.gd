extends RefCounted
## HTTP, hashing and media helpers shared by the simulated devices and the stage.


## Awaitable GET. Returns {ok, status, error, body: PackedByteArray}.
static func get_bytes(parent: Node, url: String, headers := PackedStringArray()) -> Dictionary:
	var req := HTTPRequest.new()
	req.timeout = 30.0
	parent.add_child(req)
	var err := req.request(url, headers, HTTPClient.METHOD_GET)
	if err != OK:
		req.queue_free()
		return {"ok": false, "status": 0, "error": "request failed: %s" % error_string(err), "body": PackedByteArray()}
	var res: Array = await req.request_completed
	req.queue_free()
	var result: int = res[0]
	var status: int = res[1]
	var body: PackedByteArray = res[3]
	if result != HTTPRequest.RESULT_SUCCESS:
		return {"ok": false, "status": 0, "error": "network error %d" % result, "body": body}
	if status < 200 or status >= 300:
		return {"ok": false, "status": status, "error": "HTTP %d" % status, "body": body}
	return {"ok": true, "status": status, "error": "", "body": body}


static func sha256(bytes: PackedByteArray) -> PackedByteArray:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(bytes)
	return ctx.finish()


static func sha256_hex(bytes: PackedByteArray) -> String:
	return sha256(bytes).hex_encode()


## RSA-SHA256 (PKCS#1 v1.5) over the exact bytes, as the studio signs bundles.
static func verify_signature(bytes: PackedByteArray, signature_b64: String, key: CryptoKey) -> bool:
	var signature := Marshalls.base64_to_raw(signature_b64)
	if signature.is_empty():
		return false
	return Crypto.new().verify(HashingContext.HASH_SHA256, sha256(bytes), signature, key)


static func load_public_key(pem: String) -> CryptoKey:
	var key := CryptoKey.new()
	return key if key.load_from_string(pem, true) == OK else null


## WAV, Ogg Vorbis or MP3, recognized by magic bytes (the studio checks the same on upload).
static func audio_stream(bytes: PackedByteArray) -> AudioStream:
	if bytes.size() < 12:
		return null
	var magic := bytes.slice(0, 4).get_string_from_ascii()
	if magic == "RIFF":
		return AudioStreamWAV.load_from_buffer(bytes)
	if magic == "OggS":
		return AudioStreamOggVorbis.load_from_buffer(bytes)
	var mp3 := AudioStreamMP3.new()
	mp3.data = bytes
	return mp3


static func write_atomic(path: String, bytes: PackedByteArray) -> bool:
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var tmp := path + ".tmp"
	var file := FileAccess.open(tmp, FileAccess.WRITE)
	if file == null:
		return false
	file.store_buffer(bytes)
	file.close()
	# Atomic rename: a power cut never leaves a half-written show.
	return DirAccess.rename_absolute(tmp, path) == OK


static func now_ms() -> float:
	return Time.get_unix_time_from_system() * 1000.0
