## 2026-01-19 - Handling Attributes in createElement
**Learning:** The `createElement` utility blindly set all attributes, leading to `aria-label="undefined"` when passing undefined props. Standard `setAttribute` converts `undefined` to the string "undefined", which is invalid for ARIA attributes.
**Action:** Updated `createElement` to explicitly skip `null` and `undefined` values. Future components should rely on this safe behavior when conditionally passing attributes like `aria-label`.
