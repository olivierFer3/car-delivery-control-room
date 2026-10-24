"""Check every line of a problems file against schema.json.

Standard library only, so it supports the subset of JSON Schema that
schema.json uses: type, enum, const, required, additionalProperties,
properties, items, pattern, $ref to #/$defs. Use it before adding new data:
    python3 agent/problems/validate.py                       # data/problems.jsonl
    python3 agent/problems/validate.py my_new_problems.jsonl
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCHEMA = json.loads((HERE / "schema.json").read_text())
TYPES = {"object": dict, "array": list, "string": str, "null": type(None), "boolean": bool, "integer": int, "number": (int, float)}


def check(value, rule, path, errors):
    if "$ref" in rule:
        rule = SCHEMA["$defs"][rule["$ref"].split("/")[-1]]
    if "const" in rule and value != rule["const"]:
        errors.append(f"{path}: must be {rule['const']!r}")
    if "enum" in rule and value not in rule["enum"]:
        errors.append(f"{path}: {value!r} not in {rule['enum']}")
    if "type" in rule:
        allowed = rule["type"] if isinstance(rule["type"], list) else [rule["type"]]
        if not any(isinstance(value, TYPES[t]) and not (t in ("integer", "number") and isinstance(value, bool)) for t in allowed):
            errors.append(f"{path}: expected {'/'.join(allowed)}, got {type(value).__name__}")
            return
    if isinstance(value, str) and "pattern" in rule and not re.search(rule["pattern"], value):
        errors.append(f"{path}: {value!r} does not match {rule['pattern']}")
    if isinstance(value, dict):
        for key in rule.get("required", []):
            if key not in value:
                errors.append(f"{path}.{key}: missing")
        props = rule.get("properties", {})
        for key, item in value.items():
            if key in props:
                check(item, props[key], f"{path}.{key}", errors)
            elif rule.get("additionalProperties") is False:
                errors.append(f"{path}.{key}: unknown field")
    if isinstance(value, list) and "items" in rule:
        for index, item in enumerate(value):
            check(item, rule["items"], f"{path}[{index}]", errors)


def main(path):
    seen, bad = set(), 0
    lines = path.read_text(encoding="utf-8").splitlines()
    for number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        errors = []
        try:
            record = json.loads(line)
        except json.JSONDecodeError as error:
            errors.append(f"invalid JSON: {error}")
        else:
            check(record, SCHEMA, "$", errors)
            if record.get("id") in seen:
                errors.append(f"$.id: duplicate {record['id']}")
            seen.add(record.get("id"))
        if errors:
            bad += 1
            print(f"line {number}:\n  " + "\n  ".join(errors[:10]))
    print(f"{len(seen)} records, {bad} with errors")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "data" / "problems.jsonl"))
