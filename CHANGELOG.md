# Change Log

## [1.0.0] - 2026-10-15

- Initial release of the Lua Virtualizer extension for Visual Studio Code
- **Virtualize** command for Lua files (`.lua`, `.luau`, `.wlua`), opened as `virtualized.{original extension}`
- Action menu virtualizes only the selected function (VM, FSM, weave, or flat). Other named functions stay plain Lua and keep their original signatures
- `LUAVIRTUALIZER` highlighting, hover hints, and code completion
- Settings panel for the activation code, source dialect, virtualization mode, and every obfuscation strategy
- Demo mode when no activation code is configured (flat virtualization only, 1000 byte limit)
