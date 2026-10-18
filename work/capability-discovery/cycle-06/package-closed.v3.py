"""Closed cycle06 byte package: prospective build/verify/stage; E1530 NOT_RUN.

Reuses cycle05 digest-bound stored/raw alias and exclusive-write patterns, not
its unbounded decoder, symlink restoration or executable path rewriting.
Only stdlib plus separately hash-bound /usr/bin/zstd; never project imports.
"""
import argparse
import datetime
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import stat
import subprocess
import tarfile
from urllib.parse import unquote, urlsplit

WORKSPACE = Path("/workspace/scratch/8528bb251845")
REPO = WORKSPACE / "chainspot-discovery-lab"
CONTROL = {"index.json", "package-manifest.json", "SHA256SUMS", "STAGE-RECEIPT.json"}
MAX_FILE = 16 * 1024 * 1024
MAX_TOTAL = 128 * 1024 * 1024
MAX_ALIASES = 2048
ZSTD = Path("/usr/bin/zstd")
ZSTD_SHA = "7c5468b370f7c47eda07281e3437fafc568f95d10420051e3aa522709f9342c5"
INPUT_BODIES = {"30fa01879840deb0584ffe001fa39779998710010faeae93510dbc7a8a0abe6e", "4379abb30a5b0907aa0e1435b13e19eafe8fdd31ac57c9b8bdff4495a14fdc2a", "305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609"}


def sha(body):
    return hashlib.sha256(body).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2) + "\n").encode()


def name(value):
    if not isinstance(value, str) or not value or "\\" in value or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError("invalid name")
    if PurePosixPath(value).is_absolute() or any(x in ("", ".", "..") for x in value.split("/")):
        raise ValueError("unsafe/noncanonical name: " + value)
    value.encode("ascii")
    return value


def paths_closed(values, controls=False):
    seen = set()
    for value in values:
        value = name(value)
        if value in seen or (controls and value in CONTROL):
            raise ValueError("duplicate/control name: " + value)
        seen.add(value)
    for value in seen:
        if any(str(p) in seen for p in PurePosixPath(value).parents if str(p) != "."):
            raise ValueError("file-parent collision: " + value)
        if controls and any(str(p) in CONTROL for p in PurePosixPath(value).parents):
            raise ValueError("control-file parent collision: " + value)
    return seen


def read_file(root, rel, expected=None, limit=MAX_FILE):
    rel = name(rel)
    current = root
    if root.is_symlink() or root.resolve() != root:
        raise ValueError("noncanonical root")
    for part in rel.split("/"):
        current = current / part
        if current.is_symlink():
            raise ValueError("symlink component: " + rel)
    attrs = current.lstat()
    mode = stat.S_IMODE(attrs.st_mode)
    if not stat.S_ISREG(attrs.st_mode) or attrs.st_nlink != 1 or mode not in (0o644, 0o755):
        raise ValueError("not single-link regular0644/0755: " + rel)
    if attrs.st_size > limit or (expected and attrs.st_size != expected["bytes"]):
        raise ValueError("file size/cap: " + rel)
    body = current.read_bytes()
    if len(body) != attrs.st_size or (expected and (sha(body) != expected["sha256"] or mode != expected["mode"])):
        raise ValueError("file hash/full-mode mismatch: " + rel)
    return body


def put(root, rel, body, mode=0o644):
    target = root / name(rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("xb") as handle:
        handle.write(body)
    os.chmod(target, mode)


def fresh(path, prefix):
    if not path.is_absolute() or path.parent != WORKSPACE or not path.name.startswith(prefix):
        raise ValueError("wrong bounded output path")
    if path.exists() or path.is_symlink() or path.parent.resolve() != path.parent:
        raise ValueError("output must be fresh/canonical")
    path.mkdir(mode=0o755)


def header(member):
    info = tarfile.TarInfo(name(member["name"]))
    info.size = member["bytes"]
    info.mode = member["mode"]
    info.uid = info.gid = info.mtime = 0
    info.uname = info.gname = ""
    info.type = tarfile.REGTYPE
    return info.tobuf(format=tarfile.USTAR_FORMAT, encoding="ascii", errors="strict")


def tar_size(members):
    return 1024 + sum(512 + ((m["bytes"] + 511) // 512) * 512 for m in members)


def check_tar(raw, members):
    if len(raw) != tar_size(members):
        raise ValueError("tar exact length mismatch")
    offset = 0
    bodies = {}
    for member in members:
        expected_header = header(member)
        if len(expected_header) != 512 or raw[offset:offset + 512] != expected_header:
            raise ValueError("noncanonical USTAR header/order/type/mode: " + member["name"])
        offset += 512
        body = raw[offset:offset + member["bytes"]]
        if len(body) != member["bytes"] or sha(body) != member["sha256"]:
            raise ValueError("archive member body mismatch")
        bodies[member["name"]] = body
        padded = ((member["bytes"] + 511) // 512) * 512
        if raw[offset + member["bytes"]:offset + padded] != bytes(padded - member["bytes"]):
            raise ValueError("nonzero member padding")
        offset += padded
    if raw[offset:] != bytes(1024):
        raise ValueError("tar EOF/trailing bytes")
    return bodies


def operation(argv, logs, label, source=None, decoded_limit=None, stored_path=None):
    if sha(ZSTD.read_bytes()) != ZSTD_SHA or ZSTD.is_symlink():
        raise ValueError("zstd executable changed")
    stderr_path = logs / (label + ".stderr.raw")
    record = {"argv": argv, "startUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(), "actualExit": None, "actualSignal": None}
    child = None
    body = b""
    failure = None
    try:
        with stderr_path.open("xb") as err:
            if decoded_limit is None:
                stdout_path = stored_path
                stdout_path.parent.mkdir(parents=True, exist_ok=True)
                with stdout_path.open("xb") as out:
                    child = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=out, stderr=err, cwd=WORKSPACE)
                    child.communicate(source, timeout=30)
                if stdout_path.stat().st_size > len(source) + 131072:
                    raise ValueError("compression bound exceeded; raw stdout retained")
                body = stdout_path.read_bytes()
            else:
                if not 0 <= decoded_limit <= MAX_FILE:
                    raise ValueError("decode exact cap")
                child = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=err, cwd=WORKSPACE)
                body = child.stdout.read(decoded_limit + 1)
                if len(body) > decoded_limit:
                    raise ValueError("decode exceeded exact bound")
                child.wait(timeout=30)
    except BaseException as error:
        failure = str(error)
        if child is not None and child.poll() is None:
            child.kill()
            child.wait()
        if decoded_limit is not None and body:
            put(logs, label + ".failed-stdout-prefix.raw", body)
    code = child.returncode if child is not None else None
    record.update(endUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(), pid=child.pid if child else None,
                  actualExit=code if code is not None and code >= 0 else None,
                  actualSignal=-code if code is not None and code < 0 else None,
                  error=failure,
                  stdoutBytes=len(body), stdoutSha256=sha(body))
    if stored_path is not None:
        record["stdoutPath"] = str(stored_path.relative_to(logs.parent))
        record["stdoutBytes"] = record["stdoutSha256"] = None
        try:
            actual_size = stored_path.stat().st_size
            actual_digest = hashlib.sha256()
            counted = 0
            with stored_path.open("rb") as stream:
                for block in iter(lambda: stream.read(65536), b""):
                    counted += len(block)
                    actual_digest.update(block)
            if counted != actual_size:
                raise ValueError("retained stdout size changed during capture")
            record.update(stdoutBytes=counted, stdoutSha256=actual_digest.hexdigest())
        except BaseException as capture_error:
            record["stdoutCaptureError"] = str(capture_error)
            if failure is None:
                failure = "compression stdout capture unavailable"
                record["error"] = failure
    error = read_file(logs, stderr_path.name)
    record["stderr"] = {"path": stderr_path.name, "bytes": len(error), "sha256": sha(error)}
    put(logs, label + ".process.json", encoded(record))
    if failure or code != 0 or error:
        raise ValueError("zstd first terminal nonzero/stderr; retained")
    return body


def inventory(root):
    result = set()
    for directory, dirs, files in os.walk(root, followlinks=False):
        for n in dirs:
            if (Path(directory) / n).is_symlink():
                raise ValueError("symlink directory")
        for n in files:
            rel = str((Path(directory) / n).relative_to(root))
            read_file(root, rel)
            result.add(rel)
    return result


def preservation(plan):
    freeze = json.loads(read_file(WORKSPACE, plan["sourceFreeze"]["source"], plan["sourceFreeze"]))
    source_modes = {r["path"]: r["mode"] for r in plan["source22Modes"]}
    for entry in freeze["entries"]:
        read_file(REPO, entry["path"], {"bytes": entry["bytes"], "sha256": entry["sha256"], "mode": source_modes[entry["path"]]})
    prior = json.loads(read_file(WORKSPACE, plan["priorInventory"]["source"], plan["priorInventory"]))
    mode_snapshot = plan["priorCurrentModes"]
    modes = dict(mode_snapshot["exceptions"])
    index = subprocess.check_output(["git", "ls-files", "--stage", "-z"], cwd=REPO).decode().split("\0")
    actual = {s.split("\t")[1]: s.split("\t")[0] for s in index if s}
    if set(actual) != {e["path"] for e in prior["entries"]} or len(prior["entries"]) != 2523:
        raise ValueError("prior tracked paths changed")
    for entry in prior["entries"]:
        body = read_file(REPO, entry["path"], {"bytes": entry["bytes"], "sha256": entry["sha256"], "mode": modes.get(entry["path"], mode_snapshot["defaultMode"])})
        blob = hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()
        if actual[entry["path"]] != entry["mode"] + " " + entry["blob"] + " " + str(entry["stage"]) or blob != entry["blob"]:
            raise ValueError("prior index/blob changed")


def check_plan(plan):
    if plan["schema"] != "cycle06-closed-proposed-inputs@1" or plan["status"] != "ROOT_ADMITTED_FINAL_INPUTS":
        raise ValueError("draft/pending plan cannot build")
    if plan["notFinalFreeze"] is not False:
        raise ValueError("input allowlist not finally admitted")
    if not plan["authority"]["visualAccepted"] or not plan["authority"]["comparisonAccepted"]:
        raise ValueError("missing independent visual/comparison acceptance")
    for key in ("visualReview", "comparisonReview"):
        bound = plan["authority"][key]
        review = json.loads(read_file(WORKSPACE, bound["source"], bound))
        if review.get("decision") != "accepted":
            raise ValueError("review is not accepted")
    if [a["id"] for a in plan["archives"]] != ["original", "replay", "counterexamples"] or [len(a["members"]) for a in plan["archives"]] != [340, 340, 2]:
        raise ValueError("closed three-archive contract")
    aliases = plan["aliases"]
    if len(aliases) > MAX_ALIASES or sum(a["bytes"] for a in aliases) > MAX_TOTAL:
        raise ValueError("alias count/expanded cap")
    paths_closed((a["logical"] for a in aliases), controls=True)
    if len({a["source"] for a in aliases}) != len(aliases):
        raise ValueError("logical source identities not bijective")
    objects = {o["id"]: o for o in plan["objects"]}
    if len(objects) != len(plan["objects"]):
        raise ValueError("duplicate object id")
    for obj in objects.values():
        if obj["codec"] not in ("raw", "zstd") or not obj["id"].startswith("b") or not obj["id"][1:].isdigit():
            raise ValueError("closed blob id/codec")
        if "/" not in obj["path"] or obj["path"].split("/")[0] not in ("objects", "content", "source", "figures"):
            raise ValueError("reserved object prefix")
    paths_closed([o["path"] for o in objects.values()] + [a["path"] for a in plan["archives"]] + ["index.json", "construction-plan.json", "tool-source.py.txt"], controls=False)
    archives = {a["id"]: a for a in plan["archives"]}
    for archive in archives.values():
        if archive["path"] != "archives/" + archive["id"] + ".tar.zstd":
            raise ValueError("wrong closed archive path")
        paths_closed(m["name"] for m in archive["members"])
        if tar_size(archive["members"]) > MAX_FILE:
            raise ValueError("tar expanded cap")
        for member in archive["members"]:
            if member["mode"] not in (0o644, 0o755) or type(member["bytes"]) is not int or not 0 <= member["bytes"] <= MAX_FILE:
                raise ValueError("member mode/size")
    used_blobs = set()
    used_members = set()
    for alias in aliases:
        if type(alias["bytes"]) is not int or not 0 <= alias["bytes"] <= MAX_FILE:
            raise ValueError("alias exact integer size cap")
        if alias["sha256"] in INPUT_BODIES or alias["mode"] not in (0o644, 0o755):
            raise ValueError("omitted input/special alias mode")
        route = alias["storage"]
        if set(route) == {"blob"} and route["blob"] in objects:
            target = objects[route["blob"]]
            used_blobs.add(route["blob"])
        elif set(route) == {"archive", "member"} and route["archive"] in archives:
            matches = [m for m in archives[route["archive"]]["members"] if m["name"] == route["member"]]
            if len(matches) != 1:
                raise ValueError("archive member alias absent/ambiguous")
            target = matches[0]
            identity = (route["archive"], route["member"])
            if identity in used_members or alias["source"] != target["source"]:
                raise ValueError("archive physical identity alias repeated/swapped")
            used_members.add(identity)
        else:
            raise ValueError("indirect/unknown alias route")
        if any(alias[k] != target[k] for k in ("bytes", "sha256", "mode")):
            raise ValueError("alias not exact target identity")
    if used_blobs != set(objects) or used_members != {(a["id"], m["name"]) for a in archives.values() for m in a["members"]}:
        raise ValueError("unreferenced object/member or incomplete aliases")
    by_source = {a["source"]: a for a in aliases}
    for bound in plan["requiredEvidence"]:
        if bound["source"] not in by_source or any(bound[k] != by_source[bound["source"]][k] for k in ("bytes", "sha256", "mode")):
            raise ValueError("required review/AMEND history missing")
    preservation(plan)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.hrefs += [v for k, v in attrs if k == "href"]


def html_links(plan, aliases):
    logical = {a["logical"] for a in plan["aliases"]}
    observed = []
    for rel in plan["htmlFiles"]:
        parser = Links()
        parser.feed(aliases[rel].decode("utf-8"))
        targets = []
        for href in parser.hrefs:
            if href.startswith("#"):
                continue
            url = urlsplit(href)
            if url.scheme or url.netloc or url.query or url.path.startswith("/"):
                raise ValueError("nonlocal HTML link")
            target = posixpath.normpath(posixpath.join(posixpath.dirname(rel), unquote(url.path)))
            name(target)
            if target not in logical:
                raise ValueError("unrestored HTML target: " + target)
            targets.append(target)
        observed.append({"html": rel, "targets": targets})
    if observed != plan["htmlLinkSets"]:
        raise ValueError("HTML link-set mismatch")


def decode_index(package, index, logs):
    plan = index["plan"]
    object_computed = {"storedBytes", "storedSha256"}
    archive_computed = {"bytes", "sha256", "codec", "storedBytes", "storedSha256"}
    for key, computed in (("objects", object_computed), ("archives", archive_computed)):
        if len(index[key]) != len(plan[key]):
            raise ValueError("index/plan descriptor count mismatch: " + key)
        for actual, expected in zip(index[key], plan[key]):
            if set(actual) != set(expected) | computed or any(k in expected for k in computed):
                raise ValueError("index/plan descriptor fields mismatch: " + key)
            if {k: v for k, v in actual.items() if k not in computed} != expected:
                raise ValueError("index/plan ordered descriptor mismatch: " + key)
            if key == "archives" and (actual["codec"] != "zstd"
                    or actual["bytes"] != expected["tarBytes"]
                    or actual["bytes"] != tar_size(expected["members"])):
                raise ValueError("archive codec/computed size disagrees with plan")
    bodies = {}
    archives = {}
    for obj in index["objects"] + index["archives"]:
        stored = read_file(package, obj["path"], {"bytes": obj["storedBytes"], "sha256": obj["storedSha256"], "mode": 0o644})
        if obj["codec"] == "zstd":
            raw = operation([str(ZSTD), "-q", "-d", "-c", str(package / obj["path"])], logs, "decode-" + obj["id"], decoded_limit=obj["bytes"])
        elif obj["codec"] == "raw":
            raw = stored
        else:
            raise ValueError("unknown stored codec")
        if len(raw) != obj["bytes"] or sha(raw) != obj["sha256"]:
            raise ValueError("decoded raw identity mismatch")
        if "members" in obj:
            archives[obj["id"]] = check_tar(raw, obj["members"])
        else:
            bodies[obj["id"]] = raw
    aliases = {}
    for alias in index["plan"]["aliases"]:
        route = alias["storage"]
        raw = bodies[route["blob"]] if "blob" in route else archives[route["archive"]][route["member"]]
        if len(raw) != alias["bytes"] or sha(raw) != alias["sha256"]:
            raise ValueError("independent alias readback mismatch")
        aliases[alias["logical"]] = raw
    html_links(index["plan"], aliases)
    return aliases


def build(plan, output, plan_body):
    check_plan(plan)
    for archive in plan["archives"][:2]:
        root = WORKSPACE / archive["sourceRoot"]
        expected = {m["name"] for m in archive["members"]}
        if inventory(root) != expected:
            raise ValueError("raw directory exact340 set mismatch")
        manifest_binding = next(m for m in archive["members"] if m["name"] == "artifact-manifest.json")
        manifest = json.loads(read_file(root, "artifact-manifest.json", manifest_binding))
        if len(manifest["artifacts"]) != 338 or [m["name"] for m in archive["members"][:338]] != [m["path"] for m in manifest["artifacts"]]:
            raise ValueError("manifest exact338 order mismatch")
        for row, bound in zip(manifest["artifacts"], archive["members"]):
            if any(row[k] != bound[k] for k in ("bytes", "sha256")):
                raise ValueError("manifest member identity mismatch")
    for alias in plan["aliases"]:
        read_file(WORKSPACE, alias["source"], alias)
    fresh(output, "discovery-cycle06-final-")
    logs = output / "operations"
    logs.mkdir()
    index = {"schema": "cycle06-closed-index@1", "plan": plan, "planBinding": {"path": "construction-plan.json", "bytes": len(plan_body), "sha256": sha(plan_body), "mode": 0o644}, "objects": [], "archives": []}
    put(output, "construction-plan.json", plan_body)
    put(output, "tool-source.py.txt", Path(__file__).read_bytes())
    for obj in plan["objects"]:
        raw = read_file(WORKSPACE, obj["source"], obj)
        if obj["codec"] == "zstd":
            stored = operation([str(ZSTD), "-q", "-3", "-c"], logs, "compress-" + obj["id"], source=raw, stored_path=output / obj["path"])
        else:
            stored = raw
            put(output, obj["path"], stored)
        index["objects"].append({**obj, "storedBytes": len(stored), "storedSha256": sha(stored)})
    for archive in plan["archives"]:
        pieces = []
        for member in archive["members"]:
            raw = read_file(WORKSPACE, member["source"], member)
            pieces.extend([header(member), raw, bytes((-len(raw)) % 512)])
        raw = b"".join(pieces) + bytes(1024)
        check_tar(raw, archive["members"])
        stored = operation([str(ZSTD), "-q", "-3", "-c"], logs, "compress-" + archive["id"], source=raw, stored_path=output / archive["path"])
        index["archives"].append({**archive, "bytes": len(raw), "sha256": sha(raw), "storedBytes": len(stored), "storedSha256": sha(stored), "codec": "zstd"})
    put(output, "index.json", encoded({k: v for k, v in index.items() if k != "plan"}))
    decode_index(output, index, logs)
    preservation(plan)
    files = []
    for rel in sorted(inventory(output)):
        raw = read_file(output, rel)
        files.append({"path": rel, "bytes": len(raw), "sha256": sha(raw), "mode": stat.S_IMODE((output / rel).stat().st_mode)})
    manifest = {"schema": "cycle06-closed-payload@1", "files": files, "limits": plan["limits"]}
    body = encoded(manifest)
    put(output, "package-manifest.json", body)
    sums = "".join(e["sha256"] + "  " + e["path"] + "\n" for e in files) + sha(body) + "  package-manifest.json\n"
    put(output, "SHA256SUMS", sums.encode())
    return {"status": "BUILT_BYTE_VERIFIED_NOT_INDEPENDENTLY_ACCEPTED", "files": len(files) + 2, "manifestSha256": sha(body), "science": "UNKNOWN"}


def verify(package, manifest_sha, logs, stage=None):
    manifest_body = read_file(package, "package-manifest.json", limit=2 * 1024 * 1024)
    if sha(manifest_body) != manifest_sha:
        raise ValueError("root-bound manifest mismatch")
    manifest = json.loads(manifest_body)
    paths_closed(e["path"] for e in manifest["files"])
    expected = {e["path"] for e in manifest["files"]} | {"package-manifest.json", "SHA256SUMS"}
    if inventory(package) != expected:
        raise ValueError("payload exact file-set mismatch")
    for entry in manifest["files"]:
        read_file(package, entry["path"], entry)
    sums = "".join(e["sha256"] + "  " + e["path"] + "\n" for e in manifest["files"]) + sha(manifest_body) + "  package-manifest.json\n"
    if read_file(package, "SHA256SUMS") != sums.encode():
        raise ValueError("SHA256SUMS mismatch")
    index = json.loads(read_file(package, "index.json", limit=2 * 1024 * 1024))
    if index["schema"] != "cycle06-closed-index@1" or index["planBinding"]["path"] != "construction-plan.json":
        raise ValueError("closed index/plan binding")
    index["plan"] = json.loads(read_file(package, "construction-plan.json", index["planBinding"], limit=2 * 1024 * 1024))
    check_plan(index["plan"])
    aliases = decode_index(package, index, logs)
    if stage is not None:
        fresh(stage, "discovery-cycle06-restored-")
        for entry in index["plan"]["aliases"]:
            put(stage, entry["logical"], aliases[entry["logical"]], entry["mode"])
            read_file(stage, entry["logical"], entry)
        if inventory(stage) != set(aliases):
            raise ValueError("restored exact logical set")
        put(stage, "STAGE-RECEIPT.json", encoded({"schema": "cycle06-closed-stage@1", "aliases": len(aliases), "manifestSha256": manifest_sha, "pathOnly": True, "originalImageReplay": False, "science": "UNKNOWN"}))
    return {"status": "EXACT_BYTES_VERIFIED_NOT_INDEPENDENT_PACKAGE_ACCEPTANCE", "aliases": len(aliases), "stage": str(stage) if stage else None, "science": "UNKNOWN"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("build", "verify", "stage"))
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--plan-sha")
    parser.add_argument("--admission", type=Path)
    parser.add_argument("--admission-sha")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--package", type=Path)
    parser.add_argument("--manifest-sha")
    parser.add_argument("--receipt-dir", type=Path)
    args = parser.parse_args()
    if args.mode == "build":
        plan_body = read_file(WORKSPACE, str(args.plan.relative_to(WORKSPACE)), limit=2 * 1024 * 1024)
        admission_body = read_file(WORKSPACE, str(args.admission.relative_to(WORKSPACE)), limit=65536)
        if sha(plan_body) != args.plan_sha or sha(admission_body) != args.admission_sha:
            raise ValueError("root admission/plan digest mismatch")
        admission = json.loads(admission_body)
        if admission != {"schema": "cycle06-closed-build-admission@1", "planSha256": args.plan_sha, "helperSha256": sha(Path(__file__).read_bytes()), "output": str(args.out), "scope": "ONE_FINAL_ARCHIVE_BUILD"}:
            raise ValueError("exact separate root admission required")
        result = build(json.loads(plan_body), args.out, plan_body)
    else:
        fresh(args.receipt_dir, "discovery-cycle06-verify-")
        result = verify(args.package, args.manifest_sha, args.receipt_dir, args.out if args.mode == "stage" else None)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
