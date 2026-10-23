"""Promise vs. Action Engine.

Future responsibility: compare the message's promise, the action it requests,
and what a decoded instruction actually authorizes, then emit explainable
mismatch signals. Decoded facts are authoritative; model output may explain
them but may not contradict or invent transaction facts.

No comparison logic is implemented in this foundation step.
"""
