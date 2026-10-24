"""Private dashboard bridge: one supplied case, bounded agent run, JSON output only.

The server strips solution/test.expected before sending input. No interactive
prompt, external action tool or reference-answer access is introduced here.
"""
import contextlib
import json
import sys

import case_agent
import mvp


def main():
    record = json.load(sys.stdin)
    if "solution" in record or "expected" in record.get("test", {}):
        raise ValueError("Reference answers must not be passed to the investigator")
    with contextlib.redirect_stdout(sys.stderr):
        mvp.RATE_LIMIT_RETRIES = 2
        case_agent.MAX_STEPS = 10
        mvp.pick_model()
        trace = case_agent.run(record)
    # Do not echo provider error bodies (which may include request content).
    if trace.get("error"):
        trace["error"] = "Provider request failed; no business conclusion inferred."
    print(json.dumps(trace, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (Exception, SystemExit):
        print(json.dumps({"steps": [], "finish": None, "violations": [], "error": "Provider unavailable or agent input invalid. Check local Groq configuration."}))
