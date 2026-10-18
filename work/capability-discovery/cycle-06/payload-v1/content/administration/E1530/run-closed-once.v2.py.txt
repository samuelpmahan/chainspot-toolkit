"""Prospective root-packet-bound ONE package build wrapper. E1530 NOT_RUN."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import stat
import subprocess

ROOT = Path("/workspace/scratch/8528bb251845")
REPO = ROOT / "chainspot-discovery-lab"
HELPER = "chainspot-discovery-lab/work/capability-discovery/cycle-06/package-closed.v2.py"


def bound(entry, cap):
    value = entry["source"]
    if not value or value.startswith("/") or "\\" in value or any(p in ("", ".", "..") for p in value.split("/")):
        raise ValueError("unsafe bound source")
    current = ROOT
    for part in value.split("/"):
        current = current / part
        if current.is_symlink():
            raise ValueError("symlink bound source")
    info = current.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > cap or info.st_size != entry["bytes"] or stat.S_IMODE(info.st_mode) != entry["mode"]:
        raise ValueError("bound type/size")
    body = current.read_bytes()
    if hashlib.sha256(body).hexdigest() != entry["sha256"]:
        raise ValueError("bound hash")
    return body


def target(value):
    if not value.startswith("discovery-cycle06/G6/") or any(p in ("", ".", "..") for p in value.split("/")) or "\\" in value:
        raise ValueError("wrong bounded capture path")
    path = ROOT / value
    if path.exists() or path.is_symlink() or not path.parent.is_dir() or path.parent.resolve() != path.parent:
        raise ValueError("capture/token must be absent under existing canonical parent")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", type=Path, required=True)
    parser.add_argument("--packet-sha", required=True)
    args = parser.parse_args()
    if args.packet.stat().st_size > 65536 or args.packet.is_symlink():
        raise ValueError("packet type/cap")
    packet_body = args.packet.read_bytes()
    if hashlib.sha256(packet_body).hexdigest() != args.packet_sha:
        raise ValueError("root packet digest")
    packet = json.loads(packet_body)
    if packet["schema"] != "cycle06-one-build-wrapper@1" or packet["wrapperSha256"] != hashlib.sha256(Path(__file__).read_bytes()).hexdigest():
        raise ValueError("wrapper root binding")
    if packet["helper"]["source"] != HELPER:
        raise ValueError("wrong helper")
    bound(packet["helper"], 65536)
    plan = json.loads(bound(packet["plan"], 2 * 1024 * 1024))
    admission = json.loads(bound(packet["childAdmission"], 65536))
    if plan["status"] != "ROOT_ADMITTED_FINAL_INPUTS" or not plan["authority"]["visualAccepted"]:
        raise ValueError("draft/missing visual plan cannot launch")
    expected = {"schema": "cycle06-closed-build-admission@1", "planSha256": packet["plan"]["sha256"], "helperSha256": packet["helper"]["sha256"], "output": packet["output"], "scope": "ONE_FINAL_ARCHIVE_BUILD"}
    if admission != expected:
        raise ValueError("child root admission mismatch")
    output = Path(packet["output"])
    if output.parent != ROOT or not output.name.startswith("discovery-cycle06-final-") or output.exists() or output.is_symlink():
        raise ValueError("new final output required")
    paths = {key: target(packet[key]) for key in ("stdout", "stderr", "record", "token")}
    if len(set(paths.values())) != 4:
        raise ValueError("capture path collision")
    argv = ["python3.12", str(ROOT / HELPER), "build", "--plan", str(ROOT / packet["plan"]["source"]), "--plan-sha", packet["plan"]["sha256"], "--admission", str(ROOT / packet["childAdmission"]["source"]), "--admission-sha", packet["childAdmission"]["sha256"], "--out", packet["output"]]
    paths["token"].open("x").write(json.dumps({"scope": "ONE_FINAL_ARCHIVE_BUILD", "argv": argv}) + "\n")
    record = {"schema": "cycle06-one-build-actual@1", "argv": argv, "cwd": str(REPO), "spawnCount": 0, "startUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(), "actualExit": None, "actualSignal": None, "error": None}
    child = None
    try:
        with paths["stdout"].open("xb") as out, paths["stderr"].open("xb") as err:
            child = subprocess.Popen(argv, cwd=REPO, stdout=out, stderr=err)
            record.update(spawnCount=1, pid=child.pid)
            code = child.wait()
            record.update(actualExit=code if code >= 0 else None, actualSignal=-code if code < 0 else None)
    except BaseException as error:
        record["error"] = str(error)
        if child is not None and child.poll() is None:
            child.kill()
            child.wait()
            record.update(actualExit=child.returncode if child.returncode >= 0 else None, actualSignal=-child.returncode if child.returncode < 0 else None)
    record["endUTC"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for key in ("stdout", "stderr"):
        path = paths[key]
        if path.exists():
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(65536), b""):
                    digest.update(block)
            record[key] = {"path": packet[key], "bytes": path.stat().st_size, "sha256": digest.hexdigest()}
    paths["record"].open("x").write(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record, indent=2))
    if record["error"] or record["actualExit"] != 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
