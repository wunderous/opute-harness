# Profile recipe

`dsh plugin` creates `$DSH_HOME/profiles/opute-web`. After adding the bundle:

```sh
export OPUTE_HARNESS_PRESET_ROOT=/absolute/path/to/opute-harness/packages/bundle-opute-web/presets
export OPUTE_MCP_ENDPOINT=http://127.0.0.1:9091/mcp
export OPUTE_MCP_TOKEN=…

dsh plugin --profile opute-web add /absolute/path/to/opute-harness/packages/bundle-opute-web
dsh --profile opute-web --dump-config   # must list mcp-opute, opute-tool-lockdown, ui-opute
dsh --profile opute-web --no-open --port 3080 --trusted-host harness.opute.io
```

`includeShippedRoot` is false: the coding `standard` preset (bash/fs) is not on the roster.
