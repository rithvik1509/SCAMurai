"""Decoding of financial/blockchain instructions.

Future responsibility: decode calldata with ``eth-abi``/``eth-utils`` and
report only facts derivable from the bytes, such as the function selector,
arguments, target address, and whether an allowance is unlimited. Token
symbols, decimals, and real-world address identity must never be inferred
without a trusted source. The service never signs, broadcasts, or executes.

No decoding logic is implemented in this foundation step.
"""
