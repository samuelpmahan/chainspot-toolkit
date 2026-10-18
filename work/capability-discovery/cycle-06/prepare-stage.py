"""E1524 prospective file-only DRAFT stager. NOT_RUN; no archive/final freeze.

This helper imports only Python stdlib, never project code, and spawns no child.
Its input is a separately root-reviewed exact allowlist and its SHA256.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat


def digest(body):
    return hashlib.sha256(body).hexdigest()


def relative_name(value):
    if not isinstance(value, str) or not value or "\\" in value:
        raise ValueError("invalid relative name")
    path = PurePosixPath(value)
    if path.is_absolute() or any(x in ("", ".", "..") for x in value.split("/")):
        raise ValueError("absolute/traversal/noncanonical name: " + value)
    return path


def regular_body(root, name):
    rel = relative_name(name)
    cursor = root
    for part in rel.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise ValueError("symlink source component: " + name)
    attrs = cursor.lstat()
    if not stat.S_ISREG(attrs.st_mode):
        raise ValueError("not a regular source file: " + name)
    return cursor.read_bytes(), "100755" if attrs.st_mode & 0o111 else "100644"


def verify_entry(root, entry):
    body, mode = regular_body(root, entry["source"])
    if len(body) != entry["bytes"] or digest(body) != entry["sha256"] or mode != entry["mode"]:
        raise ValueError("source size/hash/mode mismatch: " + entry["source"])
    return body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--allowlist", required=True)
    parser.add_argument("--allowlist-sha", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    workspace = Path(args.workspace)
    allowlist_path = Path(args.allowlist)
    output = Path(args.out)
    if not workspace.is_absolute() or str(workspace) != "/workspace/scratch/8528bb251845":
        raise ValueError("wrong workspace")
    if workspace.is_symlink() or workspace.resolve() != workspace:
        raise ValueError("noncanonical workspace")
    expected_allowlist = workspace / "chainspot-discovery-lab/work/capability-discovery/cycle-06/evidence-allowlist.v2.draft.json"
    if allowlist_path != expected_allowlist:
        raise ValueError("wrong allowlist path")
    allowlist_body, _ = regular_body(workspace, str(allowlist_path.relative_to(workspace)))
    if digest(allowlist_body) != args.allowlist_sha:
        raise ValueError("allowlist digest mismatch")
    plan = json.loads(allowlist_body)
    if plan["schema"] != "cycle06-draft-evidence-allowlist@1" or plan["status"] != "DRAFT_NOT_FINAL_FREEZE":
        raise ValueError("not the reviewed draft schema/status")
    if plan["workspaceRoot"] != str(workspace):
        raise ValueError("plan workspace mismatch")
    if not output.is_absolute() or output.exists() or output.is_symlink():
        raise ValueError("output must be absolute and absent")
    if output.parent.resolve() != output.parent or not output.parent.is_dir():
        raise ValueError("output parent must already exist, canonical, nonsymlink")
    if output.parent != workspace or not output.name.startswith("discovery-cycle06-stage-"):
        raise ValueError("output must be a fresh named stage directly under workspace")
    try:
        output.relative_to(workspace / "chainspot-discovery-lab")
    except ValueError:
        pass
    else:
        raise ValueError("stage must be outside source repository")
    destinations = set()
    for entry in plan["entries"]:
        name = str(relative_name(entry["destination"]))
        if name in destinations or name in ("DRAFT-ORIGIN-INDEX.json", "DRAFT-STAGE-RECEIPT.json"):
            raise ValueError("duplicate/reserved destination: " + name)
        destinations.add(name)
        if name.endswith(".test.mjs") or (name.startswith("capture/") and name.endswith(".mjs")):
            raise ValueError("unsafe Node-autodiscovery evidence suffix: " + name)
        verify_entry(workspace, entry)
    # All allowlisted sources are checked before exclusive creation. A later
    # failure preserves a visibly incomplete prefix; no automatic cleanup/retry.
    output.mkdir(mode=0o755)
    for entry in plan["entries"]:
        body = verify_entry(workspace, entry)
        target = output / entry["destination"]
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as handle:
            handle.write(body)
        os.chmod(target, 0o755 if entry["mode"] == "100755" else 0o644)
        copied, mode = regular_body(output, entry["destination"])
        if copied != body or mode != entry["mode"]:
            raise ValueError("staged bytes/mode mismatch: " + entry["destination"])
    for entry in plan["entries"]:
        verify_entry(workspace, entry)
    if expected_allowlist.read_bytes() != allowlist_body:
        raise ValueError("allowlist changed during staging")
    origin = {"schema": "cycle06-draft-stage-origins@1", "finalFreeze": False,
              "allowlistSha256": digest(allowlist_body), "entries": plan["entries"]}
    (output / "DRAFT-ORIGIN-INDEX.json").open("x").write(json.dumps(origin, indent=2) + "\n")
    receipt = {"schema": "cycle06-draft-stage-receipt@1", "status": "DRAFT_COPIES_ONLY",
               "allowlistSha256": digest(allowlist_body), "copiedFiles": len(destinations),
               "copiedBodyBytes": sum(e["bytes"] for e in plan["entries"]),
               "sourceRecheckedAfterCopy": True, "archivesCreated": 0,
               "finalManifestCreated": False, "projectImports": 0,
               "testsProducersQueries": 0, "scientificAcceptance": "UNKNOWN",
               "humanAcceptance": "UNKNOWN"}
    (output / "DRAFT-STAGE-RECEIPT.json").open("x").write(json.dumps(receipt, indent=2) + "\n")
    actual = {str(f.relative_to(output)) for f in output.rglob("*") if f.is_file()}
    if actual != destinations | {"DRAFT-ORIGIN-INDEX.json", "DRAFT-STAGE-RECEIPT.json"}:
        raise ValueError("unexpected staged file set")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
